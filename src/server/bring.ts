// HTTP protocol ported from julianfbeck/bring-cli (MIT), internal/api/client.go.
// Bring's application key is configured as a Worker secret, never bundled into JS.
import { encrypt, decrypt } from "./security";
import { rows, setting, saveSetting } from "./db";
import { normalizeName } from "../shared";
import { HttpError, now, type Env } from "./types";

const BASE = "https://api.getbring.com/rest/";
type Credentials = {
  uuid: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};
type AuthReply = {
  uuid: string;
  email: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  bringListUUID?: string;
};
type BringItem = { uuid: string; itemId: string; specification: string };
type Change = {
  uuid: string;
  itemId: string;
  spec: string;
  operation: "TO_PURCHASE" | "TO_RECENTLY" | "REMOVE";
};
export async function withBringLock<T>(
  env: Env,
  fn: () => Promise<T>,
): Promise<T> {
  const lease = `${Date.now() + 120000}:${crypto.randomUUID()}`;
  const row = await env.DB.prepare(
    `INSERT INTO settings(key,value) VALUES ('bring_lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(substr(settings.value,1,13) AS INTEGER)<? RETURNING value`,
  )
    .bind(lease, Date.now())
    .first();
  if (!row)
    throw new HttpError(409, "Bring is already syncing. Try again shortly.");
  try {
    return await fn();
  } finally {
    await env.DB.prepare(
      "DELETE FROM settings WHERE key='bring_lock' AND value=?",
    )
      .bind(lease)
      .run();
  }
}
async function request<T>(
  env: Env,
  path: string,
  credentials?: Credentials,
  body?: URLSearchParams | unknown,
  method = "GET",
): Promise<T> {
  if (!env.BRING_API_KEY)
    throw new HttpError(
      503,
      "Set the BRING_API_KEY Worker secret from your local Bring client.",
    );
  const headers = new Headers({
    "X-BRING-API-KEY": env.BRING_API_KEY,
    "X-BRING-CLIENT": "android",
    "User-Agent": "LunchJu/1.0",
  });
  if (credentials) {
    headers.set("Authorization", `Bearer ${credentials.accessToken}`);
    headers.set("X-BRING-USER-UUID", credentials.uuid);
  }
  if (body)
    headers.set(
      "Content-Type",
      body instanceof URLSearchParams
        ? "application/x-www-form-urlencoded"
        : "application/json",
    );
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers,
      body:
        body instanceof URLSearchParams
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new HttpError(
      502,
      "Bring could not be reached. Your local groceries are saved.",
    );
  }
  if (!response.ok)
    throw new HttpError(
      response.status === 401 ? 401 : 502,
      response.status === 401
        ? "Bring authorization expired. Reconnect your account."
        : `Bring returned ${response.status}. Your local groceries are saved.`,
    );
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
async function credentials(env: Env): Promise<Credentials> {
  const stored = await setting(env, "bring_credentials");
  if (!stored)
    throw new HttpError(409, "Connect a Bring account in Settings first.");
  let value = await decrypt<Credentials>(env, stored);
  if (value.expiresAt < Date.now() + 60000) {
    const refreshed = await request<AuthReply>(
      env,
      "v2/bringauth/token",
      undefined,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: value.refreshToken,
      }),
      "POST",
    );
    value = {
      ...value,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || value.refreshToken,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
    };
    await saveSetting(env, "bring_credentials", await encrypt(env, value));
  }
  return value;
}
export async function connectBring(env: Env, email: string, password: string) {
  return withBringLock(env, async () => {
    // Check the encryption configuration before sending credentials upstream.
    await encrypt(env, {});
    const auth = await request<AuthReply>(
      env,
      "v2/bringauth",
      undefined,
      new URLSearchParams({ email, password }),
      "POST",
    );
    const value: Credentials = {
      uuid: auth.uuid,
      email: auth.email,
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token,
      expiresAt: Date.now() + auth.expires_in * 1000,
    };
    await saveSetting(env, "bring_credentials", await encrypt(env, value));
    await env.DB.prepare("DELETE FROM settings WHERE key='bring_list'").run();
    return {
      connected: true,
      ...(await request<{ lists: { listUuid: string; name: string }[] }>(
        env,
        `bringusers/${encodeURIComponent(value.uuid)}/lists`,
        value,
      )),
    };
  });
}
export async function bringLists(env: Env) {
  return withBringLock(env, async () => {
    const auth = await credentials(env);
    return request<{ lists: { listUuid: string; name: string }[] }>(
      env,
      `bringusers/${encodeURIComponent(auth.uuid)}/lists`,
      auth,
    );
  });
}
export async function chooseBringList(env: Env, listId: string) {
  return withBringLock(env, async () => {
    const auth = await credentials(env);
    const { lists } = await request<{
      lists: { listUuid: string; name: string }[];
    }>(env, `bringusers/${encodeURIComponent(auth.uuid)}/lists`, auth);
    if (!lists.some((list) => list.listUuid === listId))
      throw new HttpError(
        400,
        "Choose a list belonging to the connected Bring account.",
      );
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO settings(key,value) VALUES ('bring_list',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).bind(listId),
      env.DB.prepare(
        "UPDATE groceries SET bring_uuid=NULL,bring_synced_at=NULL",
      ),
      env.DB.prepare("DELETE FROM bring_removals"),
    ]);
    return { listId };
  });
}
export async function disconnectBring(env: Env) {
  return withBringLock(env, async () => {
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM settings WHERE key IN ('bring_credentials','bring_list')",
      ),
      env.DB.prepare(
        "UPDATE groceries SET bring_uuid=NULL,bring_synced_at=NULL",
      ),
      env.DB.prepare("DELETE FROM bring_removals"),
    ]);
    return { connected: false };
  });
}
export async function syncBring(env: Env) {
  return withBringLock(env, async () => {
    const auth = await credentials(env),
      list = await setting(env, "bring_list");
    if (!list)
      throw new HttpError(409, "Choose a Bring list in Settings first.");
    const remote = await request<{
      items: { purchase: BringItem[]; recently: BringItem[] };
    }>(env, `v2/bringlists/${encodeURIComponent(list)}`, auth);
    const purchase = remote.items?.purchase ?? [],
      recently = remote.items?.recently ?? [];
    const local = await rows(env.DB, "SELECT * FROM groceries");
    const removals = await rows(env.DB, "SELECT * FROM bring_removals");
    const changes: Change[] = removals.map((row) => ({
      uuid: String(row.uuid),
      itemId: String(row.name),
      spec: "",
      operation: "REMOVE",
    }));
    const matched = new Set<string>(removals.map((row) => String(row.uuid)));
    const updates: D1PreparedStatement[] = [];
    let pulled = 0;
    const time = now();
    for (const item of local) {
      const found =
        purchase.find((entry) => entry.uuid === item.bring_uuid) ||
        (!item.bring_uuid
          ? purchase.find(
              (entry) =>
                normalizeName(entry.itemId) === item.normalized_name &&
                !matched.has(entry.uuid),
            )
          : undefined);
      if (found) matched.add(found.uuid);
      if (
        !item.checked &&
        item.bring_uuid &&
        item.bring_synced_at &&
        String(item.updated_at) <= String(item.bring_synced_at) &&
        recently.some((entry) => entry.uuid === item.bring_uuid)
      ) {
        updates.push(
          env.DB.prepare(
            "UPDATE groceries SET checked=1,updated_at=?,bring_synced_at=? WHERE id=? AND updated_at=?",
          ).bind(time, time, item.id, item.updated_at),
        );
        pulled++;
        continue;
      }
      if (item.checked && !item.bring_uuid) continue;
      const uuid = String(item.bring_uuid ?? found?.uuid ?? item.id);
      if (
        !item.bring_synced_at ||
        String(item.updated_at) > String(item.bring_synced_at) ||
        (!item.checked && !found)
      )
        changes.push({
          uuid,
          itemId: String(item.name),
          spec: `${item.quantity} ${item.unit}${item.notes ? `, ${item.notes}` : ""}`,
          operation: item.checked ? "TO_RECENTLY" : "TO_PURCHASE",
        });
      matched.add(uuid);
      updates.push(
        env.DB.prepare(
          "UPDATE groceries SET bring_uuid=?,bring_synced_at=? WHERE id=? AND updated_at=?",
        ).bind(uuid, time, item.id, item.updated_at),
      );
    }
    for (const item of purchase.filter((item) => !matched.has(item.uuid))) {
      updates.push(
        env.DB.prepare(
          `INSERT INTO groceries(id,name,normalized_name,quantity,unit,notes,bring_uuid,bring_synced_at,updated_at) VALUES (?,?,?,1,'piece',?,?,?,?) ON CONFLICT(normalized_name,unit) WHERE checked=0 DO NOTHING`,
        ).bind(
          crypto.randomUUID(),
          item.itemId,
          normalizeName(item.itemId),
          item.specification ?? "",
          item.uuid,
          time,
          time,
        ),
      );
      pulled++;
    }
    if (changes.length)
      await request(
        env,
        `v2/bringlists/${encodeURIComponent(list)}/items`,
        auth,
        {
          changes: changes.map((item) => ({
            ...item,
            accuracy: "0.0",
            altitude: "0.0",
            latitude: "0.0",
            longitude: "0.0",
          })),
          sender: "",
        },
        "PUT",
      );
    for (const item of removals)
      updates.push(
        env.DB.prepare("DELETE FROM bring_removals WHERE uuid=?").bind(
          item.uuid,
        ),
      );
    if (updates.length) await env.DB.batch(updates);
    return { pushed: changes.length, pulled, syncedAt: time };
  });
}
