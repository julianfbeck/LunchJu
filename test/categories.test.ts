import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { fixture } from "./support/db";
import { runOperation } from "../src/server/operations";
import { handleMcp } from "../src/server/mcp";
import { RecipeFiltersBar } from "../src/ui/recipe-extras";
import {
  CategoryManager,
  CategoryPicker,
  RecipeCategories,
} from "../src/ui/recipe-categories";
import { LanguageProvider } from "../src/ui/language";
import { recipeFilterSchema } from "../src/recipes";
import type { Category, Recipe, Cookbook, Catalog } from "../src/shared";
function setup() {
  const f = fixture();
  const call = <T = unknown>(name: string, input: unknown = {}) =>
    runOperation(name, input, f.env, f.access) as Promise<T>;
  const create = (name: string, extra: object = {}) =>
    call<Recipe>("create_recipe", {
      name,
      ingredients: [{ name: "Tomaten", quantity: 200, unit: "g" }],
      steps: [{ description: "Tomaten schneiden." }],
      ...extra,
    });
  return { ...f, call, create };
}
it("manages shared categories, preserves memberships for older clients and safely removes associations", async () => {
  const f = setup();
  const a = await f.call<Category>("create_category", { name: "Sommerküche" });
  const b = await f.call<Category>("create_category", { name: "Winterküche" });
  await expect(
    f.call("create_category", { name: "FRÜHSTÜCK" }),
  ).rejects.toThrow("existiert bereits");
  await expect(
    f.call("create_category", { name: "  SOMMERKÜCHE  " }),
  ).rejects.toThrow("existiert bereits");
  const recipe = await f.create("Pasta", { categoryIds: [a.id, b.id, a.id] });
  expect(recipe.categoryIds.sort()).toEqual([a.id, b.id].sort());
  const { categoryIds: _, ...legacy } = recipe;
  expect(
    await f.call("update_recipe", { ...legacy, name: "Neue Pasta" }),
  ).toMatchObject({ categoryIds: recipe.categoryIds });
  await f.call("update_category", { id: a.id, name: "Warme Tage" });
  expect(await f.call("list_categories")).toMatchObject({
    categories: expect.arrayContaining([
      expect.objectContaining({ id: a.id, name: "Warme Tage", recipeCount: 1 }),
    ]),
  });
  await expect(
    f.call("set_recipe_categories", {
      recipeId: recipe.id,
      categoryIds: [crypto.randomUUID()],
    }),
  ).rejects.toThrow("Kategorie nicht gefunden");
  expect(
    (await f.call<Recipe>("get_recipe", { id: recipe.id })).categoryIds,
  ).toHaveLength(2);
  await expect(
    f.create("Invalid", { categoryIds: [crypto.randomUUID()] }),
  ).rejects.toThrow("Kategorie nicht gefunden");
  expect((await f.call<Catalog>("get_catalog")).recipes).toHaveLength(1);
  await f.call("delete_category", { id: a.id });
  expect(await f.call("get_recipe", { id: recipe.id })).toMatchObject({
    name: "Neue Pasta",
    categoryIds: [b.id],
    instructions: ["Tomaten schneiden."],
  });
  expect(
    await f.call("set_recipe_categories", {
      recipeId: recipe.id,
      categoryIds: [],
    }),
  ).toMatchObject({ categoryIds: [] });
  await expect(
    f.call("update_category", { id: crypto.randomUUID(), name: "Missing" }),
  ).rejects.toThrow("nicht gefunden");
});
it("combines category, cookbook, time, photos, tags, favorites and search filters without changing stored recipes", async () => {
  const f = setup();
  const a = await f.call<Category>("create_category", { name: "Pasta" });
  const book = await f.call<Cookbook>("create_cookbook", { name: "Alltag" });
  const pasta = await f.create("Tomatenpasta", {
    categoryIds: [a.id],
    cookbookIds: [book.id],
    minutes: 20,
    tags: ["Vegetarisch"],
    favorite: true,
  });
  f.sqlite
    .prepare("UPDATE recipes SET image_key='recipes/preview.png' WHERE id=?")
    .run(pasta.id);
  const soup = await f.create("Suppe", { categoryIds: [a.id], minutes: 45 });
  const other = await f.create("Brot", { minutes: 5 });
  const filtered = await f.call<{ recipes: Recipe[] }>("list_recipes", {
    categoryId: a.id,
    cookbookId: book.id,
    maxMinutes: 30,
    image: "with",
    tag: "Vegetarisch",
    favoritesOnly: true,
    search: "tomaten",
    sort: "quickest",
  });
  expect(filtered.recipes.map((r) => r.id)).toEqual([pasta.id]);
  expect(
    await f.call("list_recipes", { categoryId: a.id, maxMinutes: 15 }),
  ).toEqual({ recipes: [] });
  expect(
    (
      await f.call<{ recipes: Recipe[] }>("list_recipes", {
        image: "without",
        sort: "quickest",
      })
    ).recipes.map((r) => r.id),
  ).toEqual([other.id, soup.id]);
  expect(
    (
      await f.call<{ recipes: Recipe[] }>("list_recipes", {
        categoryId: "unfiled",
      })
    ).recipes.map((r) => r.id),
  ).toEqual([other.id]);
  expect(await f.call("get_recipe", { id: soup.id })).toMatchObject({
    minutes: 45,
    categoryIds: [a.id],
  });
  for (const input of [
    { maxMinutes: 0 },
    { maxMinutes: -1 },
    { maxMinutes: 2881 },
    { image: "invalid" },
    { categoryId: "invalid" },
  ])
    await expect(f.call("list_recipes", input)).rejects.toThrow();
});
it("exposes categories and combined filtering over MCP with read, write and deletion scopes", async () => {
  const f = setup();
  let scopes = ["mcp:read"];
  f.env.OAUTH_STATE = {
    idFromName: () => "test",
    get: () => ({
      fetch: async () => Response.json({ subject: f.access.user.id, scopes }),
    }),
  } as unknown as DurableObjectNamespace;
  const client = new Client({ name: "Category test", version: "1.0.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(f.env.APP_ORIGIN + "/mcp"), {
        requestInit: {
          headers: { Authorization: "Bearer test", Host: "kitchen.example" },
        },
        fetch: (input, init) =>
          handleMcp(new Request(input, init), f.env, {
            waitUntil() {},
          } as unknown as ExecutionContext),
      }),
    );
    expect(client.getInstructions()).toContain("set_recipe_categories");
    expect(
      (await client.callTool({ name: "list_categories", arguments: {} }))
        .isError,
    ).not.toBe(true);
    expect(
      (
        await client.callTool({
          name: "create_category",
          arguments: { name: "Schnell" },
        })
      ).isError,
    ).toBe(true);
    scopes = ["mcp:read", "mcp:write"];
    const created = await client.callTool({
      name: "create_category",
      arguments: { name: "Schnell" },
    });
    expect(created.isError).not.toBe(true);
    const category = created.structuredContent as unknown as Category;
    const recipe = await f.create("Pasta");
    const saved = await client.callTool({
      name: "set_recipe_categories",
      arguments: { recipeId: recipe.id, categoryIds: [category.id] },
    });
    expect(saved.structuredContent).toMatchObject({
      categoryIds: [category.id],
    });
    expect(
      (
        await client.callTool({
          name: "list_recipes",
          arguments: { categoryId: category.id, maxMinutes: 30 },
        })
      ).structuredContent,
    ).toMatchObject({ recipes: [{ id: recipe.id }] });
    expect(
      (
        await client.callTool({
          name: "delete_category",
          arguments: { id: category.id },
        })
      ).isError,
    ).toBe(true);
    scopes.push("mcp:admin");
    expect(
      (
        await client.callTool({
          name: "delete_category",
          arguments: { id: category.id },
        })
      ).isError,
    ).not.toBe(true);
  } finally {
    await client.close();
  }
});
it("renders category management and combined mobile filters in the selected language with escaped names", async () => {
  const f = setup();
  const category = await f.call<Category>("create_category", {
    name: "<b>Salate</b>",
  });
  const recipe = await f.create("Pasta", { categoryIds: [category.id] });
  const render = (children: React.ReactNode) =>
    renderToStaticMarkup(
      createElement(LanguageProvider, { initialLanguage: "en", children }),
    );
  const html = render(
    createElement(RecipeFiltersBar, {
      filters: recipeFilterSchema.parse({}),
      setFilters() {},
      cookbooks: [],
      categories: [category],
      recipes: [recipe],
      count: 1,
    }),
  );
  for (const label of [
    "Category",
    "Uncategorized",
    "Maximum preparation time",
    "With photos only",
    "Without photos only",
    "Reset filters",
  ])
    expect(html).toContain(label);
  expect(html).toContain("&lt;b&gt;Salate&lt;/b&gt;");
  expect(
    render(
      createElement(CategoryManager, {
        categories: [category],
        recipes: [recipe],
        async onChanged() {},
      }),
    ),
  ).toContain("Manage categories");
  expect(
    render(
      createElement(CategoryPicker, {
        categories: [category],
        selected: [category.id],
        onChange() {},
      }),
    ),
  ).toContain("checked");
  expect(
    render(
      createElement(RecipeCategories, {
        categories: [category],
        recipe,
        onSaved() {},
      }),
    ),
  ).toContain("Save categories");
});
