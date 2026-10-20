import type { z } from "zod";
import {
  normalizeName,
  mealPlanMissing,
  type Catalog,
  type Recipe,
  type PantryItem,
  type Meal,
  type Grocery,
  recipeSchema,
  pantrySchema,
  mealSchema,
  grocerySchema,
} from "../shared";
import { HttpError, now, type Env, type Access } from "./types";

type Row = Record<string, unknown>;
const json = <T>(value: unknown): T => JSON.parse(String(value));
export async function rows(db: D1Database, sql: string, ...values: unknown[]) {
  return (
    await db
      .prepare(sql)
      .bind(...values)
      .all<Row>()
  ).results;
}
export function recipe(row: Row): Recipe {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    servings: Number(row.servings),
    minutes: Number(row.minutes),
    ingredients: json(row.ingredients),
    instructions: json(row.instructions),
    tags: json(row.tags),
    sourceUrl: String(row.source_url),
    favorite: !!row.favorite,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
export function pantryItem(row: Row): PantryItem {
  return {
    id: String(row.id),
    name: String(row.name),
    quantity: Number(row.quantity),
    unit: row.unit as PantryItem["unit"],
    location: row.location as PantryItem["location"],
    expiresOn: row.expires_on ? String(row.expires_on) : null,
    updatedAt: String(row.updated_at),
  };
}
export function meal(row: Row): Meal {
  return {
    id: String(row.id),
    recipeId: row.recipe_id ? String(row.recipe_id) : null,
    name: String(row.name),
    date: String(row.date),
    slot: row.slot as Meal["slot"],
    servings: Number(row.servings),
    ingredients: json(row.ingredients),
    status: row.status as Meal["status"],
    notes: String(row.notes),
    eatenAt: row.eaten_at ? String(row.eaten_at) : null,
  };
}
export function grocery(row: Row): Grocery {
  return {
    id: String(row.id),
    name: String(row.name),
    quantity: Number(row.quantity),
    unit: row.unit as Grocery["unit"],
    notes: String(row.notes),
    checked: !!row.checked,
    bringUuid: row.bring_uuid ? String(row.bring_uuid) : null,
    updatedAt: String(row.updated_at),
  };
}
export async function setting(env: Env, key: string) {
  return (
    (
      await env.DB.prepare("SELECT value FROM settings WHERE key=?")
        .bind(key)
        .first<{ value: string }>()
    )?.value ?? null
  );
}
export async function saveSetting(env: Env, key: string, value: string) {
  await env.DB.prepare(
    "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  )
    .bind(key, value)
    .run();
}
export async function catalog(
  env: Env,
  access: Access,
): Promise<Catalog & { preferences: unknown }> {
  const [recipes, pantry, meals, groceries, connected, listId, preferences] =
    await Promise.all([
      rows(env.DB, "SELECT * FROM recipes ORDER BY favorite DESC,name"),
      rows(
        env.DB,
        "SELECT * FROM pantry ORDER BY expires_on IS NULL,expires_on,name",
      ),
      rows(env.DB, "SELECT * FROM meals ORDER BY date,slot"),
      rows(env.DB, "SELECT * FROM groceries ORDER BY checked,name"),
      setting(env, "bring_credentials"),
      setting(env, "bring_list"),
      setting(env, "preferences"),
    ]);
  return {
    recipes: recipes.map(recipe),
    pantry: pantry.map(pantryItem),
    meals: meals.map(meal),
    groceries: groceries.map(grocery),
    home: {
      name: env.HOME_NAME ?? "Our kitchen",
      timeZone: env.TIME_ZONE ?? "Europe/Berlin",
    },
    bring: { connected: !!connected, listId },
    preferences: preferences
      ? JSON.parse(preferences)
      : { diet: "", allergies: [], notes: "" },
    user: access.user,
  };
}
export async function audit(
  env: Env,
  access: Access,
  operation: string,
  target?: string,
) {
  await env.DB.prepare(
    "INSERT INTO audit_log(id,actor,operation,target,created_at) VALUES (?,?,?,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      `${access.agent ? "agent:" : ""}${access.user.id}`,
      operation,
      target ?? null,
      now(),
    )
    .run();
}
export async function loadRecipe(env: Env, id: string) {
  const value = await env.DB.prepare("SELECT * FROM recipes WHERE id=?")
    .bind(id)
    .first<Row>();
  if (!value) throw new HttpError(404, "Recipe not found.");
  return recipe(value);
}
export async function saveRecipe(
  env: Env,
  data: z.infer<typeof recipeSchema>,
  id: string = crypto.randomUUID(),
) {
  const time = now();
  await env.DB.prepare(
    `INSERT INTO recipes(id,name,description,servings,minutes,ingredients,instructions,tags,source_url,favorite,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,servings=excluded.servings,minutes=excluded.minutes,ingredients=excluded.ingredients,instructions=excluded.instructions,tags=excluded.tags,source_url=excluded.source_url,favorite=excluded.favorite,updated_at=excluded.updated_at`,
  )
    .bind(
      id,
      data.name,
      data.description,
      data.servings,
      data.minutes,
      JSON.stringify(data.ingredients),
      JSON.stringify(data.instructions),
      JSON.stringify(data.tags),
      data.sourceUrl,
      +data.favorite,
      time,
      time,
    )
    .run();
  return loadRecipe(env, id);
}
export async function savePantry(
  env: Env,
  data: z.infer<typeof pantrySchema>,
  id: string = crypto.randomUUID(),
) {
  const time = now();
  await env.DB.prepare(
    `INSERT INTO pantry(id,name,normalized_name,quantity,unit,location,expires_on,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,quantity=excluded.quantity,unit=excluded.unit,location=excluded.location,expires_on=excluded.expires_on,updated_at=excluded.updated_at`,
  )
    .bind(
      id,
      data.name,
      normalizeName(data.name),
      data.quantity,
      data.unit,
      data.location,
      data.expiresOn,
      time,
    )
    .run();
  return { id, ...data, updatedAt: time };
}
export async function saveMeal(
  env: Env,
  data: z.infer<typeof mealSchema>,
  id: string = crypto.randomUUID(),
) {
  const selected = data.recipeId ? await loadRecipe(env, data.recipeId) : null;
  const previous = await env.DB.prepare("SELECT * FROM meals WHERE id=?")
    .bind(id)
    .first<Row>();
  const snapshot = previous && !previous.recipe_id ? meal(previous) : null;
  const ingredients = selected
    ? selected.ingredients.map((item) => ({
        ...item,
        quantity: (item.quantity * data.servings) / selected.servings,
      }))
    : (snapshot?.ingredients.map((item) => ({
        ...item,
        quantity: (item.quantity * data.servings) / snapshot.servings,
      })) ?? []);
  const time = now();
  await env.DB.prepare(
    `INSERT INTO meals(id,recipe_id,name,date,slot,servings,ingredients,status,notes,eaten_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET recipe_id=excluded.recipe_id,name=excluded.name,date=excluded.date,slot=excluded.slot,servings=excluded.servings,ingredients=excluded.ingredients,status=excluded.status,notes=excluded.notes,eaten_at=CASE WHEN excluded.status='eaten' THEN COALESCE(meals.eaten_at,excluded.eaten_at) ELSE NULL END`,
  )
    .bind(
      id,
      data.recipeId ?? null,
      data.name ?? selected!.name,
      data.date,
      data.slot,
      data.servings,
      JSON.stringify(ingredients),
      data.status,
      data.notes,
      data.status === "eaten" ? time : null,
      time,
    )
    .run();
  return meal(
    (await env.DB.prepare("SELECT * FROM meals WHERE id=?")
      .bind(id)
      .first<Row>())!,
  );
}
export async function addGrocery(
  env: Env,
  data: z.infer<typeof grocerySchema>,
) {
  const id = crypto.randomUUID(),
    time = now();
  const row = await env.DB.prepare(
    `INSERT INTO groceries(id,name,normalized_name,quantity,unit,notes,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(normalized_name,unit) WHERE checked=0 DO UPDATE SET quantity=groceries.quantity+excluded.quantity,notes=CASE WHEN excluded.notes='' THEN groceries.notes ELSE excluded.notes END,updated_at=excluded.updated_at RETURNING *`,
  )
    .bind(
      id,
      data.name,
      normalizeName(data.name),
      data.quantity,
      data.unit,
      data.notes,
      time,
    )
    .first<Row>();
  return grocery(row!);
}
export async function groceryPlan(env: Env, from: string, to: string) {
  const planned = await rows(
    env.DB,
    "SELECT * FROM meals WHERE date>=? AND date<=? AND status='planned' ORDER BY date",
    from,
    to,
  );
  const pantry = (
    await rows(
      env.DB,
      "SELECT * FROM pantry WHERE expires_on IS NULL OR expires_on>=?",
      from,
    )
  ).map(pantryItem);
  const missing = mealPlanMissing(planned.map(meal), pantry);
  // Account for the quantities already on the open shopping list. Repeated generation
  // updates the desired minimum instead of adding the same week's ingredients again.
  const writes = missing.map((item) =>
    env.DB.prepare(
      `INSERT INTO groceries(id,name,normalized_name,quantity,unit,notes,updated_at) VALUES (?,?,?,?,?,'Meal plan',?) ON CONFLICT(normalized_name,unit) WHERE checked=0 DO UPDATE SET quantity=MAX(groceries.quantity,excluded.quantity),updated_at=excluded.updated_at`,
    ).bind(
      crypto.randomUUID(),
      item.name,
      normalizeName(item.name),
      item.quantity,
      item.unit,
      now(),
    ),
  );
  if (writes.length) await env.DB.batch(writes);
  return { meals: planned.length, missing };
}
export async function deleteItem(
  env: Env,
  table: "recipes" | "pantry" | "meals" | "groceries",
  id: string,
) {
  if (table === "groceries")
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO bring_removals(uuid,name) SELECT bring_uuid,name FROM groceries WHERE id=? AND bring_uuid IS NOT NULL",
      ).bind(id),
      env.DB.prepare("DELETE FROM groceries WHERE id=?").bind(id),
    ]);
  else await env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();
  return { deleted: id };
}
