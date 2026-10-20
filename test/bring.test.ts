import { describe, it, expect, vi, afterEach } from "vitest";
import { fixture } from "./support/db";
import {
  connectBring,
  syncBring,
  chooseBringList,
  withBringLock,
} from "../src/server/bring";
import { runOperation } from "../src/server/operations";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("Bring protocol integration", () => {
  it("connects, encrypts tokens, pushes stable item IDs and imports remote purchases and completions", async () => {
    const f = fixture(),
      writes: { changes: { uuid: string; operation: string }[] }[] = [];
    let remote: {
      purchase: { uuid: string; itemId: string; specification: string }[];
      recently: { uuid: string; itemId: string; specification: string }[];
    } = {
      purchase: [
        { uuid: "remote-item", itemId: "Bread", specification: "wholegrain" },
      ],
      recently: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(String(url)).toMatch(/^https:\/\/api\.getbring\.com\/rest\//);
        expect(new Headers(init.headers).get("X-BRING-API-KEY")).toBe(
          f.env.BRING_API_KEY,
        );
        if (url.endsWith("v2/bringauth"))
          return Response.json({
            uuid: "bring-user",
            email: "owner@example.test",
            access_token: "private-access",
            refresh_token: "private-refresh",
            expires_in: 3600,
          });
        if (url.endsWith("/lists"))
          return Response.json({
            lists: [{ listUuid: "our-list", name: "Stuttgart" }],
          });
        if (url.endsWith("/items")) {
          writes.push(JSON.parse(String(init.body)));
          return new Response(null, { status: 204 });
        }
        return Response.json({ items: remote });
      }),
    );
    await connectBring(f.env, "owner@example.test", "not-stored-password");
    await chooseBringList(f.env, "our-list");
    const settings = JSON.stringify(
      f.sqlite.prepare("SELECT * FROM settings").all(),
    );
    expect(settings).not.toContain("private-access");
    expect(settings).not.toContain("not-stored-password");
    const grocery = (await runOperation(
      "add_grocery",
      { name: "Milk", quantity: 1, unit: "l" },
      f.env,
      f.access,
    )) as { id: string };
    await syncBring(f.env);
    expect(writes[0].changes).toMatchObject([
      { uuid: grocery.id, operation: "TO_PURCHASE" },
    ]);
    expect(
      f.sqlite.prepare("SELECT notes FROM groceries WHERE name='Bread'").get()
        ?.notes,
    ).toBe("wholegrain");
    remote = {
      purchase: [
        { uuid: "remote-item", itemId: "Bread", specification: "wholegrain" },
      ],
      recently: [{ uuid: grocery.id, itemId: "Milk", specification: "1 l" }],
    };
    await syncBring(f.env);
    expect(
      f.sqlite
        .prepare("SELECT checked FROM groceries WHERE id=?")
        .get(grocery.id)?.checked,
    ).toBe(1);
    const writesBefore = writes.length;
    await syncBring(f.env);
    expect(writes).toHaveLength(writesBefore);
  });
  it("serializes refresh/sync work with a durable lease and releases it on failure", async () => {
    const f = fixture();
    await expect(
      withBringLock(f.env, async () => {
        await expect(withBringLock(f.env, async () => true)).rejects.toThrow(
          "gerade abgeglichen",
        );
        throw new Error("failure");
      }),
    ).rejects.toThrow("failure");
    expect(await withBringLock(f.env, async () => true)).toBe(true);
  });
  it("does not overwrite local groceries or expose upstream credentials when Bring fails", async () => {
    const f = fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("sensitive upstream text", { status: 401 }),
      ),
    );
    await expect(
      connectBring(f.env, "owner@example.test", "secret"),
    ).rejects.toThrow("Verbinde dein Konto erneut");
    expect(
      f.sqlite
        .prepare("SELECT * FROM settings WHERE key=?")
        .get("bring_credentials"),
    ).toBeUndefined();
  });
});

describe("Stuttgart-only German Bring connection", () => {
  it("lists only Stuttgart and refuses another list before contacting Bring", async () => {
    const f = fixture();
    const { encrypt } = await import("../src/server/security");
    const { saveSetting } = await import("../src/server/db");
    const { bringLists } = await import("../src/server/bring");
    await saveSetting(
      f.env,
      "bring_credentials",
      await encrypt(f.env, {
        uuid: "bring-user",
        email: "owner@example.test",
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
      }),
    );
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("Accept-Language")).toBe("de-DE");
      return Response.json({
        lists: [
          { listUuid: "our-list", name: "Stuttgart" },
          { listUuid: "other-list", name: "Anderer Haushalt" },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await bringLists(f.env)).toEqual({
      lists: [{ listUuid: "our-list", name: "Stuttgart" }],
    });
    const before = fetchMock.mock.calls.length;
    await expect(chooseBringList(f.env, "other-list")).rejects.toThrow(
      "nur die Bring-Liste Stuttgart",
    );
    expect(fetchMock.mock.calls.length).toBe(before);
    await saveSetting(f.env, "bring_list", "other-list");
    await expect(syncBring(f.env)).rejects.toThrow(
      "nur die Bring-Liste Stuttgart",
    );
    expect(fetchMock.mock.calls.length).toBe(before);
  });
  it("does not save credentials for an account without access to Stuttgart", async () => {
    const f = fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json(
          url.endsWith("v2/bringauth")
            ? {
                uuid: "another-user",
                email: "other@example.test",
                access_token: "secret",
                refresh_token: "secret",
                expires_in: 3600,
              }
            : { lists: [{ listUuid: "other-list", name: "Stuttgart" }] },
        ),
      ),
    );
    await expect(
      connectBring(f.env, "other@example.test", "password"),
    ).rejects.toThrow("keinen Zugriff");
    expect(
      f.sqlite
        .prepare("SELECT * FROM settings WHERE key='bring_credentials'")
        .get(),
    ).toBeUndefined();
  });
  it("preserves Bring article IDs while displaying German article names and units", async () => {
    // A local edit is dirty even when it shares a timestamp with the last sync.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    const f = fixture();
    const { encrypt } = await import("../src/server/security");
    const { saveSetting } = await import("../src/server/db");
    await saveSetting(
      f.env,
      "bring_credentials",
      await encrypt(f.env, {
        uuid: "bring-user",
        email: "owner@example.test",
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
      }),
    );
    await saveSetting(f.env, "bring_list", "our-list");
    const writes: { changes: { itemId: string; spec: string }[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith("/items")) {
          writes.push(JSON.parse(String(init.body)));
          return new Response(null, { status: 204 });
        }
        return Response.json({
          items: {
            purchase: [
              { uuid: "muesli", itemId: "Müesli", specification: "Hafer" },
            ],
            recently: [],
          },
        });
      }),
    );
    await syncBring(f.env);
    const grocery = f.sqlite
      .prepare("SELECT id,name FROM groceries WHERE bring_uuid='muesli'")
      .get()!;
    expect(grocery.name).toBe("Müsli");
    await runOperation(
      "update_grocery",
      {
        id: grocery.id,
        name: "Müsli",
        quantity: 2,
        unit: "piece",
        notes: "Hafer",
        checked: false,
      },
      f.env,
      f.access,
    );
    await syncBring(f.env);
    expect(writes[0].changes[0]).toMatchObject({
      itemId: "Müesli",
      spec: "2 Stück, Hafer",
    });
  });
});
