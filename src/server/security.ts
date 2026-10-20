import { HttpError, origin, type Env } from "./types";

export function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function unb64(value: string) {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
export async function hash(value: string) {
  return b64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}
export function randomToken() {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}
export async function secretMatches(actual: string, expected?: string) {
  if (!expected || expected.length < 24) return false;
  const a = await hash(actual),
    b = await hash(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export function requireSameOrigin(request: Request, env: Env) {
  if (request.headers.get("Origin") !== origin(env))
    throw new HttpError(
      403,
      "Diese Anfrage muss von deiner LunchJu-Website stammen.",
    );
}
export function cookie(request: Request, name: string) {
  return (
    request.headers
      .get("Cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}
export function setCookie(env: Env, name: string, value: string, age: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${origin(env).startsWith("https:") ? "; Secure" : ""}`;
}
export async function rateLimit(
  env: Env,
  key: string,
  maximum = 20,
  seconds = 60,
) {
  const time = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires_at <= ? THEN 1 ELSE count+1 END, expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING count`,
  )
    .bind(key, time + seconds, time, time)
    .first<{ count: number }>();
  if (!row || row.count > maximum)
    throw new HttpError(
      429,
      "Zu viele Versuche. Bitte versuche es gleich noch einmal.",
    );
}
export async function readJson(
  request: Request,
  max = 262144,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Sende die Anfrage als application/json.");
  const bounded = await boundedBody(request, max);
  try {
    return JSON.parse(await bounded.text());
  } catch {
    throw new HttpError(400, "Ungültiges JSON.");
  }
}
export async function boundedBody(
  request: Request,
  max: number,
  timeoutMs = 5000,
): Promise<Request> {
  if (Number(request.headers.get("content-length")) > max)
    throw new HttpError(413, "Die Anfrage ist zu groß.");
  if (!request.body) return request;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout>;
  const bytes = await Promise.race([
    (async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.length;
        if (size > max) {
          void reader.cancel().catch(() => {});
          throw new HttpError(413, "Die Anfrage ist zu groß.");
        }
        chunks.push(item.value);
      }
      const data = new Uint8Array(size);
      let offset = 0;
      for (const item of chunks) {
        data.set(item, offset);
        offset += item.length;
      }
      return data;
    })(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void reader.cancel().catch(() => {});
        reject(
          new HttpError(408, "Zeitüberschreitung beim Übertragen der Anfrage."),
        );
      }, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer!));
  return new Request(request, { body: bytes });
}
async function encryptionKey(env: Env) {
  if (!env.ENCRYPTION_KEY || !/^[a-f\d]{64}$/i.test(env.ENCRYPTION_KEY))
    throw new HttpError(
      503,
      "Die Verschlüsselung für Bring ist noch nicht eingerichtet.",
    );
  const bytes = Uint8Array.from(env.ENCRYPTION_KEY.match(/../g)!, (v) =>
    parseInt(v, 16),
  );
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encrypt(env: Env, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("lunchju:bring:v1"),
    },
    await encryptionKey(env),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
}
export async function decrypt<T>(env: Env, value: string): Promise<T> {
  const [iv, data] = value.split(".");
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: unb64(iv),
      additionalData: new TextEncoder().encode("lunchju:bring:v1"),
    },
    await encryptionKey(env),
    unb64(data),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
