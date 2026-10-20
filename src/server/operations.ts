import { z } from "zod";
import {
  id,
  date,
  text,
  recipeSchema,
  pantrySchema,
  mealSchema,
  grocerySchema,
  missingIngredients,
  normalizeName,
} from "../shared";
import {
  catalog,
  rows,
  loadRecipe,
  saveRecipe,
  savePantry,
  saveMeal,
  addGrocery,
  groceryPlan,
  deleteItem,
  saveSetting,
  audit,
} from "./db";
import {
  connectBring,
  bringLists,
  chooseBringList,
  syncBring,
  disconnectBring,
} from "./bring";
import { hash, randomToken } from "./security";
import { requireOwner } from "./auth";
import { HttpError, now, type Env, type Access } from "./types";

type Context = { env: Env; access: Access };
function operation<S extends z.ZodType>(
  description: string,
  scope: "mcp:read" | "mcp:write" | "mcp:admin",
  schema: S,
  handler: (input: z.infer<S>, context: Context) => Promise<unknown>,
) {
  return {
    description,
    scope,
    schema,
    async run(input: unknown, context: Context) {
      if (
        !context.access.scopes.includes("mcp:read") ||
        !context.access.scopes.includes(scope)
      )
        throw new HttpError(403, `Approve ${scope} for this action.`);
      return handler(schema.parse(input), context);
    },
  };
}
const empty = z.object({});
const target = z.object({ id });
const range = z
  .object({ from: date, to: date })
  .refine(
    (input) =>
      input.to >= input.from &&
      new Date(input.to).getTime() - new Date(input.from).getTime() <=
        62 * 86400000,
    "Choose an ordered date range of at most 62 days.",
  );
