import { describe, it, expect, vi } from "vitest";
import { fixture } from "./support/db";
import { runOperation } from "../src/server/operations";
import {
  getRecipeImage,
  MAX_IMAGE_BYTES,
  decodeImage,
} from "../src/server/images";
import { hash } from "../src/server/security";
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
});
