import { it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fixture } from "./support/db";
import { runOperation } from "../src/server/operations";
import type { Recipe } from "../src/shared";
import { LanguageProvider } from "../src/ui/language";
import { RecipeInstructions, RecipeStepsEditor } from "../src/ui/recipe-steps";
it("supports structured and legacy steps while preserving titles and durations on unchanged legacy updates", async () => {
  const f = fixture(),
    call = <T = Recipe>(name: string, input: unknown) =>
      runOperation(name, input, f.env, f.access) as Promise<T>;
  const fields = {
    name: "Pasta",
    ingredients: [{ name: "Nudeln", quantity: 200, unit: "g" }],
  };
  const steps = [
    {
      title: "Vorbereiten",
      description: "Wasser in einem großen Topf aufkochen.",
      durationMinutes: 5,
    },
    {
      title: "Kochen",
      description: "Nudeln zugeben und bissfest kochen.",
      durationMinutes: 10,
    },
  ];
  const recipe = await call("create_recipe", { ...fields, steps });
  expect(recipe.steps).toEqual(steps);
  expect(recipe.instructions).toEqual(steps.map((s) => s.description));
  // Existing rows receive an empty steps array from migration 0006.
  f.sqlite.prepare("UPDATE recipes SET steps='[]' WHERE id=?").run(recipe.id);
  expect((await call("get_recipe", { id: recipe.id })).steps).toEqual(
    steps.map((step) => ({
      title: "",
      description: step.description,
      durationMinutes: null,
    })),
  );
  await call("set_recipe_steps", { recipeId: recipe.id, steps });
  const { steps: _, ...legacy } = recipe;
  const updated = await call("update_recipe", {
    ...legacy,
    name: "Neue Pasta",
  });
  expect(updated.steps).toEqual(steps);
  const changed = await call("update_recipe", {
    ...legacy,
    instructions: ["Wasser erhitzen.", "Nudeln kochen."],
  });
  expect(changed.steps).toEqual([
    { title: "", description: "Wasser erhitzen.", durationMinutes: null },
    { title: "", description: "Nudeln kochen.", durationMinutes: null },
  ]);
  expect(
    (await call("set_recipe_steps", { recipeId: recipe.id, steps }))
      .instructions,
  ).toEqual(recipe.instructions);
  expect(
    await call("scale_recipe", { recipeId: recipe.id, servings: 4 }),
  ).toMatchObject({ steps, ingredients: [{ quantity: 400 }] });
  await expect(call("create_recipe", fields)).rejects.toThrow(
    "mindestens einen",
  );
  await expect(
    call("set_recipe_steps", { recipeId: recipe.id, steps: [] }),
  ).rejects.toThrow();
  await expect(
    call("set_recipe_steps", {
      recipeId: recipe.id,
      steps: [{ description: "Leer", durationMinutes: -1 }],
    }),
  ).rejects.toThrow();
  await expect(
    runOperation("set_recipe_steps", { recipeId: recipe.id, steps }, f.env, {
      ...f.access,
      agent: true,
      scopes: ["mcp:read"],
    }),
  ).rejects.toThrow("mcp:write");
});
it("presents numbered, independently editable cards and cooking controls in the selected language", () => {
  const steps = [
    {
      title: "Prepare",
      description: "Wash <b>the tomatoes</b>.",
      durationMinutes: 3,
    },
    {
      title: "Cook",
      description: "Simmer gently.\nStir occasionally.",
      durationMinutes: null,
    },
  ];
  const render = (children: React.ReactNode) =>
    renderToStaticMarkup(
      createElement(LanguageProvider, { initialLanguage: "en", children }),
    );
  const html = render(createElement(RecipeInstructions, { steps }));
  expect(html).toContain("Cooking mode");
  expect(html).toContain("0 of 2 steps completed");
  expect(html).toContain("Step 1 completed");
  expect(html).toContain("&lt;b&gt;the tomatoes&lt;/b&gt;");
  expect(html).toContain("3");
  expect(html).toContain("Simmer gently.\nStir occasionally.");
  const edit = render(
    createElement(RecipeStepsEditor, { steps, onChange() {} }),
  );
  expect(edit).toContain("Description for step 1");
  expect(edit).toContain("Move step 2 up");
  expect(edit).toContain("Add step");
});
