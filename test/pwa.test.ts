import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function serviceWorker() {
  const listeners: Record<string, (event: any) => void> = {};
  const stored = new Map<string, Response>();
  const fetch = vi.fn(
    async (_request: Request) => new Response("Public offline notice"),
  );
  const cache = {
    put: vi.fn(async (key: string, value: Response) => stored.set(key, value)),
    match: vi.fn(async (key: string) => stored.get(key)?.clone()),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: async () => ["lunchju-offline-old", "other-app-cache"],
    delete: vi.fn(async () => true),
  };
  const self = {
    location: { origin: "https://lunchju.juli.sh" },
    addEventListener: (name: string, listener: (event: any) => void) => {
      listeners[name] = listener;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  class WorkerRequest extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, self.location.origin), init);
    }
  }
  runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    { self, caches, fetch, Request: WorkerRequest, Response, URL },
  );
  async function lifecycle(name: string) {
    let pending: Promise<unknown> | undefined;
    listeners[name]({
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
  }
  function request(path: string, method = "GET", mode = "navigate") {
    let response: Promise<Response> | undefined;
    listeners.fetch({
      request: { url: new URL(path, self.location.origin).href, method, mode },
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
    });
    return response;
  }
  return { fetch, cache, caches, lifecycle, request };
}

describe("PWA installation and privacy", () => {
  it("defines standalone installation with real PNG icons and maskable safe space", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../public/manifest.webmanifest", import.meta.url),
        "utf8",
      ),
    );
    expect(manifest).toMatchObject({
      id: "/",
      scope: "/",
      display: "standalone",
      start_url: "/?source=pwa",
    });
    for (const icon of manifest.icons) {
      const bytes = readFileSync(
        new URL("../public" + icon.src, import.meta.url),
      );
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      expect(icon.sizes).toBe(
        `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,
      );
    }
    expect(
      manifest.icons.some(
        (icon: { sizes: string }) => icon.sizes === "192x192",
      ),
    ).toBe(true);
    expect(
      manifest.icons.some(
        (icon: { sizes: string }) => icon.sizes === "512x512",
      ),
    ).toBe(true);
  });

  it("caches only a public offline notice and never stores authenticated navigation", async () => {
    const sw = serviceWorker();
    await sw.lifecycle("install");
    const initialRequest = sw.fetch.mock.calls[0][0] as unknown as Request;
    expect(initialRequest.credentials).toBe("omit");
    expect(sw.cache.put).toHaveBeenCalledTimes(1);
    sw.fetch.mockResolvedValueOnce(
      new Response("Private recipe catalog", {
        headers: { "Cache-Control": "private, no-store" },
      }),
    );
    expect(await (await sw.request("/"))?.text()).toBe(
      "Private recipe catalog",
    );
    expect(sw.cache.put).toHaveBeenCalledTimes(1);
    sw.fetch.mockRejectedValueOnce(new TypeError("Offline"));
    expect(await (await sw.request("/?source=pwa"))?.text()).toBe(
      "Public offline notice",
    );
    await sw.lifecycle("activate");
    expect(sw.caches.delete.mock.calls).toEqual([["lunchju-offline-old"]]);
  });

  it("leaves API, OAuth, MCP, recipe images, cross-origin requests and mutations on the network", () => {
    const sw = serviceWorker();
    for (const path of [
      "/api/action",
      "/api/recipes/id/image",
      "/oauth/authorize",
      "/mcp",
      "/_serverFn/example",
      "https://other.example/",
    ])
      expect(sw.request(path)).toBeUndefined();
    expect(sw.request("/", "POST")).toBeUndefined();
    expect(sw.request("/", "GET", "cors")).toBeUndefined();
    expect(sw.fetch).not.toHaveBeenCalled();
  });
});
