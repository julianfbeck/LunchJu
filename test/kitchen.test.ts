import { describe, it, expect } from "vitest";
import { fixture } from "./support/db";
import { runOperation } from "../src/server/operations";
import {
  mealPlanMissing,
  missingIngredients,
  recipeSchema,
  date,
} from "../src/shared";
import { hash, encrypt, decrypt } from "../src/server/security";

const recipe = {
  name: "Tomato pasta",
  servings: 2,
  ingredients: [
    { name: "Pasta", quantity: 200, unit: "g" },
    { name: "Tomato", quantity: 300, unit: "g" },
  ],
  instructions: ["Cook pasta.", "Mix with tomatoes."],
};
describe("Shared kitchen operations", () => {
  it("converts units, combines duplicate ingredients, and never converts volume into weight", () => {
    expect(
      missingIngredients(
        [
          { name: " Flour ", quantity: 500, unit: "g" },
          { name: "flour", quantity: 0.6, unit: "kg" },
        ],
        [
          {
            id: "x",
            name: "FLOUR",
            quantity: 1,
            unit: "kg",
            location: "Pantry",
            expiresOn: null,
            updatedAt: "",
          },
        ],
      ),
    ).toMatchObject([{ quantity: 100, unit: "g" }]);
    expect(
      missingIngredients(
        [{ name: "Milk", quantity: 1, unit: "l" }],
        [
          {
            id: "x",
            name: "Milk",
            quantity: 1,
            unit: "kg",
            location: "Fridge",
            expiresOn: null,
            updatedAt: "",
          },
        ],
      ),
    ).toMatchObject([{ quantity: 1 }]);
  });
  it("allocates pantry stock once, by meal date and expiry, using the earliest expiring lots first", () => {
    const pantry = [
      {
        id: "x",
        name: "Milk",
        quantity: 1,
        unit: "l" as const,
        location: "Fridge" as const,
        expiresOn: "2026-10-21",
        updatedAt: "",
      },
    ];
    expect(
      mealPlanMissing(
        [
          {
            date: "2026-10-20",
            ingredients: [{ name: "Milk", quantity: 250, unit: "ml" }],
          },
          {
            date: "2026-10-23",
            ingredients: [{ name: "Milk", quantity: 500, unit: "ml" }],
          },
        ],
        pantry,
      ),
    ).toMatchObject([{ quantity: 500, unit: "ml" }]);
  });
  it("scales and snapshots recipe ingredients, and preserves food history after recipe deletion", async () => {
    const f = fixture();
    const result = (await runOperation(
      "create_recipe",
      recipe,
      f.env,
      f.access,
    )) as { id: string };
    await runOperation(
      "plan_meal",
      { recipeId: result.id, date: "2026-10-20", slot: "dinner", servings: 4 },
      f.env,
      f.access,
    );
    await runOperation("delete_recipe", { id: result.id }, f.env, f.access);
    const meal = f.sqlite.prepare("SELECT * FROM meals").get()!;
    expect(meal.recipe_id).toBeNull();
    expect(meal.name).toBe("Tomato pasta");
    expect(JSON.parse(String(meal.ingredients))[0].quantity).toBe(400);
  });
  it("generates missing groceries without duplicating quantities on repeated calls", async () => {
    const f = fixture();
    const created = (await runOperation(
      "create_recipe",
      recipe,
      f.env,
      f.access,
    )) as { id: string };
    await runOperation(
      "add_pantry_item",
      { name: "Pasta", quantity: 0.1, unit: "kg" },
      f.env,
      f.access,
    );
    await runOperation(
      "plan_meal",
      { recipeId: created.id, date: "2026-10-20", slot: "dinner" },
      f.env,
      f.access,
    );
    for (let i = 0; i < 2; i++)
      await runOperation(
        "generate_groceries",
        { from: "2026-10-20", to: "2026-10-26" },
        f.env,
        f.access,
      );
    expect(
      f.sqlite
        .prepare("SELECT name,quantity FROM groceries ORDER BY name")
        .all(),
    ).toEqual([
      { name: "Pasta", quantity: 100 },
      { name: "Tomato", quantity: 300 },
    ]);
  });
  it("keeps the ingredient snapshot and eating time when editing a meal after its recipe was deleted", async () => {
    const f = fixture();
    const created = (await runOperation(
      "create_recipe",
      recipe,
      f.env,
      f.access,
    )) as { id: string };
    const planned = (await runOperation(
      "plan_meal",
      {
        recipeId: created.id,
        date: "2026-10-20",
        slot: "dinner",
        status: "eaten",
      },
      f.env,
      f.access,
    )) as { id: string; eatenAt: string };
    await runOperation("delete_recipe", { id: created.id }, f.env, f.access);
    await runOperation(
      "update_meal",
      {
        id: planned.id,
        name: "Pasta leftovers",
        date: "2026-10-20",
        slot: "dinner",
        status: "eaten",
        servings: 1,
      },
      f.env,
      f.access,
    );
    const updated = f.sqlite
      .prepare("SELECT * FROM meals WHERE id=?")
      .get(planned.id)!;
    expect(updated.eaten_at).toBe(planned.eatenAt);
    expect(JSON.parse(String(updated.ingredients))[0].quantity).toBe(100);
  });
  it("rejects reopening a grocery when an open entry with the same name and unit exists", async () => {
    const f = fixture();
    const first = (await runOperation(
      "add_grocery",
      { name: "Milk", quantity: 1, unit: "l" },
      f.env,
      f.access,
    )) as { id: string };
    await runOperation(
      "update_grocery",
      { id: first.id, name: "Milk", quantity: 1, unit: "l", checked: true },
      f.env,
      f.access,
    );
    await runOperation(
      "add_grocery",
      { name: "Milk", quantity: 2, unit: "l" },
      f.env,
      f.access,
    );
    await expect(
      runOperation(
        "update_grocery",
        {
          id: first.id,
          name: " Milk ",
          quantity: 1,
          unit: "l",
          checked: false,
        },
        f.env,
        f.access,
      ),
    ).rejects.toThrow("already exists");
    expect(
      f.sqlite.prepare("SELECT quantity FROM groceries WHERE checked=0").get()
        ?.quantity,
    ).toBe(2);
  });
  it("atomically combines manually added groceries and retains deletion tombstones for Bring", async () => {
    const f = fixture();
    for (let i = 0; i < 2; i++)
      await runOperation(
        "add_grocery",
        { name: " Tomatoes ", quantity: 2, unit: "piece" },
        f.env,
        f.access,
      );
    const row = f.sqlite.prepare("SELECT * FROM groceries").get()!;
    expect(row.quantity).toBe(4);
    f.sqlite
      .prepare("UPDATE groceries SET bring_uuid=? WHERE id=?")
      .run("bring-item", String(row.id));
    await runOperation("delete_grocery", { id: row.id }, f.env, f.access);
    expect(f.sqlite.prepare("SELECT * FROM groceries").all()).toHaveLength(0);
    expect(f.sqlite.prepare("SELECT * FROM bring_removals").all()).toHaveLength(
      1,
    );
  });
  it("enforces scopes and owner-only member management for agents", async () => {
    const f = fixture(),
      readOnly = { ...f.access, agent: true, scopes: ["mcp:read"] };
    await expect(
      runOperation("create_recipe", recipe, f.env, readOnly),
    ).rejects.toThrow("mcp:write");
    const member = {
      ...f.access,
      user: { ...f.access.user, role: "member" as const },
    };
    await expect(
      runOperation("create_invitation", {}, f.env, member),
    ).rejects.toThrow("home owner");
    expect(f.sqlite.prepare("SELECT * FROM recipes").all()).toHaveLength(0);
  });
  it("creates hashed invitations and refuses to delete a final passkey or disable the owner", async () => {
    const f = fixture();
    const result = (await runOperation(
      "create_invitation",
      {},
      f.env,
      f.access,
    )) as { url: string };
    const token = new URLSearchParams(new URL(result.url).hash.slice(1)).get(
      "invite",
    )!;
    expect(
      f.sqlite.prepare("SELECT token_hash FROM invitations").get()?.token_hash,
    ).toBe(await hash(token));
    f.sqlite
      .prepare("INSERT INTO passkeys(id,user_id,public_key) VALUES (?,?,?)")
      .run("key", f.access.user.id, "encoded");
    await expect(
      runOperation("delete_passkey", { credentialId: "key" }, f.env, f.access),
    ).rejects.toThrow("at least one");
    await runOperation(
      "set_member_active",
      { id: f.access.user.id, active: false },
      f.env,
      f.access,
    );
    expect(
      f.sqlite
        .prepare("SELECT active FROM users WHERE id=?")
        .get(f.access.user.id)?.active,
    ).toBe(1);
  });
  it("exports the catalog without encrypted integration credentials", async () => {
    const f = fixture();
    f.sqlite
      .prepare("INSERT INTO settings(key,value) VALUES (?,?)")
      .run("bring_credentials", "sensitive-ciphertext");
    const result = await runOperation("get_catalog", {}, f.env, f.access);
    expect(JSON.stringify(result)).not.toContain("sensitive-ciphertext");
    expect(result).toMatchObject({ bring: { connected: true } });
  });
  it("rejects invalid dates, negative stock and dangerous recipe source URLs", async () => {
    expect(date.safeParse("2026-02-31").success).toBe(false);
    expect(
      recipeSchema.safeParse({ ...recipe, sourceUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    const f = fixture();
    await expect(
      runOperation(
        "add_pantry_item",
        { name: "Milk", quantity: -2, unit: "l" },
        f.env,
        f.access,
      ),
    ).rejects.toThrow();
  });
  it("encrypts Bring tokens with authenticated encryption bound to this integration", async () => {
    const f = fixture();
    const encrypted = await encrypt(f.env, { token: "private-token" });
    expect(encrypted).not.toContain("private-token");
    expect(await decrypt(f.env, encrypted)).toEqual({ token: "private-token" });
    await expect(
      decrypt({ ...f.env, ENCRYPTION_KEY: "b".repeat(64) }, encrypted),
    ).rejects.toThrow();
  });
});
