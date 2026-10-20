import { describe, it, expect, vi } from "vitest";
import { fixture } from "./support/db";
import { runOperation } from "../src/server/operations";
import {
  getRecipeImage,
  MAX_IMAGE_BYTES,
  decodeImage,
} from "../src/server/images";
import { hash } from "../src/server/security";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { handleMcp } from "../src/server/mcp";
vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: () => new Response() },
}));
import { routeRequest } from "../src/server";

const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVf8AAAAASUVORK5CYII=",
    "base64",
  ),
);
async function imagesFixture() {
  const f = fixture();
  const objects = new Map<
    string,
    { bytes: Uint8Array; httpMetadata: { contentType: string } }
  >();
  const put = vi.fn(
    async (
      key: string,
      bytes: Uint8Array,
      options: { httpMetadata: { contentType: string } },
    ) => {
      objects.set(key, {
        bytes: bytes.slice(),
        httpMetadata: options.httpMetadata,
      });
    },
  );
  f.env.IMAGES = {
    put,
    delete: async (key: string) => {
      objects.delete(key);
    },
    get: async (key: string) => {
      const item = objects.get(key);
      if (!item) return null;
      return {
        httpMetadata: item.httpMetadata,
        body: item.bytes,
        arrayBuffer: async () => item.bytes.buffer,
      };
    },
  } as unknown as R2Bucket;
  const recipe = (await runOperation(
    "create_recipe",
    {
      name: "Tomatensalat",
      ingredients: [{ name: "Tomaten", quantity: 2, unit: "piece" }],
      instructions: ["Tomaten schneiden."],
    },
    f.env,
    f.access,
  )) as { id: string };
  const call = (name: string, input: unknown) =>
    runOperation(name, input, f.env, f.access);
  return { ...f, recipe, objects, put, call };
}
describe("Private recipe images", () => {
  it("uploads, reads and replaces images without losing recipe fields or leaking an old object", async () => {
    const f = await imagesFixture();
    const uploaded = (await f.call("upload_recipe_image", {
      recipeId: f.recipe.id,
      data: Buffer.from(png).toString("base64"),
      contentType: "image/png",
      altText: "Ein Tomatensalat",
    })) as { imageUrl: string; imageAlt: string };
    expect(uploaded.imageUrl).toContain(`/api/recipes/${f.recipe.id}/image?v=`);
    expect(uploaded.imageAlt).toBe("Ein Tomatensalat");
    expect(f.objects.size).toBe(1);
    const data = await f.call("get_recipe_image", { recipeId: f.recipe.id });
    expect(data).toMatchObject({
      data: Buffer.from(png).toString("base64"),
      mimeType: "image/png",
    });
    await f.call("upload_recipe_image", {
      recipeId: f.recipe.id,
      data: Buffer.from(png).toString("base64"),
      contentType: "image/png",
      altText: "Neues Bild",
    });
    expect(f.objects.size).toBe(1);
    const recipe = await f.call("get_recipe", { id: f.recipe.id });
    expect(recipe).toMatchObject({
      name: "Tomatensalat",
      imageAlt: "Neues Bild",
    });
    await f.call("delete_recipe_image", { recipeId: f.recipe.id });
    expect(f.objects.size).toBe(0);
    expect(await f.call("get_recipe", { id: f.recipe.id })).toMatchObject({
      imageUrl: null,
    });
  });
  it("rejects unsupported content, invalid base64, oversized images and missing recipes before storing anything", async () => {
    const f = await imagesFixture();
    const input = {
      recipeId: f.recipe.id,
      data: Buffer.from(png).toString("base64"),
      contentType: "image/jpeg",
    };
    await expect(f.call("upload_recipe_image", input)).rejects.toThrow(
      "gültiges",
    );
    expect(() => decodeImage("not base64!")).toThrow("Base64");
    await expect(
      f.call("upload_recipe_image", {
        ...input,
        contentType: "image/png",
        data: Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64"),
      }),
    ).rejects.toThrow("5 MB");
    await expect(
      f.call("upload_recipe_image", {
        ...input,
        contentType: "image/png",
        recipeId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("Rezept nicht gefunden");
    expect(f.put).not.toHaveBeenCalled();
  });
  it("enforces write and delete scopes and removes stored images when the recipe is deleted", async () => {
    const f = await imagesFixture();
    const input = {
      recipeId: f.recipe.id,
      data: Buffer.from(png).toString("base64"),
      contentType: "image/png",
    };
    await expect(
      runOperation("upload_recipe_image", input, f.env, {
        ...f.access,
        agent: true,
        scopes: ["mcp:read"],
      }),
    ).rejects.toThrow("mcp:write");
    await f.call("upload_recipe_image", input);
    await expect(
      runOperation("delete_recipe_image", { recipeId: f.recipe.id }, f.env, {
        ...f.access,
        agent: true,
        scopes: ["mcp:read", "mcp:write"],
      }),
    ).rejects.toThrow("mcp:admin");
    await f.call("delete_recipe", { id: f.recipe.id });
    expect(f.objects.size).toBe(0);
  });
  it("keeps the old image if R2 upload fails and rejects a concurrent overwrite", async () => {
    const f = await imagesFixture();
    const input = {
      recipeId: f.recipe.id,
      data: Buffer.from(png).toString("base64"),
      contentType: "image/png",
    };
    await f.call("upload_recipe_image", input);
    const firstKey = [...f.objects.keys()][0];
    f.put.mockRejectedValueOnce(new Error("R2 unavailable"));
    await expect(f.call("upload_recipe_image", input)).rejects.toThrow(
      "nicht gespeichert",
    );
    expect(f.objects.has(firstKey)).toBe(true);
    const original = f.put.getMockImplementation()!;
    f.put.mockImplementationOnce(async (...args) => {
      await original(...args);
      f.sqlite
        .prepare("UPDATE recipes SET image_key='newer-image' WHERE id=?")
        .run(f.recipe.id);
    });
    await expect(f.call("upload_recipe_image", input)).rejects.toThrow(
      "zwischenzeitlich",
    );
    expect(
      f.sqlite
        .prepare("SELECT image_key FROM recipes WHERE id=?")
        .get(f.recipe.id)?.image_key,
    ).toBe("newer-image");
    expect(f.objects.size).toBe(1);
  });
  it("requires a passkey session to read an image and validates origin for browser uploads", async () => {
    const f = await imagesFixture(),
      path = f.env.APP_ORIGIN + `/api/recipes/${f.recipe.id}/image`;
    await expect(
      routeRequest(new Request(path), f.env, {} as ExecutionContext),
    ).rejects.toThrow("Passkey");
    const token = "test-image-session";
    f.sqlite
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(await hash(token), f.access.user.id, Date.now() + 60000);
    const form = new FormData();
    form.set("image", new File([png], "salat.png", { type: "image/png" }));
    form.set("altText", "Tomatensalat");
    const uploaded = await routeRequest(
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
    expect(uploaded?.status).toBe(200);
    const image = await routeRequest(
      new Request(path, { headers: { Cookie: `lunchju_session=${token}` } }),
      f.env,
      {} as ExecutionContext,
    );
    expect(image?.headers.get("Content-Type")).toBe("image/png");
    expect(image?.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await image!.arrayBuffer())).toEqual(png);
    await expect(
      routeRequest(
        new Request(path, {
          method: "POST",
          headers: {
            Origin: "https://other.example",
            Cookie: `lunchju_session=${token}`,
          },
          body: new FormData(),
        }),
        f.env,
        {} as ExecutionContext,
      ),
    ).rejects.toThrow("LunchJu-Website");
  });
  it("keeps a gallery, replaces individual images, edits descriptions and promotes a new cover after deletion", async () => {
    const f = await imagesFixture();
    const input = {
      recipeId: f.recipe.id,
      data: Buffer.from(png).toString("base64"),
      contentType: "image/png",
    };
    const first = (await f.call("upload_recipe_image", {
      ...input,
      altText: "Titel",
    })) as import("../src/shared").Recipe;
    const coverId = first.images[0].id;
    const second = (await f.call("upload_recipe_image", {
      ...input,
      append: true,
      altText: "Schritt eins",
    })) as import("../src/shared").Recipe;
    const extraId = second.images.find((image) => image.id !== coverId)!.id;
    expect(second.images).toHaveLength(2);
    expect(second.imageUrl).toBe(first.imageUrl);
    expect(f.objects.size).toBe(2);
    const replaced = (await f.call("upload_recipe_image", {
      ...input,
      imageId: extraId,
      altText: "Schritt zwei",
    })) as import("../src/shared").Recipe;
    expect(replaced.images.find((image) => image.id === extraId)?.altText).toBe(
      "Schritt zwei",
    );
    expect(replaced.imageUrl).toBe(first.imageUrl);
    expect(f.objects.size).toBe(2);
    const updated = (await f.call("update_recipe_image", {
      recipeId: f.recipe.id,
      imageId: extraId,
      makeCover: true,
      altText: "Fertig angerichtet",
    })) as import("../src/shared").Recipe;
    expect(updated.imageAlt).toBe("Fertig angerichtet");
    expect(updated.imageUrl).not.toBe(first.imageUrl);
    expect(
      await f.call("get_recipe_image", {
        recipeId: f.recipe.id,
        imageId: coverId,
      }),
    ).toMatchObject({ imageId: coverId, altText: "Titel" });
    const otherRecipe = (await f.call("create_recipe", {
      name: "Anderer Salat",
      ingredients: [{ name: "Tomaten", quantity: 1, unit: "piece" }],
      instructions: ["Schneiden."],
    })) as { id: string };
    for (const operation of [
      "get_recipe_image",
      "update_recipe_image",
      "delete_recipe_image",
    ]) {
      await expect(
        f.call(operation, { recipeId: otherRecipe.id, imageId: extraId }),
      ).rejects.toThrow("Rezeptbild nicht gefunden");
    }
    const removed = (await f.call("delete_recipe_image", {
      recipeId: f.recipe.id,
      imageId: extraId,
    })) as import("../src/shared").Recipe;
    expect(removed.images).toHaveLength(1);
    expect(removed.imageAlt).toBe("Titel");
    expect(removed.imageUrl).toBe(first.imageUrl);
    expect(f.objects.size).toBe(1);
    await f.call("upload_recipe_image", { ...input, append: true });
    await f.call("delete_recipe", { id: f.recipe.id });
    expect(f.objects.size).toBe(0);
    expect(
      f.sqlite.prepare("SELECT COUNT(*) AS n FROM recipe_images").get()?.n,
    ).toBe(0);
  });
  it("enforces gallery limits before storage and cleans up uploads racing with recipe deletion", async () => {
    const f = await imagesFixture();
    const input = {
      recipeId: f.recipe.id,
      data: Buffer.from(png).toString("base64"),
      contentType: "image/png",
      append: true,
    };
    for (let i = 0; i < 20; i++) await f.call("upload_recipe_image", input);
    const calls = f.put.mock.calls.length;
    await expect(f.call("upload_recipe_image", input)).rejects.toThrow(
      "20 Bilder",
    );
    expect(f.put.mock.calls).toHaveLength(calls);
    await expect(
      f.call("upload_recipe_image", { ...input, imageId: crypto.randomUUID() }),
    ).rejects.toThrow("entweder");
    const empty = await imagesFixture();
    const put = empty.put.getMockImplementation()!;
    empty.put.mockImplementationOnce(async (...args) => {
      await put(...args);
      empty.sqlite
        .prepare("DELETE FROM recipes WHERE id=?")
        .run(empty.recipe.id);
    });
    await expect(
      empty.call("upload_recipe_image", {
        ...input,
        recipeId: empty.recipe.id,
      }),
    ).rejects.toThrow("zwischenzeitlich");
    expect(empty.objects.size).toBe(0);
  });
  it("protects every gallery URL and supports multipart append and targeted replacement", async () => {
    const f = await imagesFixture(),
      token = "gallery-test-session";
    f.sqlite
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(await hash(token), f.access.user.id, Date.now() + 60000);
    const upload = async (path: string, append: boolean) => {
      const form = new FormData();
      form.set("image", new File([png], "photo.png", { type: "image/png" }));
      form.set("append", String(append));
      const response = await routeRequest(
        new Request(f.env.APP_ORIGIN + path, {
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
      return (await response!.json()) as import("../src/shared").Recipe;
    };
    await upload(`/api/recipes/${f.recipe.id}/image`, true);
    const gallery = await upload(`/api/recipes/${f.recipe.id}/image`, true);
    const image = gallery.images[1],
      path = `/api/recipes/${f.recipe.id}/images/${image.id}`;
    await expect(
      routeRequest(
        new Request(f.env.APP_ORIGIN + image.url),
        f.env,
        {} as ExecutionContext,
      ),
    ).rejects.toThrow("Passkey");
    const response = await routeRequest(
      new Request(f.env.APP_ORIGIN + image.url, {
        headers: { Cookie: `lunchju_session=${token}` },
      }),
      f.env,
      {} as ExecutionContext,
    );
    expect(response!.headers.get("Cache-Control")).toBe("no-store");
    expect((await upload(path, false)).images).toHaveLength(2);
    expect(f.objects.size).toBe(2);
  });
  it("allows only one overlapping replacement and returns targeted gallery images as native MCP content", async () => {
    const f = await imagesFixture();
    const input = {
      recipeId: f.recipe.id,
      data: Buffer.from(png).toString("base64"),
      contentType: "image/png",
    };
    await f.call("upload_recipe_image", input);
    const original = f.put.getMockImplementation()!;
    let arrivals = 0,
      release!: () => void;
    const bothUploaded = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.put.mockImplementation(async (...args) => {
      await original(...args);
      if (++arrivals === 2) release();
      await bothUploaded;
    });
    const results = await Promise.allSettled([
      f.call("upload_recipe_image", input),
      f.call("upload_recipe_image", input),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(f.objects.size).toBe(1);
    const recipe = (await f.call("get_recipe", {
      id: f.recipe.id,
    })) as import("../src/shared").Recipe;
    expect(recipe.images).toHaveLength(1);
    f.env.OAUTH_STATE = {
      idFromName: () => "test",
      get: () => ({
        fetch: async () =>
          Response.json({ subject: f.access.user.id, scopes: ["mcp:read"] }),
      }),
    } as unknown as DurableObjectNamespace;
    const client = new Client({ name: "Gallery image test", version: "1.0.0" });
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
      const image = await client.callTool({
        name: "get_recipe_image",
        arguments: { recipeId: f.recipe.id, imageId: recipe.images[0].id },
      });
      expect(image.isError).not.toBe(true);
      expect(image.structuredContent).toMatchObject({
        imageId: recipe.images[0].id,
        recipeId: f.recipe.id,
      });
      expect(image.content).toContainEqual({
        type: "image",
        data: input.data,
        mimeType: "image/png",
      });
    } finally {
      await client.close();
    }
  });
});
