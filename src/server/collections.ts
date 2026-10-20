import type { z } from "zod";
import { cookbookSchema } from "../shared";
import { cookbook, loadRecipe, rows } from "./db";
import { HttpError, now, type Env, type Access } from "./types";

export async function saveCookbook(
  env: Env,
  input: z.infer<typeof cookbookSchema>,
  id: string = crypto.randomUUID(),
  update = false,
) {
  const time = now();
  try {
    const saved = update
      ? await env.DB.prepare(
          "UPDATE cookbooks SET name=?,description=?,updated_at=? WHERE id=? RETURNING *",
        )
          .bind(input.name, input.description, time, id)
          .first<Record<string, unknown>>()
      : await env.DB.prepare(
          "INSERT INTO cookbooks(id,name,description,created_at,updated_at) VALUES (?,?,?,?,?) RETURNING *",
        )
          .bind(id, input.name, input.description, time, time)
          .first<Record<string, unknown>>();
    if (!saved) throw new HttpError(404, "Kochbuch nicht gefunden.");
    return cookbook(saved);
  } catch (error) {
    if (
      error instanceof Error &&
      /UNIQUE constraint failed: cookbooks.name/.test(error.message)
    )
      throw new HttpError(
        409,
        "Ein Kochbuch mit diesem Namen existiert bereits.",
      );
    throw error;
  }
}
export async function setRecipeCookbooks(
  env: Env,
  recipeId: string,
  cookbookIds: string[],
) {
  await loadRecipe(env, recipeId);
  const ids = [...new Set(cookbookIds)];
  if (ids.length) {
    const books = await rows(
      env.DB,
      `SELECT id FROM cookbooks WHERE id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
    if (books.length !== ids.length)
      throw new HttpError(404, "Kochbuch nicht gefunden.");
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM recipe_cookbooks WHERE recipe_id=?").bind(
      recipeId,
    ),
    ...ids.map((bookId) =>
      env.DB.prepare(
        "INSERT INTO recipe_cookbooks(recipe_id,cookbook_id) VALUES (?,?)",
      ).bind(recipeId, bookId),
    ),
    env.DB.prepare("UPDATE recipes SET updated_at=? WHERE id=?").bind(
      now(),
      recipeId,
    ),
  ]);
  return loadRecipe(env, recipeId);
}
export async function addRecipeComment(
  env: Env,
  access: Access,
  recipeId: string,
  body: string,
) {
  await loadRecipe(env, recipeId);
  const time = now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO recipe_comments(id,recipe_id,author_id,agent,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      recipeId,
      access.user.id,
      +access.agent,
      body,
      time,
      time,
    ),
    env.DB.prepare("UPDATE recipes SET updated_at=? WHERE id=?").bind(
      time,
      recipeId,
    ),
  ]);
  return loadRecipe(env, recipeId);
}
export async function changeRecipeComment(
  env: Env,
  access: Access,
  recipeId: string,
  commentId: string,
  body?: string,
) {
  const saved = await env.DB.prepare(
    "SELECT author_id FROM recipe_comments WHERE id=? AND recipe_id=?",
  )
    .bind(commentId, recipeId)
    .first<{ author_id: string }>();
  if (!saved) throw new HttpError(404, "Kommentar nicht gefunden.");
  if (saved.author_id !== access.user.id && access.user.role !== "owner")
    throw new HttpError(
      403,
      "Du kannst nur eigene Kommentare bearbeiten oder entfernen.",
    );
  const time = now();
  await env.DB.batch([
    body === undefined
      ? env.DB.prepare(
          "DELETE FROM recipe_comments WHERE id=? AND recipe_id=?",
        ).bind(commentId, recipeId)
      : env.DB.prepare(
          "UPDATE recipe_comments SET body=?,updated_at=? WHERE id=? AND recipe_id=?",
        ).bind(body, time, commentId, recipeId),
    env.DB.prepare("UPDATE recipes SET updated_at=? WHERE id=?").bind(
      time,
      recipeId,
    ),
  ]);
  return loadRecipe(env, recipeId);
}
