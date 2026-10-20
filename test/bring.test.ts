import { describe, it, expect, vi, afterEach } from "vitest";
import { fixture } from "./support/db";
import {
  connectBring,
  syncBring,
  chooseBringList,
  withBringLock,
} from "../src/server/bring";
import { runOperation } from "../src/server/operations";

afterEach(() => vi.unstubAllGlobals());
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
            lists: [{ listUuid: "our-list", name: "Home" }],
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
          "already syncing",
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
    ).rejects.toThrow("Reconnect");
    expect(
      f.sqlite
        .prepare("SELECT * FROM settings WHERE key=?")
        .get("bring_credentials"),
    ).toBeUndefined();
  });
});
