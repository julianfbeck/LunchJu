import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { fixture } from "./support/db";
import { runOperation } from "../src/server/operations";
import { handleMcp } from "../src/server/mcp";
import { hash } from "../src/server/security";
import { videoSource, type RecipeSource } from "../src/recipe-sources";
import { RecipeSources, sourcePrompt } from "../src/ui/recipe-sources";
import { LanguageProvider } from "../src/ui/language";
import type { Catalog, Recipe } from "../src/shared";
vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: () => new Response() },
}));
import { routeRequest } from "../src/server";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVf8AAAAASUVORK5CYII=";
function setup() {
  const f = fixture(),
    objects = new Map<
      string,
      { bytes: Uint8Array; httpMetadata: { contentType: string } }
    >();
  f.env.IMAGES = {
    put: async (
      key: string,
      bytes: Uint8Array,
      options: { httpMetadata: { contentType: string } },
    ) => {
      objects.set(key, { bytes, httpMetadata: options.httpMetadata });
    },
    delete: async (key: string) => {
      objects.delete(key);
    },
    get: async (key: string) => {
      const image = objects.get(key);
      return image
        ? {
            body: image.bytes,
            httpMetadata: image.httpMetadata,
            arrayBuffer: async () => image.bytes.buffer,
          }
        : null;
    },
  } as unknown as R2Bucket;
  const call = <T = unknown>(name: string, input: unknown = {}) =>
    runOperation(name, input, f.env, f.access) as Promise<T>;
  const create = () =>
    call<Recipe>("create_recipe", {
      name: "Pasta",
      ingredients: [{ name: "Tomaten", quantity: 200, unit: "g" }],
      steps: [
        { title: "Kochen", description: "Nudeln kochen.", durationMinutes: 10 },
      ],
    });
  return { ...f, objects, call, create };
}
describe("Agent source inbox", () => {
  it("normalises official video links and rejects unrelated hosts, profiles, credentials and unsafe schemes", () => {
    for (const [url, expected] of [
      [
        "https://instagram.com/reels/ABC_123/?igsh=tracking#x",
        {
          platform: "instagram",
          url: "https://www.instagram.com/reel/ABC_123/",
        },
      ],
      [
        "https://www.tiktok.com/@cook/video/1234567890123456789?utm=x",
        {
          platform: "tiktok",
          url: "https://www.tiktok.com/@cook/video/1234567890123456789",
        },
      ],
      [
        "https://vm.tiktok.com/ZABC123/?x=y",
        { platform: "tiktok", url: "https://vm.tiktok.com/ZABC123/" },
      ],
      [
        "https://www.tiktok.com/t/ZABC123/",
        { platform: "tiktok", url: "https://www.tiktok.com/t/ZABC123/" },
      ],
      [
        "https://youtu.be/abcdefghijk?si=tracking",
        {
          platform: "youtube",
          url: "https://www.youtube.com/shorts/abcdefghijk",
        },
      ],
      [
        "https://m.youtube.com/shorts/abcdefghijk?feature=share",
        {
          platform: "youtube",
          url: "https://www.youtube.com/shorts/abcdefghijk",
        },
      ],
    ] as const)
      expect(videoSource(url)).toEqual(expected);
    for (const bad of [
      "javascript:alert(1)",
      "http://www.instagram.com/reel/a/",
      "https://instagram.com.evil.example/reel/a/",
      "https://user:password@www.instagram.com/reel/a/",
      "https://www.instagram.com:8443/reel/a/",
      "https://www.instagram.com/profile/",
      "https://www.youtube.com/watch?v=abcdefghijk",
      "https://127.0.0.1/video/123",
      "https://tiktok.com.evil.example/t/a/",
      "https://vm.tiktok.com/",
    ])
      expect(videoSource(bad)).toBeNull();
  });
  it("preserves a source image when storage fails or a concurrent replacement wins", async () => {
    const f = setup();
    const source = await f.call<RecipeSource>("add_recipe_source", {
      kind: "image",
    });
    const input = { sourceId: source.id, data: png, contentType: "image/png" };
    const original = await f.call<RecipeSource>(
      "upload_recipe_source_image",
      input,
    );
    const originalKey = [...f.objects.keys()][0];
    const put = vi.spyOn(f.env.IMAGES!, "put");
    put.mockRejectedValueOnce(new Error("private storage failure"));
    await expect(f.call("upload_recipe_source_image", input)).rejects.toThrow(
      "nicht gespeichert",
    );
    expect(await f.call("get_recipe_source", { id: source.id })).toMatchObject({
      source: { imageUrl: original.imageUrl },
    });
    expect([...f.objects.keys()]).toEqual([originalKey]);

    put.mockRestore();
    const originalPut = f.env.IMAGES!.put.bind(f.env.IMAGES!);
    vi.spyOn(f.env.IMAGES!, "put").mockImplementationOnce(async (...args) => {
      const stored = await originalPut(...args);
      const winningKey = `sources/${source.id}/concurrent.png`;
      f.objects.set(winningKey, f.objects.get(originalKey)!);
      f.objects.delete(originalKey);
      f.sqlite
        .prepare("UPDATE recipe_sources SET image_key=? WHERE id=?")
        .run(winningKey, source.id);
      return stored;
    });
    await expect(f.call("upload_recipe_source_image", input)).rejects.toThrow(
      "zwischenzeitlich",
    );
    expect([...f.objects.keys()]).toEqual([
      `sources/${source.id}/concurrent.png`,
    ]);
    expect(
      await f.call("get_recipe_source_image", { sourceId: source.id }),
    ).toMatchObject({ data: png, mimeType: "image/png" });
    vi.restoreAllMocks();
  });
  it("stores video and text sources, exposes them to agents without fetching them, and preserves linked recipes", async () => {
    const f = setup(),
      recipe = await f.create(),
      fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      const video = await f.call<RecipeSource>("add_recipe_source", {
        kind: "video",
        url: "https://www.instagram.com/reel/ABC123/?igsh=secret",
        notes: "Bitte ohne Nüsse.",
        recipeId: recipe.id,
      });
      const text = await f.call<RecipeSource>("add_recipe_source", {
        kind: "text",
        notes: "Beim nächsten Mal weniger Salz.",
      });
      expect(video).toMatchObject({
        url: "https://www.instagram.com/reel/ABC123/",
        ready: true,
        status: "pending",
        recipeId: recipe.id,
      });
      expect(await f.call("get_recipe_source", { id: video.id })).toMatchObject(
        {
          source: { notes: "Bitte ohne Nüsse." },
          recipe: { id: recipe.id },
          contentLanguage: "de",
        },
      );
      expect((await f.call<Catalog>("get_catalog")).sources).toHaveLength(2);
      expect(await f.call("list_recipe_sources")).toMatchObject({
        sources: expect.arrayContaining([
          expect.objectContaining({ id: video.id }),
          expect.objectContaining({ id: text.id }),
        ]),
      });
      await expect(
        f.call("add_recipe_source", { kind: "text", notes: "  " }),
      ).rejects.toThrow();
      await expect(
        f.call("add_recipe_source", {
          kind: "video",
          url: "https://evil.example",
        }),
      ).rejects.toThrow();
      await expect(
        f.call("add_recipe_source", {
          kind: "text",
          notes: "Info",
          recipeId: crypto.randomUUID(),
        }),
      ).rejects.toThrow("Rezept nicht gefunden");
      await expect(
        f.call("set_recipe_source_status", {
          id: video.id,
          status: "needs_info",
        }),
      ).rejects.toThrow("welche Angaben");
      await f.call("set_recipe_source_status", {
        id: video.id,
        status: "needs_info",
        resolution: "Bitte ein Transkript angeben.",
      });
      expect(
        (await f.call<{ sources: RecipeSource[] }>("list_recipe_sources"))
          .sources,
      ).toHaveLength(1);
      expect(
        await f.call("list_recipe_sources", { status: "needs_info" }),
      ).toMatchObject({
        sources: [
          { id: video.id, resolution: "Bitte ein Transkript angeben." },
        ],
      });
      await f.call("set_recipe_source_status", {
        id: video.id,
        status: "done",
        resolution: "Hinweise als Kommentar ergänzt.",
      });
      const edited = await f.call<RecipeSource>("update_recipe_source", {
        ...video,
        notes: "Andere Hinweise",
        title: "Neue Hinweise",
      });
      expect(edited).toMatchObject({
        status: "pending",
        resolution: "",
        title: "Neue Hinweise",
      });
      await f.call("delete_recipe_source", { id: video.id });
      expect(await f.call("get_recipe", { id: recipe.id })).toMatchObject({
        id: recipe.id,
      });
      await expect(
        f.call("set_recipe_source_status", { id: text.id, status: "done" }),
      ).rejects.toThrow("Rezept zu");
      await f.call("set_recipe_source_status", {
        id: text.id,
        status: "done",
        recipeId: recipe.id,
      });
      await f.call("delete_recipe", { id: recipe.id });
      expect(await f.call("get_recipe_source", { id: text.id })).toMatchObject({
        source: { recipeId: null },
        recipe: null,
      });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("keeps image drafts out of the agent queue until upload, protects reads, replaces and cleans up private images", async () => {
    const f = setup(),
      source = await f.call<RecipeSource>("add_recipe_source", {
        kind: "image",
        notes: "Foto aus dem Kochbuch.",
      });
    expect(source.ready).toBe(false);
    expect(await f.call("list_recipe_sources")).toEqual({ sources: [] });
    expect(
      await f.call("list_recipe_sources", { includeIncomplete: true }),
    ).toMatchObject({ sources: [{ id: source.id, ready: false }] });
    await expect(
      f.call("upload_recipe_source_image", {
        sourceId: source.id,
        data: png,
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow("gültiges");
    expect(f.objects.size).toBe(0);
    const input = {
      sourceId: source.id,
      data: png,
      contentType: "image/png",
      altText: "Handschriftliches Rezept",
    };
    const uploaded = await f.call<RecipeSource>(
      "upload_recipe_source_image",
      input,
    );
    expect(uploaded.ready).toBe(true);
    expect(uploaded.imageUrl).toContain(
      `/api/recipe-sources/${source.id}/image?v=`,
    );
    expect(f.objects.size).toBe(1);
    expect(
      await f.call("get_recipe_source_image", { sourceId: source.id }),
    ).toMatchObject({
      data: png,
      mimeType: "image/png",
      altText: input.altText,
    });
    await expect(
      routeRequest(
        new Request(f.env.APP_ORIGIN + uploaded.imageUrl),
        f.env,
        {} as ExecutionContext,
      ),
    ).rejects.toThrow("Passkey");
    const token = "source-test-session";
    f.sqlite
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(await hash(token), f.access.user.id, Date.now() + 60000);
    const path = f.env.APP_ORIGIN + `/api/recipe-sources/${source.id}/image`;
    const response = await routeRequest(
      new Request(path, { headers: { Cookie: `lunchju_session=${token}` } }),
      f.env,
      {} as ExecutionContext,
    );
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(response?.headers.get("content-type")).toBe("image/png");
    const form = new FormData();
    form.set(
      "image",
      new File([Buffer.from(png, "base64")], "source.png", {
        type: "image/png",
      }),
    );
    form.set("altText", "Ersetzt");
    await expect(
      routeRequest(
        new Request(path, {
          method: "POST",
          headers: {
            Origin: "https://other.example",
            Cookie: `lunchju_session=${token}`,
          },
          body: form,
        }),
        f.env,
        {} as ExecutionContext,
      ),
    ).rejects.toThrow("LunchJu-Website");
    const replaced = await routeRequest(
      new Request(path, {
        method: "POST",
        headers: {
          Origin: f.env.APP_ORIGIN,
          Cookie: `lunchju_session=${token}`,
        },
        body: form,
      }),
      f.env,
      {} as ExecutionContext,
    );
    expect(await replaced?.json()).toMatchObject({ imageAlt: "Ersetzt" });
    expect(f.objects.size).toBe(1);
    await f.call("delete_recipe_source_image", { sourceId: source.id });
    expect(f.objects.size).toBe(0);
    expect(await f.call("list_recipe_sources")).toEqual({ sources: [] });
    await f.call("upload_recipe_source_image", input);
    await f.call("delete_recipe_source", { id: source.id });
    expect(f.objects.size).toBe(0);
  });
  it("enforces MCP scopes and serves source images as native image content", async () => {
    const f = setup();
    let scopes = ["mcp:read", "mcp:write", "mcp:admin"];
    f.env.OAUTH_STATE = {
      idFromName: () => "test",
      get: () => ({
        fetch: async () => Response.json({ subject: f.access.user.id, scopes }),
      }),
    } as unknown as DurableObjectNamespace;
    const client = new Client({ name: "Source test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(f.env.APP_ORIGIN + "/mcp"),
      {
        requestInit: {
          headers: { Authorization: "Bearer test", Host: "kitchen.example" },
        },
        fetch: (input, init) =>
          handleMcp(new Request(input, init), f.env, {
            waitUntil() {},
          } as unknown as ExecutionContext),
      },
    );
    try {
      await client.connect(transport);
      expect(client.getInstructions()).toContain("keine externen Videos");
      const added = await client.callTool({
        name: "add_recipe_source",
        arguments: { kind: "image", notes: "Auswerten, bitte." },
      });
      const source = added.structuredContent as unknown as RecipeSource;
      expect(added.isError).not.toBe(true);
      await client.callTool({
        name: "upload_recipe_source_image",
        arguments: {
          sourceId: source.id,
          data: png,
          contentType: "image/png",
          altText: "Rezeptfoto",
        },
      });
      const image = await client.callTool({
        name: "get_recipe_source_image",
        arguments: { sourceId: source.id },
      });
      expect(image.content).toContainEqual({
        type: "image",
        data: png,
        mimeType: "image/png",
      });
      expect(image.structuredContent).toMatchObject({
        sourceId: source.id,
        altText: "Rezeptfoto",
      });
      scopes = ["mcp:read"];
      expect(
        (
          await client.callTool({
            name: "add_recipe_source",
            arguments: { kind: "text", notes: "Verboten" },
          })
        ).isError,
      ).toBe(true);
      scopes = ["mcp:read", "mcp:write"];
      expect(
        (
          await client.callTool({
            name: "delete_recipe_source",
            arguments: { id: source.id },
          })
        ).isError,
      ).toBe(true);
      expect(f.objects.size).toBe(1);
    } finally {
      await client.close();
    }
  });
  it("renders source notes as plain text without third-party embeds and explains agent processing", async () => {
    const f = setup(),
      source = await f.call<RecipeSource>("add_recipe_source", {
        kind: "video",
        url: "https://www.youtube.com/shorts/abcdefghijk",
        notes: "<script>bad()</script>",
      });
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, {
        initialLanguage: "en",
        children: createElement(RecipeSources, {
          sources: [source],
          recipes: [],
          async onChanged() {},
          onOpen() {},
        }),
      }),
    );
    expect(html).toContain("Sources for your agent");
    expect(html).toContain("Copy agent prompt");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<(iframe|video|script)/);
    expect(html).not.toContain("youtube.com/embed");
    expect(sourcePrompt(source, "de")).toContain(source.id);
    expect(sourcePrompt(source, "en")).toContain("Do not invent");
  });
});
