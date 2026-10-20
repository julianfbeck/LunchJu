import { describe, expect, it } from "vitest";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { fixture } from "./support/db";
import { runOperation } from "../src/server/operations";
import { handleMcp } from "../src/server/mcp";
import { currentUser, authRoute } from "../src/server/auth";
import { hash, randomToken } from "../src/server/security";
import type { Catalog } from "../src/shared";

describe("Account and agent language", () => {
  it("persists the account choice, exposes it to sessions and catalog, and isolates members", async () => {
    const f = fixture();
    const memberId = crypto.randomUUID();
    f.sqlite
      .prepare("INSERT INTO users(id,name,role) VALUES (?,?,'member')")
      .run(memberId, "Sam");
    const member = {
      ...f.access,
      user: { ...f.access.user, id: memberId, role: "member" as const },
    };
    expect(await runOperation("get_language", {}, f.env, member)).toEqual({
      language: "de",
    });
    await runOperation(
      "set_language",
      { language: "en", userId: f.access.user.id },
      f.env,
      member,
    );
    expect(await runOperation("get_language", {}, f.env, f.access)).toEqual({
      language: "de",
    });
    const catalog = (await runOperation(
      "get_catalog",
      {},
      f.env,
      member,
    )) as Catalog;
    expect(catalog).toMatchObject({
      contentLanguage: "en",
      home: { locale: "en-GB" },
      user: { language: "en" },
    });
    const token = randomToken();
    f.sqlite
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(await hash(token), memberId, Date.now() + 60000);
    const request = new Request(f.env.APP_ORIGIN + "/api/auth/session", {
      headers: { Cookie: `lunchju_session=${token}; lunchju_language=de` },
    });
    expect(await currentUser(f.env, request)).toMatchObject({
      id: memberId,
      language: "en",
    });
    expect(
      await (await authRoute(f.env, request, "/api/auth/session")).json(),
    ).toMatchObject({ user: { language: "en" } });
    await expect(
      runOperation("set_language", { language: "fr" }, f.env, member),
    ).rejects.toThrow();
    await expect(
      runOperation("set_language", { language: "de" }, f.env, {
        ...member,
        agent: true,
        scopes: ["mcp:read"],
      }),
    ).rejects.toThrow("mcp:write");
  });

  it("refreshes language for an already connected OAuth client and all content tools", async () => {
    const f = fixture();
    f.env.OAUTH_STATE = {
      idFromName: () => "test-object",
      get: () => ({
        fetch: async () =>
          Response.json({
            subject: f.access.user.id,
            scopes: ["mcp:read", "mcp:write"],
          }),
      }),
    } as unknown as DurableObjectNamespace;
    const client = new Client({ name: "Language test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(f.env.APP_ORIGIN + "/mcp"),
      {
        requestInit: {
          headers: {
            Authorization: "Bearer unchanged-oauth-token",
            Host: "kitchen.example",
          },
        },
        fetch: async (input, init) =>
          handleMcp(new Request(input, init), f.env, {
            waitUntil() {},
          } as unknown as ExecutionContext),
      },
    );
    try {
      await client.connect(transport);
      expect(client.getInstructions()).toContain("de (Deutsch)");
      await runOperation("set_language", { language: "en" }, f.env, f.access);
      const catalog = await client.callTool({
        name: "get_catalog",
        arguments: {},
      });
      expect(catalog.structuredContent).toMatchObject({
        contentLanguage: "en",
      });
      expect(JSON.stringify(catalog.content)).toContain("en (English)");
      const tools = await client.listTools();
      for (const name of [
        "create_recipe",
        "add_pantry_item",
        "upload_recipe_image",
        "set_recipe_scaling",
      ])
        expect(
          tools.tools.find((tool) => tool.name === name)?.description,
        ).toContain("in English");
      const result = await client.callTool({
        name: "create_recipe",
        arguments: {
          name: "Tomato pasta",
          ingredients: [{ name: "Tomatoes", quantity: 200, unit: "g" }],
          instructions: ["Cook the pasta."],
        },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        name: "Tomato pasta",
        ingredients: [{ name: "Tomatoes", unit: "g" }],
      });
      await runOperation("set_language", { language: "de" }, f.env, f.access);
      const language = await client.callTool({
        name: "get_language",
        arguments: {},
      });
      expect(language.structuredContent).toEqual({ language: "de" });
      expect(JSON.stringify(language.content)).toContain("de (Deutsch)");
      const existing = (await runOperation(
        "get_catalog",
        {},
        f.env,
        f.access,
      )) as Catalog;
      expect(existing.recipes[0].name).toBe("Tomato pasta");
    } finally {
      await client.close();
    }
  });
});
