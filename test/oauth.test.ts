import { describe, it, expect } from "vitest";
import { fixture } from "./support/db";
import { durableState } from "./support/cloudflare";
import { LunchJuOAuth } from "../src/server/oauth";
import { hash, randomToken } from "../src/server/security";

async function oauthFixture(
  scopes = ["mcp:read", "mcp:write"],
  persistent = true,
) {
  const f = fixture(),
    state = durableState(),
    coordinator = new LunchJuOAuth(state, f.env),
    origin = f.env.APP_ORIGIN;
  const token = randomToken();
  f.sqlite
    .prepare("INSERT INTO sessions VALUES (?,?,?)")
    .run(await hash(token), f.access.user.id, Date.now() + 60000);
  const call = (path: string, init?: RequestInit) =>
    coordinator.fetch(new Request(origin + path, init));
  const registered = await call("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Kitchen agent",
      redirect_uris: ["https://agent.example/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  expect(registered.status).toBe(201);
  const client = (await registered.json()) as { client_id: string };
  const verifier = randomToken(),
    params = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: "https://agent.example/callback",
      response_type: "code",
      scope: "mcp:read offline_access",
      state: "test-state",
      code_challenge: await hash(verifier),
      code_challenge_method: "S256",
      resource: origin + "/mcp",
    });
  const authorization = await call("/oauth/authorize?" + params, {
    headers: { Cookie: `lunchju_session=${token}` },
  });
  expect(authorization.status).toBe(200);
  const html = await authorization.text(),
    handle = html.match(/name="handle" value="([^"]+)"/)?.[1];
  expect(handle).toBeTruthy();
  const cookies = [
    `lunchju_session=${token}`,
    ...authorization.headers.getSetCookie().map((value) => value.split(";")[0]),
  ].join("; ");
  const form = new URLSearchParams({
    handle: handle!,
    decision: "approve",
  });
  if (persistent) form.set("persistent", "yes");
  scopes.forEach((scope) => form.append("scope", scope));
  const consent = await call("/oauth/authorize", {
    method: "POST",
    headers: {
      Cookie: cookies,
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  expect(consent.status).toBe(200);
  const returnHtml = await consent.text();
  expect(returnHtml).toContain("Verbindung hergestellt.");
  const callback = new URL(
    returnHtml.match(/content="0;url=([^"]+)"/)![1].replaceAll("&#38;", "&"),
  );
  const exchange = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: client.client_id,
    redirect_uri: "https://agent.example/callback",
    code: callback.searchParams.get("code")!,
    code_verifier: verifier,
    resource: origin + "/mcp",
  });
  const response = await call("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: exchange,
  });
  expect(response.status).toBe(200);
  const tokens = (await response.json()) as {
    access_token: string;
    refresh_token: string;
  };
  return { ...f, call, tokens, client, exchange, state };
}
describe("Agent OAuth coordinator", () => {
  it("does not issue continuing access unless explicitly approved", async () => {
    const f = await oauthFixture(["mcp:read"], false);
    expect(f.tokens.access_token).toBeTruthy();
    expect(f.tokens.refresh_token).toBeUndefined();
  });
  it("runs PKCE registration, passkey-session consent, token exchange and scoped validation end to end", async () => {
    const f = await oauthFixture();
    const checked = await f.call("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${f.tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(checked.status).toBe(200);
    expect(await checked.json()).toMatchObject({
      subject: f.access.user.id,
      scopes: expect.arrayContaining(["mcp:read", "mcp:write"]),
    });
    expect(f.sqlite.prepare("SELECT * FROM audit_log").all()).toHaveLength(0); // Validation performs no MCP tools.
    const reused = await f.call("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: f.exchange,
    });
    expect(reused.status).toBe(400);
  });
  it("persists refresh access across coordinator restarts and applies revocation to subsequent validations", async () => {
    const f = await oauthFixture(["mcp:read"]);
    const restarted = new LunchJuOAuth(f.state, f.env);
    const response = await restarted.fetch(
      new Request(f.env.APP_ORIGIN + "/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: f.client.client_id,
          refresh_token: f.tokens.refresh_token,
          resource: f.env.APP_ORIGIN + "/mcp",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const next = (await response.json()) as {
      access_token: string;
      refresh_token: string;
    };
    const revoked = await f.call("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: f.client.client_id,
        token: next.refresh_token,
        token_type_hint: "refresh_token",
      }),
    });
    expect(revoked.status).toBe(200);
    expect(
      (
        await f.call("/mcp", {
          headers: { Authorization: `Bearer ${next.access_token}` },
        })
      ).status,
    ).toBe(401);
  });
  it("does not accept consent submitted from another site", async () => {
    const f = fixture(),
      coordinator = new LunchJuOAuth(durableState(), f.env),
      token = randomToken();
    f.sqlite
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(await hash(token), f.access.user.id, Date.now() + 60000);
    const response = await coordinator.fetch(
      new Request(f.env.APP_ORIGIN + "/oauth/authorize", {
        method: "POST",
        headers: {
          Cookie: `lunchju_session=${token}`,
          Origin: "https://evil.example",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "handle=anything&decision=approve",
      }),
    );
    expect(response.status).toBe(403);
  });
});
