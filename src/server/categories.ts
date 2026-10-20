import type { z } from "zod";
import { categorySchema, normalizeName } from "../shared";
import { category, loadRecipe, rows } from "./db";
import { HttpError, now, type Env } from "./types";

export async function saveCategory(
  env: Env,
  input: z.infer<typeof categorySchema>,
  id: string = crypto.randomUUID(),
  update = false,
) {
  const time = now();
  try {
    const row = update
      ? await env.DB.prepare(
          "UPDATE categories SET name=?,normalized_name=?,updated_at=? WHERE id=? RETURNING *",
        )
          .bind(input.name, normalizeName(input.name), time, id)
          .first<Record<string, unknown>>()
      : await env.DB.prepare(
          "INSERT INTO categories(id,name,normalized_name,created_at,updated_at) VALUES (?,?,?,?,?) RETURNING *",
        )
          .bind(id, input.name, normalizeName(input.name), time, time)
          .first<Record<string, unknown>>();
    if (!row) throw new HttpError(404, "Kategorie nicht gefunden.");
    return category(row);
  } catch (error) {
    if (
      error instanceof Error &&
      /UNIQUE constraint failed: categories.normalized_name/.test(error.message)
    )
      throw new HttpError(
        409,
        "Eine Kategorie mit diesem Namen existiert bereits.",
      );
    throw error;
  }
}
export async function setRecipeCategories(
  env: Env,
  recipeId: string,
  categoryIds: string[],
) {
  await loadRecipe(env, recipeId);
  const ids = [...new Set(categoryIds)];
  if (ids.length) {
    const found = await rows(
      env.DB,
      `SELECT id FROM categories WHERE id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
    if (found.length !== ids.length)
      throw new HttpError(404, "Kategorie nicht gefunden.");
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM recipe_categories WHERE recipe_id=?").bind(
      recipeId,
    ),
    ...ids.map((id) =>
      env.DB.prepare(
        "INSERT INTO recipe_categories(recipe_id,category_id) VALUES (?,?)",
      ).bind(recipeId, id),
    ),
    env.DB.prepare("UPDATE recipes SET updated_at=? WHERE id=?").bind(
      now(),
      recipeId,
    ),
  ]);
  return loadRecipe(env, recipeId);
}
