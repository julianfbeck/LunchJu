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
function validateImage(
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
async function imageRecord(env: Env, recipeId: string) {
  id.parse(recipeId);
  const record = await env.DB.prepare(
    "SELECT image_key,image_alt FROM recipes WHERE id=?",
  )
    .bind(recipeId)
    .first<{ image_key: string | null; image_alt: string }>();
  if (!record) throw new HttpError(404, "Rezept nicht gefunden.");
  return record;
}
async function cleanupImage(env: Env, key: string) {
  try {
    await bucket(env).delete(key);
  } catch {
    console.warn("Verwaistes Rezeptbild konnte nicht entfernt werden.");
  }
}
export async function uploadRecipeImage(
  env: Env,
  recipeId: string,
  bytes: Uint8Array,
  contentType: string,
  altText: string,
) {
  validateImage(bytes, contentType);
  const record = await imageRecord(env, recipeId);
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
  try {
    const updated = await env.DB.prepare(
      "UPDATE recipes SET image_key=?,image_alt=?,updated_at=? WHERE id=? AND image_key IS ? RETURNING id",
    )
      .bind(key, altText, now(), recipeId, record.image_key)
      .first();
    if (!updated)
      throw new HttpError(
        409,
        "Das Rezeptbild wurde zwischenzeitlich geändert. Bitte lade es erneut.",
      );
  } catch (error) {
    await cleanupImage(env, key);
    throw error;
  }
  if (record.image_key) await cleanupImage(env, record.image_key);
  return loadRecipe(env, recipeId);
}
export async function deleteRecipeImage(env: Env, recipeId: string) {
  const record = await imageRecord(env, recipeId);
  if (record.image_key) {
    const updated = await env.DB.prepare(
      "UPDATE recipes SET image_key=NULL,image_alt='',updated_at=? WHERE id=? AND image_key IS ? RETURNING id",
    )
      .bind(now(), recipeId, record.image_key)
      .first();
    if (!updated)
      throw new HttpError(
        409,
        "Das Rezeptbild wurde zwischenzeitlich geändert. Bitte lade es erneut.",
      );
    await cleanupImage(env, record.image_key);
  }
  return loadRecipe(env, recipeId);
}
export async function getRecipeImage(env: Env, recipeId: string) {
  const record = await imageRecord(env, recipeId);
  if (!record.image_key)
    throw new HttpError(404, "Dieses Rezept hat noch kein Bild.");
  let image: R2ObjectBody | null;
  try {
    image = await bucket(env).get(record.image_key);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      "Das Bild konnte nicht geladen werden. Bitte versuche es erneut.",
    );
  }
  if (!image) throw new HttpError(404, "Rezeptbild nicht gefunden.");
  return { image, altText: record.image_alt };
}
export async function recipeImageData(env: Env, recipeId: string) {
  const { image, altText } = await getRecipeImage(env, recipeId);
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return {
    recipeId,
    data: btoa(binary),
    mimeType: image.httpMetadata?.contentType ?? "image/jpeg",
    altText,
  };
}