export const operations = {
  get_catalog: operation(
    "Read the complete home catalog: recipes, pantry, planned meals, food history, groceries, dietary preferences and Bring connection status. No credentials are returned.",
    "mcp:read",
    empty,
    async (_, c) => catalog(c.env, c.access),
  ),
  get_recipe: operation(
    "Read a recipe and its full ingredient list and cooking instructions.",
    "mcp:read",
    target,
    async (input, c) => loadRecipe(c.env, input.id),
  ),
  create_recipe: operation(
    "Add a recipe to the shared catalog. Quantities describe the base servings; choose explicit units.",
    "mcp:write",
    recipeSchema,
    async (input, c) => saveRecipe(c.env, input),
  ),
  update_recipe: operation(
    "Replace the editable fields of an existing recipe. Historical and planned meal ingredient snapshots are preserved.",
    "mcp:write",
    recipeSchema.extend({ id }),
    async ({ id, ...input }, c) => {
      await loadRecipe(c.env, id);
      return saveRecipe(c.env, input, id);
    },
  ),
  delete_recipe: operation(
    "Delete a recipe. Existing meals retain their name and ingredient snapshot.",
    "mcp:admin",
    target,
    async (input, c) => deleteItem(c.env, "recipes", input.id),
  ),
  check_ingredients: operation(
    "Check pantry availability for a recipe at the requested number of servings, excluding expired stock. Compatible metric and cooking volume units are converted; names must match.",
    "mcp:read",
    z.object({ recipeId: id, servings: z.number().positive().max(100) }),
    async (input, c) => {
      const recipe = await loadRecipe(c.env, input.recipeId),
        data = await catalog(c.env, c.access);
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: data.home.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const missing = missingIngredients(
        recipe.ingredients,
        data.pantry.filter(
          (item) => !item.expiresOn || item.expiresOn >= today,
        ),
        input.servings / recipe.servings,
      );
      return {
        canCook: missing.length === 0,
        recipe: recipe.name,
        servings: input.servings,
        missing,
      };
    },
  ),
  add_pantry_item: operation(
    "Store a pantry stock lot with a quantity, unit, storage location and optional expiry date.",
    "mcp:write",
    pantrySchema,
    async (input, c) => savePantry(c.env, input),
  ),
  update_pantry_item: operation(
    "Replace a pantry stock lot, including its remaining quantity. Quantity may be zero.",
    "mcp:write",
    pantrySchema.extend({ id }),
    async ({ id, ...input }, c) => {
      await exists(c.env, "pantry", id);
      return savePantry(c.env, input, id);
    },
  ),
  delete_pantry_item: operation(
    "Remove a pantry stock lot.",
    "mcp:admin",
    target,
    async (input, c) => deleteItem(c.env, "pantry", input.id),
  ),
  plan_meal: operation(
    "Schedule a recipe or named meal. Recipe ingredients are scaled to servings and snapshotted. Set status=eaten to log a meal already eaten. This does not change pantry stock.",
    "mcp:write",
    mealSchema,
    async (input, c) => saveMeal(c.env, input),
  ),
  update_meal: operation(
    "Edit or reschedule a meal. Updating a recipe meal refreshes its ingredient snapshot.",
    "mcp:write",
    mealSchema.safeExtend({ id }),
    async ({ id, ...input }, c) => {
      await exists(c.env, "meals", id);
      return saveMeal(c.env, input, id);
    },
  ),
  mark_meal_eaten: operation(
    "Record that a planned meal was eaten. Repeating this action preserves the original eating time. Adjust pantry stock explicitly when needed.",
    "mcp:write",
    target,
    async (input, c) => {
      await exists(c.env, "meals", input.id);
      await c.env.DB.prepare(
        "UPDATE meals SET status='eaten',eaten_at=COALESCE(eaten_at,?) WHERE id=?",
      )
        .bind(now(), input.id)
        .run();
      return { id: input.id, status: "eaten" };
    },
  ),
  delete_meal: operation(
    "Remove a planned meal or food-history entry.",
    "mcp:admin",
    target,
    async (input, c) => deleteItem(c.env, "meals", input.id),
  ),
  add_grocery: operation(
    "Add groceries. An existing unchecked entry with the same normalized name and unit has its quantity increased.",
    "mcp:write",
    grocerySchema,
    async (input, c) => addGrocery(c.env, input),
  ),
  update_grocery: operation(
    "Edit a grocery item or check it off. Checking an item does not implicitly add pantry stock.",
    "mcp:write",
    grocerySchema.extend({ id, checked: z.boolean() }),
    async (input, c) => {
      await exists(c.env, "groceries", input.id);
      const updated = await c.env.DB.prepare(
        "UPDATE groceries SET name=?,normalized_name=?,quantity=?,unit=?,notes=?,checked=?,updated_at=? WHERE id=? AND (?=1 OR NOT EXISTS(SELECT 1 FROM groceries WHERE checked=0 AND normalized_name=? AND unit=? AND id!=?)) RETURNING id",
      )
        .bind(
          input.name,
          normalizeName(input.name),
          input.quantity,
          input.unit,
          input.notes,
          +input.checked,
          now(),
          input.id,
          +input.checked,
          normalizeName(input.name),
          input.unit,
          input.id,
        )
        .first();
      if (!updated)
        throw new HttpError(
          409,
          "An open grocery with this name and unit already exists. Edit that entry or choose a different unit.",
        );
      return input;
    },
  ),
  delete_grocery: operation(
    "Remove a grocery. A previously synchronized Bring item is removed on the next explicit Bring sync.",
    "mcp:admin",
    target,
    async (input, c) => deleteItem(c.env, "groceries", input.id),
  ),
  generate_groceries: operation(
    "Generate missing groceries for planned meals in an inclusive date range. Aggregates ingredients, converts compatible units, subtracts unexpired pantry stock, and avoids adding duplicate quantities on retries.",
    "mcp:write",
    range,
    async (input, c) => groceryPlan(c.env, input.from, input.to),
  ),
  set_preferences: operation(
    "Set the household diet, allergies and cooking notes. These are shared with the agent for meal planning.",
    "mcp:write",
    z.object({
      diet: z.string().max(160),
      allergies: z.array(text).max(30),
      notes: z.string().max(3000),
    }),
    async (input, c) => {
      await saveSetting(c.env, "preferences", JSON.stringify(input));
      return input;
    },
  ),
  bring_connect: operation(
    "Connect the home Bring account. Owner only. Password is sent directly to Bring and is never stored; tokens are encrypted.",
    "mcp:admin",
    z.object({ email: z.email(), password: z.string().min(1).max(256) }),
    async (input, c) => {
      requireOwner(c.access.user);
      return connectBring(c.env, input.email, input.password);
    },
  ),
  bring_lists: operation(
    "List shopping lists available in the connected Bring account. Owner only.",
    "mcp:read",
    empty,
    async (_, c) => {
      requireOwner(c.access.user);
      return bringLists(c.env);
    },
  ),
  bring_choose_list: operation(
    "Choose the one Bring shopping list connected to this home. Owner only.",
    "mcp:admin",
    z.object({ listId: z.string().min(1).max(100) }),
    async (input, c) => {
      requireOwner(c.access.user);
      return chooseBringList(c.env, input.listId);
    },
  ),
  bring_sync: operation(
    "Explicitly sync groceries with Bring: push local additions, changes and removals; pull new items and completed purchases.",
    "mcp:write",
    empty,
    async (_, c) => syncBring(c.env),
  ),
  bring_disconnect: operation(
    "Disconnect Bring and erase stored tokens. Owner only.",
    "mcp:admin",
    empty,
    async (_, c) => {
      requireOwner(c.access.user);
      return disconnectBring(c.env);
    },
  ),
  list_members: operation(
    "List accounts in the single shared home. Owner only.",
    "mcp:read",
    empty,
    async (_, c) => {
      requireOwner(c.access.user);
      return {
        members: await rows(
          c.env.DB,
          "SELECT id,name,role,active FROM users ORDER BY created_at",
        ),
      };
    },
  ),
  create_invitation: operation(
    "Create a one-use invitation to register a household member with a passkey. Owner only. Link expires after 24 hours.",
    "mcp:admin",
    empty,
    async (_, c) => {
      requireOwner(c.access.user);
      const token = randomToken();
      await c.env.DB.prepare(
        "INSERT INTO invitations(token_hash,created_by,expires_at) VALUES (?,?,?)",
      )
        .bind(await hash(token), c.access.user.id, Date.now() + 86400000)
        .run();
      return {
        url: `${c.env.APP_ORIGIN}/#invite=${token}`,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
    },
  ),
  set_member_active: operation(
    "Enable or disable a member. Disabling revokes their browser sessions and blocks future OAuth token validation. The owner cannot be disabled.",
    "mcp:admin",
    z.object({ id, active: z.boolean() }),
    async (input, c) => {
      requireOwner(c.access.user);
      await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE users SET active=? WHERE id=? AND role!='owner'",
        ).bind(+input.active, input.id),
        c.env.DB.prepare(
          "DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND role!='owner' AND active=0)",
        ).bind(input.id, input.id),
      ]);
      return { id: input.id, active: input.active };
    },
  ),
  list_passkeys: operation(
    "List your registered passkeys. Public keys and credential material are not returned.",
    "mcp:read",
    empty,
    async (_, c) => ({
      passkeys: await rows(
        c.env.DB,
        "SELECT id,name,created_at FROM passkeys WHERE user_id=?",
        c.access.user.id,
      ),
    }),
  ),
  delete_passkey: operation(
    "Remove one of your passkeys. The final passkey cannot be deleted.",
    "mcp:admin",
    z.object({ credentialId: z.string().min(1).max(2048) }),
    async (input, c) => {
      const deleted = await c.env.DB.prepare(
        "DELETE FROM passkeys WHERE id=? AND user_id=? AND (SELECT COUNT(*) FROM passkeys WHERE user_id=?)>1 RETURNING id",
      )
        .bind(input.credentialId, c.access.user.id, c.access.user.id)
        .first();
      if (!deleted)
        throw new HttpError(
          409,
          "Keep at least one passkey, or select a passkey belonging to your account.",
        );
      return { deleted: input.credentialId };
    },
  ),
};
async function exists(
  env: Env,
  table: "pantry" | "meals" | "groceries",
  id: string,
) {
  if (
    !(await env.DB.prepare(`SELECT id FROM ${table} WHERE id=?`)
      .bind(id)
      .first())
  )
    throw new HttpError(404, "Item not found.");
}
export type OperationName = keyof typeof operations;
export async function runOperation(
  name: string,
  input: unknown,
  env: Env,
  access: Access,
) {
  if (!Object.hasOwn(operations, name))
    throw new HttpError(404, "Unknown operation.");
  const op = operations[name as OperationName],
    result = await op.run(input, { env, access });
  if (op.scope !== "mcp:read")
    await audit(env, access, name).catch(() =>
      console.error("Audit write failed."),
    );
  return result;
}
