import type { z } from "zod";
import { id } from "../shared";
import {
  recipeSourceSchema,
  videoSource,
  type RecipeSource,
} from "../recipe-sources";
import { validateImage, type ImageType } from "./images";
import { HttpError, now, type Env, type Access } from "./types";

type Row = Record<string, unknown>;
function source(row: Row): RecipeSource {
  return {
    id: String(row.id),
    kind: row.kind as RecipeSource["kind"],
    title: String(row.title),
    url: String(row.url),
    platform: row.platform as RecipeSource["platform"],
    notes: String(row.notes),
    recipeId: row.recipe_id ? String(row.recipe_id) : null,
    status: row.status as RecipeSource["status"],
    resolution: String(row.resolution),
    imageUrl: row.image_key
      ? `/api/recipe-sources/${row.id}/image?v=${encodeURIComponent(String(row.image_key))}`
      : null,
    imageAlt: String(row.image_alt),
    ready: row.kind !== "image" || !!row.image_key,
    authorName: String(row.author_name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
const select =
  "SELECT s.*,u.name AS author_name FROM recipe_sources s JOIN users u ON u.id=s.created_by";
export async function listRecipeSources(env: Env) {
  const { results } = await env.DB.prepare(
    select + " ORDER BY s.status='done',s.created_at DESC,s.id",
  ).all<Row>();
  return results.map(source);
}
export async function loadRecipeSource(env: Env, sourceId: string) {
  id.parse(sourceId);
  const row = await env.DB.prepare(select + " WHERE s.id=?")
    .bind(sourceId)
    .first<Row>();
  if (!row) throw new HttpError(404, "Quelle nicht gefunden.");
  return source(row);
}
async function requireRecipe(env: Env, recipeId: string | null) {
  if (
    recipeId &&
    !(await env.DB.prepare("SELECT id FROM recipes WHERE id=?")
      .bind(recipeId)
      .first())
  )
    throw new HttpError(404, "Rezept nicht gefunden.");
}
export async function saveRecipeSource(
  env: Env,
  access: Access,
  input: z.infer<typeof recipeSourceSchema>,
  sourceId?: string,
) {
  await requireRecipe(env, input.recipeId);
  const video = input.url ? videoSource(input.url) : null;
  const time = now();
  const saved = sourceId
    ? await env.DB.prepare(
        "UPDATE recipe_sources SET kind=?,title=?,url=?,platform=?,notes=?,recipe_id=?,status='pending',resolution='',updated_at=? WHERE id=? RETURNING id",
      )
        .bind(
          input.kind,
          input.title,
          video?.url ?? "",
          video?.platform ?? null,
          input.notes,
          input.recipeId,
          time,
          sourceId,
        )
        .first<{ id: string }>()
    : await env.DB.prepare(
        "INSERT INTO recipe_sources(id,kind,title,url,platform,notes,recipe_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id",
      )
        .bind(
          crypto.randomUUID(),
          input.kind,
          input.title,
          video?.url ?? "",
          video?.platform ?? null,
          input.notes,
          input.recipeId,
          access.user.id,
          time,
          time,
        )
        .first<{ id: string }>();
  if (!saved) throw new HttpError(404, "Quelle nicht gefunden.");
  return loadRecipeSource(env, saved.id);
}
export async function setRecipeSourceStatus(
  env: Env,
  sourceId: string,
  status: RecipeSource["status"],
  resolution: string,
  recipeId?: string | null,
) {
  const previous = await loadRecipeSource(env, sourceId);
  const target = recipeId === undefined ? previous.recipeId : recipeId;
  await requireRecipe(env, target);
  if (status === "done" && (!target || !previous.ready))
    throw new HttpError(
      400,
      "Ordne der fertigen Quelle ein Rezept zu und lade das Quellenbild vollständig hoch.",
    );
  if (status === "needs_info" && !resolution)
    throw new HttpError(400, "Beschreibe, welche Angaben noch fehlen.");
  const result = await env.DB.prepare(
    "UPDATE recipe_sources SET status=?,resolution=?,recipe_id=?,updated_at=? WHERE id=? AND updated_at=? RETURNING id",
  )
    .bind(status, resolution, target, now(), sourceId, previous.updatedAt)
    .first();
  if (!result)
    throw new HttpError(
      409,
      "Die Quelle wurde zwischenzeitlich geändert. Lade sie erneut.",
    );
  return loadRecipeSource(env, sourceId);
}
function bucket(env: Env) {
  if (!env.IMAGES)
    throw new HttpError(503, "Der Bildspeicher ist noch nicht eingerichtet.");
  return env.IMAGES;
}
async function imageRecord(env: Env, sourceId: string) {
  id.parse(sourceId);
  const row = await env.DB.prepare(
    "SELECT image_key,image_alt FROM recipe_sources WHERE id=?",
  )
    .bind(sourceId)
    .first<{ image_key: string | null; image_alt: string }>();
  if (!row) throw new HttpError(404, "Quelle nicht gefunden.");
  return row;
}
async function cleanupImage(env: Env, key: string) {
  try {
    await bucket(env).delete(key);
  } catch {
    console.warn("Verwaistes Quellenbild konnte nicht entfernt werden.");
  }
}
export async function uploadRecipeSourceImage(
  env: Env,
  sourceId: string,
  bytes: Uint8Array,
  contentType: string,
  altText: string,
) {
  validateImage(bytes, contentType);
  const previous = await imageRecord(env, sourceId);
  const extension = (
    { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const
  )[contentType as ImageType];
  const key = `sources/${sourceId}/${crypto.randomUUID()}.${extension}`;
  try {
    await bucket(env).put(key, bytes, { httpMetadata: { contentType } });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      "Das Bild konnte nicht gespeichert werden. Bitte versuche es erneut.",
    );
  }
  try {
    const saved = await env.DB.prepare(
      "UPDATE recipe_sources SET image_key=?,image_alt=?,status='pending',resolution='',updated_at=? WHERE id=? AND image_key IS ? RETURNING id",
    )
      .bind(key, altText, now(), sourceId, previous.image_key)
      .first();
    if (!saved)
      throw new HttpError(
        409,
        "Die Quelle wurde zwischenzeitlich geändert. Lade sie erneut.",
      );
  } catch (error) {
    await cleanupImage(env, key);
    throw error;
  }
  if (previous.image_key) await cleanupImage(env, previous.image_key);
  return loadRecipeSource(env, sourceId);
}
export async function deleteRecipeSourceImage(env: Env, sourceId: string) {
  const previous = await imageRecord(env, sourceId);
  const saved = await env.DB.prepare(
    "UPDATE recipe_sources SET image_key=NULL,image_alt='',status='pending',resolution='',updated_at=? WHERE id=? AND image_key IS ? RETURNING id",
  )
    .bind(now(), sourceId, previous.image_key)
    .first();
  if (!saved)
    throw new HttpError(
      409,
      "Die Quelle wurde zwischenzeitlich geändert. Lade sie erneut.",
    );
  if (previous.image_key) await cleanupImage(env, previous.image_key);
  return loadRecipeSource(env, sourceId);
}
export async function getRecipeSourceImage(env: Env, sourceId: string) {
  const row = await imageRecord(env, sourceId);
  if (!row.image_key)
    throw new HttpError(404, "Diese Quelle hat noch kein Bild.");
  let image: R2ObjectBody | null;
  try {
    image = await bucket(env).get(row.image_key);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      "Das Bild konnte nicht geladen werden. Bitte versuche es erneut.",
    );
  }
  if (!image) throw new HttpError(404, "Quellenbild nicht gefunden.");
  return { image, altText: row.image_alt };
}
export async function recipeSourceImageData(env: Env, sourceId: string) {
  const { image, altText } = await getRecipeSourceImage(env, sourceId);
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return {
    sourceId,
    data: btoa(binary),
    mimeType: image.httpMetadata?.contentType ?? "image/jpeg",
    altText,
  };
}
export async function deleteRecipeSource(env: Env, sourceId: string) {
  const row = await env.DB.prepare(
    "DELETE FROM recipe_sources WHERE id=? RETURNING image_key",
  )
    .bind(sourceId)
    .first<{ image_key: string | null }>();
  if (!row) throw new HttpError(404, "Quelle nicht gefunden.");
  if (row.image_key) await cleanupImage(env, row.image_key);
  return { deleted: sourceId };
}
