import { describe, expect, it, vi } from "vitest";
import { fixture } from "./support/db";
import { runOperation } from "../src/server/operations";
import { addDays } from "../src/ui/api";
import type { Meal, Recipe } from "../src/shared";
import type { Access } from "../src/server/types";

function setup() {
  const f = fixture();
  const call = <T = unknown>(
    name: string,
    input: unknown,
    access: Access = f.access,
  ) => runOperation(name, input, f.env, access) as Promise<T>;
  const stored = (id: string) =>
    f.sqlite.prepare("SELECT * FROM meals WHERE id=?").get(id);
  return { ...f, call, stored };
}

describe("Moving a planned meal", () => {
  it.each(["changed", "deleted"])(
    "changes only its date after the recipe is %s",
    async (recipeState) => {
      const f = setup();
      try {
        const recipe = await f.call<Recipe>("create_recipe", {
          name: "Reispfanne",
          servings: 2,
          scalingNotes: "Ab sechs Personen in zwei Pfannen braten.",
          ingredients: [
            { name: "Reis", quantity: 200, unit: "g" },
            {
              name: "Wasser",
              quantity: 500,
              unit: "ml",
              scaling: { mode: "fixed", note: "Für diesen Topf." },
            },
          ],
          instructions: ["Reis kochen."],
        });
        const planned = await f.call<Meal>("plan_meal", {
          recipeId: recipe.id,
          date: "2026-10-23",
          slot: "dinner",
          servings: 3.5,
          notes: "Mit einem Salat für zwei Personen.",
        });
        if (recipeState === "changed")
          await f.call("update_recipe", {
            ...recipe,
            name: "Neue Reispfanne",
            scalingNotes: "Ein anderer Topf.",
            ingredients: [{ name: "Reis", quantity: 400, unit: "g" }],
          });
        else await f.call("delete_recipe", { id: recipe.id });

        const before = f.stored(planned.id)!;
        const moved = await f.call<Meal>("move_meal", {
          id: planned.id,
          date: "2026-10-24",
          // Unrecognized fields must not let callers alter saved quantities.
          servings: 99,
          notes: "Ignore the original plan.",
          status: "eaten",
        });
        expect(f.stored(planned.id)).toEqual({
          ...before,
          date: "2026-10-24",
        });
        expect(moved).toEqual({
          ...planned,
          date: "2026-10-24",
          recipeId: recipeState === "deleted" ? null : recipe.id,
        });
        expect(moved.ingredients.map((item) => item.quantity)).toEqual([
          350, 500,
        ]);
        expect(f.sqlite.prepare("SELECT * FROM pantry").all()).toEqual([]);
        expect(f.sqlite.prepare("SELECT * FROM groceries").all()).toEqual([]);
      } finally {
        f.sqlite.close();
      }
    },
  );

  it.each([
    ["2026-10-25", "2026-10-26"], // Europe/Berlin daylight-saving boundary.
    ["2026-10-31", "2026-11-01"],
    ["2026-12-31", "2027-01-01"],
    ["2028-02-28", "2028-02-29"],
    ["2028-02-29", "2028-03-01"],
  ])("moves %s to %s once even when retried", async (from, to) => {
    const f = setup();
    try {
      const planned = await f.call<Meal>("plan_meal", {
        name: "Reste essen",
        date: from,
        slot: "lunch",
        servings: 1,
      });
      const input = { id: planned.id, date: addDays(from, 1) };
      expect(input.date).toBe(to);
      const first = await f.call<Meal>("move_meal", input);
      const retried = await f.call<Meal>("move_meal", input);
      expect(first).toEqual({ ...planned, date: to });
      expect(retried).toEqual(first);
      expect(f.stored(planned.id)?.date).toBe(to);
    } finally {
      f.sqlite.close();
    }
  });

  it("rejects missing, eaten, invalid-date and insufficient-scope requests without changing the plan", async () => {
    const f = setup();
    try {
      const planned = await f.call<Meal>("plan_meal", {
        name: "Suppe",
        date: "2026-10-23",
        slot: "dinner",
      });
      const input = { id: planned.id, date: "2026-10-24" };
      const before = f.stored(planned.id);
      for (const date of ["2026-02-29", "2026-11-31", "tomorrow", "2026-2-3"])
        await expect(f.call("move_meal", { ...input, date })).rejects.toThrow();
      for (const scopes of [[], ["mcp:read"], ["mcp:write"]])
        await expect(
          f.call("move_meal", input, { ...f.access, scopes }),
        ).rejects.toMatchObject({ status: 403 });
      expect(f.stored(planned.id)).toEqual(before);
      await expect(
        f.call("move_meal", { ...input, id: crypto.randomUUID() }),
      ).rejects.toMatchObject({ status: 404 });
      await f.call("mark_meal_eaten", { id: planned.id });
      const eaten = f.stored(planned.id);
      await expect(f.call("move_meal", input)).rejects.toMatchObject({
        status: 409,
      });
      expect(f.stored(planned.id)).toEqual(eaten);
    } finally {
      f.sqlite.close();
    }
  });

  it("does not move a meal marked eaten just before its date update executes", async () => {
    const f = setup();
    const prepare = f.db.prepare.bind(f.db);
    try {
      const planned = await f.call<Meal>("plan_meal", {
        name: "Suppe",
        date: "2026-10-23",
        slot: "dinner",
      });
      const prepareSpy = vi.spyOn(f.db, "prepare").mockImplementation((sql) => {
        const statement = prepare(sql);
        if (sql.startsWith("UPDATE meals SET date=")) {
          const first = statement.first.bind(statement);
          vi.spyOn(statement, "first").mockImplementation(async () => {
            f.sqlite
              .prepare(
                "UPDATE meals SET status='eaten',eaten_at='2026-10-23T17:00:00Z' WHERE id=?",
              )
              .run(planned.id);
            return first();
          });
        }
        return statement;
      });
      try {
        await expect(
          f.call("move_meal", { id: planned.id, date: "2026-10-24" }),
        ).rejects.toMatchObject({ status: 409 });
        expect(f.stored(planned.id)).toMatchObject({
          date: "2026-10-23",
          status: "eaten",
          eaten_at: "2026-10-23T17:00:00Z",
        });
      } finally {
        prepareSpy.mockRestore();
      }
    } finally {
      f.sqlite.close();
    }
  });
});
