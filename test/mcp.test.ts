import { describe, it, expect, vi } from "vitest";
import { fixture } from "./support/db";
import { handleMcp } from "../src/server/mcp";

// Isolate transport negotiation so this test can assert the hand-off between
// OAuth validation and the business request's readable body.
vi.mock("agents/mcp/server", () => ({
  createMcpHandler: () => async (request: Request) =>
    Response.json(await request.json()),
}));

describe("MCP authentication hand-off", () => {
  it("keeps the tool body readable while sending only the bearer token for validation", async () => {
    const f = fixture();
    f.env.OAUTH_STATE = {
      idFromName: () => "test-object",
      get: () => ({
        fetch: async (request: Request) => {
          expect(request.method).toBe("GET");
          expect(request.body).toBeNull();
          expect(request.headers.get("Authorization")).toBe(
            "Bearer example-token",
          );
          return Response.json({
            subject: f.access.user.id,
            scopes: ["mcp:read"],
          });
        },
      }),
    } as unknown as DurableObjectNamespace;
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_catalog", arguments: {} },
    };
    const request = new Request(f.env.APP_ORIGIN + "/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer example-token",
      },
      body: JSON.stringify(body),
    });
    const response = await handleMcp(request, f.env, {} as ExecutionContext);
    expect(await response.json()).toEqual(body);
  });
});

describe("Authenticated image payloads", () => {
  it("accepts an image tool body larger than the ordinary JSON limit after checking the bearer", async () => {
    const f = fixture();
    f.env.AGENT_API_KEY = "test-agent-image-key-of-sufficient-length";
    const data = Buffer.alloc(300000).toString("base64");
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "upload_recipe_image",
        arguments: {
          recipeId: crypto.randomUUID(),
          data,
          contentType: "image/png",
        },
      },
    };
    const request = new Request(f.env.APP_ORIGIN + "/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${f.env.AGENT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const response = await handleMcp(request, f.env, {} as ExecutionContext);
    expect(await response.json()).toEqual(body);
  });
  it("refuses an unauthorized upload without reading its body", async () => {
    const f = fixture();
    f.env.OAUTH_STATE = {
      idFromName: () => "test",
      get: () => ({
        fetch: async () => new Response("Unauthorized", { status: 401 }),
      }),
    } as unknown as DurableObjectNamespace;
    const request = new Request(f.env.APP_ORIGIN + "/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ large: "x".repeat(300000) }),
    });
    const response = await handleMcp(request, f.env, {} as ExecutionContext);
    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
  });
});
