import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { fixture } from "./support/db";
import { runOperation } from "../src/server/operations";
import { handleMcp } from "../src/server/mcp";
import { LanguageProvider } from "../src/ui/language";
import {
  RecipeComments,
  RecipeGallery,
  RecipeFiltersBar,
} from "../src/ui/recipe-extras";
import { recipeFilterSchema } from "../src/recipes";
import type { Cookbook, Recipe, Catalog } from "../src/shared";

function setup() {
  const f = fixture();
  const call = <T = unknown>(name: string, input: unknown = {}) =>
    runOperation(name, input, f.env, f.access) as Promise<T>;
  const create = (name = "Pasta", extra: object = {}) =>
    call<Recipe>("create_recipe", {
      name,
      ingredients: [{ name: "Tomaten", quantity: 200, unit: "g" }],
      instructions: ["Kochen."],
      ...extra,
    });
  return { ...f, call, create };
}
describe("Shared cookbooks and tips", () => {
  it("supports multiple memberships, combined filters, safe deletion and preservation by older agents", async () => {
    const f = setup();
    const a = await f.call<Cookbook>("create_cookbook", { name: "Alltag" });
    const b = await f.call<Cookbook>("create_cookbook", {
      name: "Lieblingsrezepte",
      description: "Für alle",
    });
    const recipe = await f.create("Tomatenpasta", {
      cookbookIds: [a.id, b.id, a.id],
      tags: ["Vegetarisch"],
      favorite: true,
      minutes: 20,
    });
    expect(recipe.cookbookIds.sort()).toEqual([a.id, b.id].sort());
    await f.create("Suppe", { minutes: 10 });
    expect(
      await f.call("list_recipes", {
        cookbookId: a.id,
        search: "tomaten",
        tag: "Vegetarisch",
        favoritesOnly: true,
        sort: "quickest",
      }),
    ).toMatchObject({ recipes: [{ id: recipe.id }] });
    expect(
      await f.call("list_recipes", { cookbookId: "unfiled" }),
    ).toMatchObject({ recipes: [{ name: "Suppe" }] });
    expect(
      (
        await f.call<{ recipes: Recipe[] }>("list_recipes", {
          sort: "quickest",
        })
      ).recipes.map((r) => r.name),
    ).toEqual(["Suppe", "Tomatenpasta"]);
    const { cookbookIds: _, ...legacy } = recipe;
    expect(
      await f.call("update_recipe", { ...legacy, name: "Neue Pasta" }),
    ).toMatchObject({ cookbookIds: recipe.cookbookIds });
    await expect(
      f.create("Ungültig", { cookbookIds: [crypto.randomUUID()] }),
    ).rejects.toThrow("Kochbuch nicht gefunden");
    expect((await f.call<Catalog>("get_catalog")).recipes).toHaveLength(2);
    await expect(f.call("create_cookbook", { name: "alltag" })).rejects.toThrow(
      "existiert bereits",
    );
    await f.call("update_cookbook", { ...a, name: "Schnell & einfach" });
    expect(await f.call("list_cookbooks")).toMatchObject({
      cookbooks: expect.arrayContaining([
        expect.objectContaining({
          id: a.id,
          name: "Schnell & einfach",
          recipeCount: 1,
        }),
      ]),
    });
    await expect(
      f.call("set_recipe_cookbooks", {
        recipeId: recipe.id,
        cookbookIds: [crypto.randomUUID()],
      }),
    ).rejects.toThrow();
    expect(
      (await f.call<Recipe>("get_recipe", { id: recipe.id })).cookbookIds,
    ).toHaveLength(2);
    await f.call("delete_cookbook", { id: a.id });
    expect(await f.call("get_recipe", { id: recipe.id })).toMatchObject({
      name: "Neue Pasta",
      cookbookIds: [b.id],
    });
    expect(
      await f.call("set_recipe_cookbooks", {
        recipeId: recipe.id,
        cookbookIds: [],
      }),
    ).toMatchObject({ cookbookIds: [] });
  });
  it("attributes comments to the authenticated user and agent and enforces author and scope permissions", async () => {
    const f = setup(),
      recipe = await f.create();
    const memberId = crypto.randomUUID();
    f.sqlite
      .prepare("INSERT INTO users(id,name,role) VALUES (?,?,'member')")
      .run(memberId, "Sam");
    const member = {
      ...f.access,
      agent: true,
      user: {
        ...f.access.user,
        id: memberId,
        name: "Sam",
        role: "member" as const,
      },
    };
    const updated = (await runOperation(
      "add_recipe_comment",
      {
        recipeId: recipe.id,
        body: "  Etwas Kochwasser aufheben.  ",
        authorId: f.access.user.id,
        agent: false,
      },
      f.env,
      member,
    )) as Recipe;
    const comment = updated.comments[0];
    expect(comment).toMatchObject({
      authorId: memberId,
      authorName: "Sam",
      agent: true,
      body: "Etwas Kochwasser aufheben.",
    });
    const input = {
      recipeId: recipe.id,
      commentId: comment.id,
      body: "Mit frischem Basilikum.",
    };
    await runOperation("update_recipe_comment", input, f.env, member);
    const ownerTip = await f.call<Recipe>("add_recipe_comment", {
      recipeId: recipe.id,
      body: "Eigener Tipp",
    });
    await expect(
      runOperation(
        "update_recipe_comment",
        {
          ...input,
          commentId: ownerTip.comments.find(
            (c) => c.authorId === f.access.user.id,
          )!.id,
        },
        f.env,
        member,
      ),
    ).rejects.toThrow("eigene Kommentare");
    const other = await f.create("Anderes Rezept");
    await expect(
      f.call("update_recipe_comment", { ...input, recipeId: other.id }),
    ).rejects.toThrow("Kommentar nicht gefunden");
    await expect(
      runOperation(
        "add_recipe_comment",
        { recipeId: recipe.id, body: "Tipp" },
        f.env,
        { ...member, scopes: ["mcp:read"] },
      ),
    ).rejects.toThrow("mcp:write");
    await expect(
      runOperation("delete_recipe_comment", input, f.env, {
        ...member,
        scopes: ["mcp:read", "mcp:write"],
      }),
    ).rejects.toThrow("mcp:admin");
    await expect(
      f.call("add_recipe_comment", { recipeId: recipe.id, body: "  " }),
    ).rejects.toThrow();
    await f.call("update_recipe_comment", input); // Owner may moderate another author's tip.
    const loaded = await f.call<Recipe>("get_recipe", { id: recipe.id });
    expect(loaded.comments.find((c) => c.id === comment.id)).toMatchObject({
      authorId: memberId,
      agent: true,
      body: input.body,
    });
    expect(
      (await f.call<Catalog>("get_catalog")).recipes.find(
        (item) => item.id === recipe.id,
      )!.comments,
    ).toHaveLength(2);
    expect(
      f.sqlite
        .prepare(
          "SELECT actor FROM audit_log WHERE operation='add_recipe_comment' AND actor LIKE 'agent:%'",
        )
        .get()?.actor,
    ).toBe(`agent:${memberId}`);
    await f.call("delete_recipe_comment", input);
    expect(
      (await f.call<Recipe>("get_recipe", { id: recipe.id })).comments,
    ).toHaveLength(1);
    await f.call("delete_recipe", { id: recipe.id });
    expect(
      f.sqlite.prepare("SELECT COUNT(*) AS n FROM recipe_comments").get()?.n,
    ).toBe(0);
  });
  it("exposes cookbook and comment actions over authenticated MCP and honors read-only grants", async () => {
    const f = setup();
    let scopes = ["mcp:read", "mcp:write", "mcp:admin"];
    f.env.OAUTH_STATE = {
      idFromName: () => "test",
      get: () => ({
        fetch: async () => Response.json({ subject: f.access.user.id, scopes }),
      }),
    } as unknown as DurableObjectNamespace;
    const client = new Client({ name: "Cookbook test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(f.env.APP_ORIGIN + "/mcp"),
      {
        requestInit: {
          headers: { Authorization: "Bearer test", Host: "kitchen.example" },
        },
        fetch: (input, init) =>
          handleMcp(new Request(input, init), f.env, {
            waitUntil() {},
          } as unknown as ExecutionContext),
      },
    );
    try {
      await client.connect(transport);
      const tools = (await client.listTools()).tools.map((tool) => tool.name);
      for (const tool of [
        "list_cookbooks",
        "create_cookbook",
        "update_cookbook",
        "delete_cookbook",
        "list_recipes",
        "set_recipe_cookbooks",
        "add_recipe_comment",
        "update_recipe_comment",
        "delete_recipe_comment",
        "update_recipe_image",
      ])
        expect(tools).toContain(tool);
      const book = await client.callTool({
        name: "create_cookbook",
        arguments: { name: "Wochenende" },
      });
      expect(book.isError).not.toBe(true);
      const recipe = await f.create("Pasta", {
        cookbookIds: [(book.structuredContent as unknown as Cookbook).id],
      });
      const tip = await client.callTool({
        name: "add_recipe_comment",
        arguments: { recipeId: recipe.id, body: "Nudeln bissfest kochen." },
      });
      expect(tip.structuredContent).toMatchObject({
        comments: [{ agent: true, authorId: f.access.user.id }],
      });
      scopes = ["mcp:read"];
      const denied = await client.callTool({
        name: "create_cookbook",
        arguments: { name: "Nicht erlaubt" },
      });
      expect(denied.isError).toBe(true);
      expect((await f.call<Catalog>("get_catalog")).cookbooks).toHaveLength(1);
    } finally {
      await client.close();
    }
  });
  it("renders translated controls and plain-text tips safely", async () => {
    const f = setup(),
      recipe = await f.create();
    const updated = await f.call<Recipe>("add_recipe_comment", {
      recipeId: recipe.id,
      body: '<script>alert("tip")</script> & lecker',
    });
    const render = (element: React.ReactNode) =>
      renderToStaticMarkup(
        createElement(LanguageProvider, {
          initialLanguage: "en",
          children: element,
        }),
      );
    const html = render(
      createElement(RecipeComments, {
        recipe: updated,
        user: f.access.user,
        onSaved() {},
      }),
    );
    expect(html).toContain("Tips &amp; comments");
    expect(html).toContain("Add tip");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    const gallery = render(
      createElement(RecipeGallery, { recipe, onSaved() {} }),
    );
    expect(gallery).toContain("Add photos");
    const filters = render(
      createElement(RecipeFiltersBar, {
        filters: recipeFilterSchema.parse({}),
        setFilters() {},
        cookbooks: [],
        recipes: [recipe],
        count: 1,
      }),
    );
    expect(filters).toContain("Unfiled");
    expect(filters).toContain("Quickest first");
    expect(filters).toContain("1 of 1 recipes");
  });
});
