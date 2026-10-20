import { describe, it, expect } from "vitest";
import { fixture } from "./support/db";
import { runOperation } from "../src/server/operations";
import { scaleIngredients } from "../src/scaling";
import { recipeSchema, type Recipe, type Meal } from "../src/shared";

const base = {
  name: "Reispfanne",
  servings: 2,
  minutes: 20,
  ingredients: [
    { name: "Reis", quantity: 200, unit: "g" },
    { name: "Wasser", quantity: 500, unit: "ml" },
    { name: "Eier", quantity: 2.5, unit: "piece" },
  ],
  instructions: ["Reis kochen und mit den Eiern braten."],
};
const rules = [
  {
    ingredientIndex: 1,
    ingredientName: "Wasser",
    ingredientUnit: "ml",
    mode: "fixed",
    note: "Für diesen Topf gleich lassen.",
  },
  {
    ingredientIndex: 2,
    ingredientName: "Eier",
    ingredientUnit: "piece",
    mode: "linear",
    roundUpTo: 1,
    note: "Ganze Eier verwenden.",
  },
];
async function setup() {
  const f = fixture();
  const call = (name: string, input: unknown) =>
    runOperation(name, input, f.env, f.access);
  const recipe = (await call("create_recipe", base)) as Recipe;
  const configured = (await call("set_recipe_scaling", {
    recipeId: recipe.id,
    notes: "Ab 6 Personen in zwei Pfannen braten.",
    rules,
  })) as Recipe;
  return { ...f, call, recipe: configured };
}

