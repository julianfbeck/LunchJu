import { id } from "../shared";
import { loadRecipe } from "./db";
import { HttpError, now, type Env } from "./types";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BASE64 = 4 * Math.ceil(MAX_IMAGE_BYTES / 3);
const extensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type ImageType = keyof typeof extensions;
function bucket(env: Env) {
  if (!env.IMAGES)
    throw new HttpError(503, "Der Bildspeicher ist noch nicht eingerichtet.");
  return env.IMAGES;
}
export function validateImage(
  bytes: Uint8Array,
  contentType: string,
): asserts contentType is ImageType {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new HttpError(413, "Bilder dürfen höchstens 5 MB groß sein.");
  const starts = (signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);
  const valid =
    contentType === "image/jpeg"
      ? starts([255, 216, 255])
      : contentType === "image/png"
        ? starts([137, 80, 78, 71, 13, 10, 26, 10])
        : contentType === "image/webp"
          ? starts([82, 73, 70, 70]) &&
            new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
          : false;
  if (!valid || bytes.length < 32)
    throw new HttpError(
      400,
      "Bitte lade ein gültiges JPG-, PNG- oder WebP-Bild hoch.",
    );
}
export function decodeImage(data: string) {
  if (data.length > MAX_IMAGE_BASE64)
    throw new HttpError(413, "Bilder dürfen höchstens 5 MB groß sein.");
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
    throw new HttpError(400, "Die Bilddaten müssen gültiges Base64 sein.");
  const binary = atob(data),
    bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
const MAX_RECIPE_IMAGES = 20;
type ImageRow = { id: string; image_key: string; alt_text: string };
async function imageRecord(env: Env, recipeId: string, imageId?: string) {
  id.parse(recipeId);
  if (imageId) id.parse(imageId);
  const record = await env.DB.prepare(
    "SELECT image_key,image_alt,images_version FROM recipes WHERE id=?",
  )
    .bind(recipeId)
    .first<{
      image_key: string | null;
      image_alt: string;
      images_version: number;
    }>();
  if (!record) throw new HttpError(404, "Rezept nicht gefunden.");
  const image = imageId
    ? await env.DB.prepare(
        "SELECT id,image_key,alt_text FROM recipe_images WHERE recipe_id=? AND id=?",
      )
        .bind(recipeId, imageId)
        .first<ImageRow>()
    : await env.DB.prepare(
        "SELECT id,image_key,alt_text FROM recipe_images WHERE recipe_id=? AND image_key=?",
      )
        .bind(recipeId, record.image_key)
        .first<ImageRow>();
  if (imageId && !image) throw new HttpError(404, "Rezeptbild nicht gefunden.");
  return { ...record, selected: image };
}
async function cleanupImage(env: Env, key: string) {
  try {
    await bucket(env).delete(key);
  } catch {
    console.warn("Verwaistes Rezeptbild konnte nicht entfernt werden.");
  }
}
const conflict = () =>
  new HttpError(
    409,
    "Das Rezeptbild wurde zwischenzeitlich geändert. Bitte lade es erneut.",
  );
export async function uploadRecipeImage(
  env: Env,
  recipeId: string,
  bytes: Uint8Array,
  contentType: string,
  altText: string,
  options: { append?: boolean; imageId?: string } = {},
) {
  validateImage(bytes, contentType);
  if (options.append && options.imageId)
    throw new HttpError(
      400,
      "Wähle entweder ein neues oder ein vorhandenes Bild.",
    );
  const record = await imageRecord(env, recipeId, options.imageId);
  const selected = options.append ? null : record.selected;
  if (!selected) {
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM recipe_images WHERE recipe_id=?",
    )
      .bind(recipeId)
      .first<{ n: number }>();
    if (count!.n >= MAX_RECIPE_IMAGES)
      throw new HttpError(400, "Ein Rezept kann höchstens 20 Bilder haben.");
  }
  const imageId = selected?.id ?? crypto.randomUUID();
  const key = `recipes/${recipeId}/${crypto.randomUUID()}.${extensions[contentType]}`;
  try {
    await bucket(env).put(key, bytes, { httpMetadata: { contentType } });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      "Das Bild konnte nicht gespeichert werden. Bitte versuche es erneut.",
    );
  }
  const time = now();
  const cover = !record.image_key || selected?.image_key === record.image_key;
  // Both writes share an optimistic revision check inside one D1 transaction.
  // Concurrent uploads/deletes cannot overwrite each other or create orphan rows.
  const guard =
    "EXISTS(SELECT 1 FROM recipes WHERE id=? AND images_version=? AND image_key IS ?)";
  try {
    const writes = await env.DB.batch([
      selected
        ? env.DB.prepare(
            `UPDATE recipe_images SET image_key=?,alt_text=? WHERE id=? AND recipe_id=? AND image_key=? AND ${guard}`,
          ).bind(
            key,
            altText,
            imageId,
            recipeId,
            selected.image_key,
            recipeId,
            record.images_version,
            record.image_key,
          )
        : env.DB.prepare(
            `INSERT INTO recipe_images(id,recipe_id,image_key,alt_text,created_at) SELECT ?,?,?,?,? WHERE ${guard} AND (SELECT COUNT(*) FROM recipe_images WHERE recipe_id=?)<?`,
          ).bind(
            imageId,
            recipeId,
            key,
            altText,
            time,
            recipeId,
            record.images_version,
            record.image_key,
            recipeId,
            MAX_RECIPE_IMAGES,
          ),
      env.DB.prepare(
        "UPDATE recipes SET image_key=CASE WHEN ? THEN ? ELSE image_key END,image_alt=CASE WHEN ? THEN ? ELSE image_alt END,images_version=images_version+1,updated_at=? WHERE id=? AND images_version=? AND image_key IS ? AND EXISTS(SELECT 1 FROM recipe_images WHERE recipe_id=? AND image_key=?) RETURNING id",
      ).bind(
        +cover,
        key,
        +cover,
        altText,
        time,
        recipeId,
        record.images_version,
        record.image_key,
        recipeId,
        key,
      ),
    ]);
    if (!writes[1].results.length) throw conflict();
  } catch (error) {
    await cleanupImage(env, key);
    throw error;
  }
  if (selected) await cleanupImage(env, selected.image_key);
  return loadRecipe(env, recipeId);
}
export async function deleteRecipeImage(
  env: Env,
  recipeId: string,
  imageId?: string,
) {
  const record = await imageRecord(env, recipeId, imageId);
  if (!record.selected) return loadRecipe(env, recipeId);
  const selected = record.selected;
  const results = await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM recipe_images WHERE id=? AND recipe_id=? AND image_key=? AND EXISTS(SELECT 1 FROM recipes WHERE id=? AND images_version=? AND image_key IS ?)",
    ).bind(
      selected.id,
      recipeId,
      selected.image_key,
      recipeId,
      record.images_version,
      record.image_key,
    ),
    env.DB.prepare(
      `UPDATE recipes SET
      image_key=CASE WHEN image_key=? THEN (SELECT image_key FROM recipe_images WHERE recipe_id=? ORDER BY created_at,id LIMIT 1) ELSE image_key END,
      image_alt=CASE WHEN image_key=? THEN COALESCE((SELECT alt_text FROM recipe_images WHERE recipe_id=? ORDER BY created_at,id LIMIT 1),'') ELSE image_alt END,
      images_version=images_version+1,updated_at=? WHERE id=? AND images_version=? AND image_key IS ? AND NOT EXISTS(SELECT 1 FROM recipe_images WHERE id=?) RETURNING id`,
    ).bind(
      selected.image_key,
      recipeId,
      selected.image_key,
      recipeId,
      now(),
      recipeId,
      record.images_version,
      record.image_key,
      selected.id,
    ),
  ]);
  if (!results[1].results.length) throw conflict();
  await cleanupImage(env, selected.image_key);
  return loadRecipe(env, recipeId);
}
export async function updateRecipeImage(
  env: Env,
  recipeId: string,
  imageId: string,
  altText?: string,
  makeCover = false,
) {
  const record = await imageRecord(env, recipeId, imageId);
  const image = record.selected!;
  const alt = altText ?? image.alt_text;
  const cover = makeCover || record.image_key === image.image_key;
  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE recipe_images SET alt_text=? WHERE id=? AND recipe_id=? AND EXISTS(SELECT 1 FROM recipes WHERE id=? AND images_version=? AND image_key IS ?)",
    ).bind(
      alt,
      imageId,
      recipeId,
      recipeId,
      record.images_version,
      record.image_key,
    ),
    env.DB.prepare(
      "UPDATE recipes SET image_key=CASE WHEN ? THEN ? ELSE image_key END,image_alt=CASE WHEN ? THEN ? ELSE image_alt END,images_version=images_version+1,updated_at=? WHERE id=? AND images_version=? AND image_key IS ? RETURNING id",
    ).bind(
      +cover,
      image.image_key,
      +cover,
      alt,
      now(),
      recipeId,
      record.images_version,
      record.image_key,
    ),
  ]);
  if (!results[1].results.length) throw conflict();
  return loadRecipe(env, recipeId);
}
export async function getRecipeImage(
  env: Env,
  recipeId: string,
  imageId?: string,
) {
  const record = await imageRecord(env, recipeId, imageId);
  if (!record.selected)
    throw new HttpError(404, "Dieses Rezept hat noch kein Bild.");
  let image: R2ObjectBody | null;
  try {
    image = await bucket(env).get(record.selected.image_key);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      "Das Bild konnte nicht geladen werden. Bitte versuche es erneut.",
    );
  }
  if (!image) throw new HttpError(404, "Rezeptbild nicht gefunden.");
  return {
    image,
    altText: record.selected.alt_text,
    imageId: record.selected.id,
  };
}
export async function recipeImageData(
  env: Env,
  recipeId: string,
  imageId?: string,
) {
  const {
    image,
    altText,
    imageId: selectedId,
  } = await getRecipeImage(env, recipeId, imageId);
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return {
    recipeId,
    imageId: selectedId,
    data: btoa(binary),
    mimeType: image.httpMetadata?.contentType ?? "image/jpeg",
    altText,
  };
}