describe("Recipe serving rules", () => {
  it("scales ordinary amounts, preserves fixed amounts, and rounds in ingredient units", async () => {
    const f = await setup();
    expect(scaleIngredients(f.recipe, 3).map((i) => i.quantity)).toEqual([
      300, 500, 4,
    ]);
    expect(scaleIngredients(f.recipe, 1).map((i) => i.quantity)).toEqual([
      100, 500, 2,
    ]);
    expect(scaleIngredients(f.recipe, 4).map((i) => i.quantity)).toEqual([
      400, 500, 5,
    ]);
    const readOnly = { ...f.access, agent: true, scopes: ["mcp:read"] };
    const result = await runOperation(
      "scale_recipe",
      { recipeId: f.recipe.id, servings: 4 },
      f.env,
      readOnly,
    );
    expect(result).toMatchObject({
      baseServings: 2,
      servings: 4,
      notes: f.recipe.scalingNotes,
      minutes: 20,
    });
    expect(
      ((await f.call("get_recipe", { id: f.recipe.id })) as Recipe)
        .ingredients[0].quantity,
    ).toBe(200);
    await expect(
      runOperation(
        "set_recipe_scaling",
        { recipeId: f.recipe.id, rules: [] },
        f.env,
        readOnly,
      ),
    ).rejects.toThrow("mcp:write");
  });
  it("uses the same rules for stock checks, meal snapshots and generated shopping", async () => {
    const f = await setup();
    for (const item of [
      { name: "Reis", quantity: 400, unit: "g" },
      { name: "Wasser", quantity: 500, unit: "ml" },
      { name: "Eier", quantity: 4, unit: "piece" },
    ])
      await f.call("add_pantry_item", item);
    const availability = await f.call("check_ingredients", {
      recipeId: f.recipe.id,
      servings: 4,
    });
    expect(availability).toMatchObject({
      canCook: false,
      missing: [{ name: "Eier", quantity: 1, required: 5, available: 4 }],
    });
    const meal = (await f.call("plan_meal", {
      recipeId: f.recipe.id,
      servings: 4,
      date: "2099-10-20",
      slot: "dinner",
    })) as Meal;
    expect(meal.ingredients.map((i) => i.quantity)).toEqual([400, 500, 5]);
    expect(meal.scalingNotes).toBe(f.recipe.scalingNotes);
    await f.call("set_recipe_scaling", { recipeId: f.recipe.id, rules: [] });
    const catalog = (await f.call("get_catalog", {})) as { meals: Meal[] };
    expect(catalog.meals[0].ingredients.map((i) => i.quantity)).toEqual([
      400, 500, 5,
    ]);
    expect(catalog.meals[0].scalingNotes).toBe(f.recipe.scalingNotes);
    await f.call("generate_groceries", {
      from: "2099-10-20",
      to: "2099-10-20",
    });
    expect(
      f.sqlite.prepare("SELECT name,quantity FROM groceries").all(),
    ).toMatchObject([{ name: "Eier", quantity: 1 }]);
  });
  it("rescales from the original snapshot after deletion without compounding rounding", async () => {
    const f = await setup();
    const meal = (await f.call("plan_meal", {
      recipeId: f.recipe.id,
      servings: 3,
      date: "2026-10-20",
      slot: "dinner",
      status: "eaten",
    })) as Meal;
    expect(meal.ingredients[2].quantity).toBe(4);
    await f.call("delete_recipe", { id: f.recipe.id });
    for (const servings of [4, 3, 4]) {
      const edited = (await f.call("update_meal", {
        id: meal.id,
        name: meal.name,
        date: meal.date,
        slot: meal.slot,
        status: "eaten",
        servings,
      })) as Meal;
      expect(edited.ingredients[2].quantity).toBe(servings === 4 ? 5 : 4);
      expect(edited.ingredients[1].quantity).toBe(500);
      expect(edited.eatenAt).toBe(meal.eatenAt);
      expect(edited.scalingNotes).toBe(f.recipe.scalingNotes);
    }
  });
  it("retains rules and notes when an older client updates a recipe without scaling fields", async () => {
    const f = await setup();
    const updated = (await f.call("update_recipe", {
      ...base,
      id: f.recipe.id,
      name: "Neue Reispfanne",
    })) as Recipe;
    expect(updated.scalingNotes).toBe(f.recipe.scalingNotes);
    expect(updated.ingredients[1].scaling?.mode).toBe("fixed");
    const reset = (await f.call("set_recipe_scaling", {
      recipeId: f.recipe.id,
      rules: [],
    })) as Recipe;
    expect(reset.scalingNotes).toBe("");
    expect(scaleIngredients(reset, 4).map((i) => i.quantity)).toEqual([
      400, 1000, 5,
    ]);
  });
  it("rejects stale ingredient references, duplicate rules, invalid increments and invalid servings", async () => {
    const f = await setup();
    for (const invalid of [
      [{ ...rules[0], ingredientIndex: 99 }],
      [{ ...rules[0], ingredientName: "Andere Zutat" }],
      [{ ...rules[0], ingredientUnit: "l" }],
      [rules[0], rules[0]],
      [{ ...rules[0], roundUpTo: 0 }],
      [{ ...rules[0], roundUpTo: -1 }],
    ])
      await expect(
        f.call("set_recipe_scaling", { recipeId: f.recipe.id, rules: invalid }),
      ).rejects.toThrow();
    for (const servings of [0, -1, 101, NaN, Infinity]) {
      await expect(
        f.call("scale_recipe", { recipeId: f.recipe.id, servings }),
      ).rejects.toThrow();
      await expect(
        f.call("check_ingredients", { recipeId: f.recipe.id, servings }),
      ).rejects.toThrow();
    }
    expect(
      ((await f.call("get_recipe", { id: f.recipe.id })) as Recipe)
        .scalingNotes,
    ).toBe(f.recipe.scalingNotes);
    await expect(
      f.call("set_recipe_scaling", {
        recipeId: crypto.randomUUID(),
        rules: [],
      }),
    ).rejects.toThrow("nicht gefunden");
    expect(
      recipeSchema.safeParse({
        ...base,
        ingredients: [
          { ...base.ingredients[0], scaling: { mode: "execute-code" } },
        ],
      }).success,
    ).toBe(false);
  });
  it("does not round up an extra increment due to floating point noise", () => {
    const recipe = recipeSchema.parse({
      ...base,
      servings: 1,
      ingredients: [
        {
          name: "Gewürz",
          quantity: 0.28,
          unit: "g",
          scaling: { roundUpTo: 0.2 },
        },
      ],
    });
    expect(scaleIngredients(recipe, 5)[0].quantity).toBe(1.4);
  });
  it("continues to scale older meal records without a recipe snapshot", async () => {
    const f = fixture();
    const mealId = crypto.randomUUID();
    f.sqlite
      .prepare(
        "INSERT INTO meals(id,name,date,slot,servings,ingredients,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run(
        mealId,
        "Altes Rezept",
        "2026-10-20",
        "dinner",
        2,
        JSON.stringify([{ name: "Reis", quantity: 200, unit: "g" }]),
        "2026-10-20T12:00:00Z",
      );
    const edited = (await runOperation(
      "update_meal",
      {
        id: mealId,
        name: "Altes Rezept",
        date: "2026-10-20",
        slot: "dinner",
        servings: 4,
      },
      f.env,
      f.access,
    )) as Meal;
    expect(edited.ingredients[0].quantity).toBe(400);
    expect(edited.scalingNotes).toBe("");
  });
  it("rejects unrepresentable scaled quantities before saving a meal", async () => {
    const f = fixture();
    const recipe = (await runOperation(
      "create_recipe",
      { ...base, servings: 1e-308 },
      f.env,
      f.access,
    )) as Recipe;
    await expect(
      runOperation(
        "plan_meal",
        {
          recipeId: recipe.id,
          servings: 100,
          date: "2026-10-20",
          slot: "dinner",
        },
        f.env,
        f.access,
      ),
    ).rejects.toThrow();
    expect(f.sqlite.prepare("SELECT * FROM meals").all()).toHaveLength(0);
  });
});
