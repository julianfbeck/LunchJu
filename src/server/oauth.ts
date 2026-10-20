import { DurableObject } from "cloudflare:workers";
import {
  OAuthProvider,
  getOAuthApi,
  AuthorizationError,
  type OAuthHelpers,
  type OAuthProviderOptions,
  type OAuthResourceContext,
} from "@cloudflare/workers-oauth-provider";
import { DurableOAuthStorage } from "./oauth-storage";
import { currentUser } from "./auth";
import { hash, randomToken, boundedBody, cookie, setCookie } from "./security";
import { HttpError, origin, type Env } from "./types";

type Props = { subject: string; scopes: string[]; persistent: boolean };
type OAuthEnv = Env & { OAUTH_KV: KVNamespace; OAUTH_PROVIDER?: OAuthHelpers };
const SCOPES = ["mcp:read", "mcp:write", "mcp:admin", "offline_access"];
const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
function page(body: string, headers?: Headers, status = 200) {
  const h = new Headers(headers);
  h.set("Content-Type", "text/html;charset=utf-8");
  h.set("Cache-Control", "no-store");
  h.set("Referrer-Policy", "same-origin");
  h.set("X-Frame-Options", "DENY");
  h.set(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LunchJu · Agent access</title><style>body{background:#f7f7ef;color:#243e30;font:17px/1.6 system-ui;max-width:620px;margin:60px auto;padding:24px}h1{font-size:34px;letter-spacing:-1px}label{display:block;padding:14px 0}button,a.button{display:inline-block;background:#2c6046;color:white;border:0;border-radius:12px;padding:14px 22px;font:inherit;margin:12px 8px 12px 0;text-decoration:none}a{color:#2c6046}section{border-bottom:1px solid #d8ded1;padding:16px 0}small{color:#687466}input{accent-color:#2c6046}</style><body><p>◒ LUNCHJU / YOUR KITCHEN, CONNECTED</p>${body}</body></html>`,
    { status, headers: h },
  );
}
function continueTo(location: string, headers: Headers) {
  const target = new URL(location);
  const h = new Headers(headers);
  h.delete("Location");
  return page(
    `<meta http-equiv="refresh" content="0;url=${escape(location)}"><h1>You're connected.</h1><p>Returning to ${escape(target.host || target.protocol)}.</p><a href="${escape(location)}">Continue to your agent</a>`,
    h,
  );
}
export function isOAuthPath(path: string) {
  return path.startsWith("/oauth/") || path.startsWith("/.well-known/");
}

/** OAuth mutations and validation share this queue. MCP tools execute in the
 * outer Worker, so an admitted slow tool never blocks other users' token checks.
 * A revocation blocks subsequent validations; already admitted calls may finish. */
export class LunchJuOAuth extends DurableObject<Env> {
  private storageAdapter: DurableOAuthStorage;
  private oauthEnv: OAuthEnv;
  private provider: OAuthProvider<OAuthEnv>;
  private tail: Promise<void> = Promise.resolve();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.storageAdapter = new DurableOAuthStorage(ctx.storage);
    this.oauthEnv = { ...env, OAUTH_KV: this.storageAdapter.asKVNamespace() };
    const issuer = origin(env);
    const options: OAuthProviderOptions<OAuthEnv> = {
      apiRoute: `${issuer}/mcp`,
      authorizeEndpoint: `${issuer}/oauth/authorize`,
      tokenEndpoint: `${issuer}/oauth/token`,
      clientRegistrationEndpoint: `${issuer}/oauth/register`,
      scopesSupported: SCOPES,
      requiredScopes: ["mcp:read"],
      accessTokenTTL: 900,
      refreshTokenTTL: undefined,
      clientRegistrationTTL: 90 * 86400,
      clientIdMetadataDocumentEnabled: true,
      resourceMetadata: {
        resource: `${issuer}/mcp`,
        authorization_servers: [issuer],
      },
      tokenExchangeCallback: async (options) => {
        const user = await env.DB.prepare(
          "SELECT id FROM users WHERE id=? AND active=1",
        )
          .bind(options.userId)
          .first();
        if (!user)
          throw new HttpError(401, "This household account is disabled.");
        if (
          options.grantType === "authorization_code" &&
          !options.props?.persistent
        )
          return { refreshTokenTTL: 0 };
      },
      apiHandler: {
        fetch: async (_request, _env, context) => {
          const verified = context as OAuthResourceContext<Props>;
          const props = verified.props;
          if (
            !props ||
            props.subject !== verified.auth.userId ||
            !Array.isArray(props.scopes)
          )
            return new Response("Invalid authorization.", { status: 401 });
          return Response.json({
            subject: props.subject,
            scopes: verified.auth.scope.filter(
              (scope) => props.scopes.includes(scope) && SCOPES.includes(scope),
            ),
          });
        },
      },
      defaultHandler: { fetch: (request) => this.consentOrGrants(request) },
    };
    this.provider = new OAuthProvider(options);
    this.oauthEnv.OAUTH_PROVIDER = getOAuthApi(options, this.oauthEnv);
  }
  private queue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin !== origin(this.env))
      return new Response("Wrong OAuth origin.", { status: 421 });
    const buffered = await boundedBody(
      request,
      url.pathname === "/mcp" ? 262144 : 16384,
    );
    return this.queue(async () => {
      if (url.pathname === "/oauth/register" && request.method === "POST") {
        const key = `register:${await hash(request.headers.get("CF-Connecting-IP") ?? "local")}:${Math.floor(Date.now() / 600000)}`;
        const count = Number((await this.oauthEnv.OAUTH_KV.get(key)) ?? "0");
        if (count >= 15)
          return new Response("Too many registrations.", { status: 429 });
        await this.oauthEnv.OAUTH_KV.put(key, String(count + 1), {
          expirationTtl: 600,
        });
      }
      const ctx = {
        waitUntil: (promise: Promise<unknown>) => this.ctx.waitUntil(promise),
        passThroughOnException: () => {},
        props: {},
      } as unknown as ExecutionContext;
      return this.provider.fetch(buffered, this.oauthEnv, ctx);
    });
  }
  alarm() {
    return this.queue(() => this.storageAdapter.purgeExpired());
  }
  private async consentOrGrants(request: Request): Promise<Response> {
    const user = await currentUser(this.env, request),
      url = new URL(request.url),
      issuer = origin(this.env);
    if (!user)
      return page(
        `<h1>Connect your kitchen.</h1><p>Sign in with your LunchJu passkey, then return here to approve this agent.</p><a class="button" href="/?next=${encodeURIComponent(url.pathname + url.search)}">Sign in with a passkey</a>`,
        undefined,
        401,
      );
    const oauth = this.oauthEnv.OAUTH_PROVIDER!;
    if (url.pathname === "/oauth/grants")
      return this.grants(request, user.id, oauth);
    if (url.pathname !== "/oauth/authorize")
      return new Response("Not found.", { status: 404 });
    if (request.method === "GET") {
      try {
        if (
          [...url.searchParams.keys()].some(
            (key) => url.searchParams.getAll(key).length !== 1,
          ) ||
          url.searchParams.get("code_challenge_method") !== "S256" ||
          !/^[A-Za-z0-9_-]{43}$/.test(
            url.searchParams.get("code_challenge") ?? "",
          ) ||
          url.searchParams.get("resource") !== `${issuer}/mcp`
        )
          throw new HttpError(
            400,
            "A valid S256 PKCE request for this kitchen is required.",
          );
        const parsed = await oauth.parseAuthRequest(request);
        if (parsed.scope.some((scope) => !SCOPES.includes(scope)))
          throw new HttpError(400, "Unsupported permission.");
        const authRequest = {
          ...parsed,
          scope: [...new Set(["mcp:read", ...parsed.scope])],
        };
        const details = await oauth.describeConsent(authRequest),
          consent = await oauth.beginConsent(authRequest);
        await this.oauthEnv.OAUTH_KV.put(
          `consent:${await hash(consent.handle)}`,
          JSON.stringify({ subject: user.id }),
          { expirationTtl: 600 },
        );
        return page(
          `<h1>Give ${escape(details.clientName)} a seat at the table.</h1><p>Signed in as ${escape(user.name)}. This agent can access the single shared home, including its food history and dietary preferences.</p><p><small>Returns to ${escape(details.redirectHost)}. The client name is supplied by the application.</small></p><form method="post"><input type="hidden" name="handle" value="${escape(consent.handle)}"><label><input type="checkbox" name="scope" value="mcp:read" checked> Read recipes, pantry, meals and groceries</label><label><input type="checkbox" name="scope" value="mcp:write" checked> Add and edit recipes, plan meals and sync Bring</label><label><input type="checkbox" name="scope" value="mcp:admin"> Delete items and manage settings allowed by my role</label><label><input type="checkbox" name="persistent" value="yes"> Keep connected until I revoke access</label><small>Access tokens last 15 minutes. Continuing access requires the last checkbox.</small><p><button name="decision" value="approve">Connect agent</button><button name="decision" value="deny">Cancel</button></p></form>`,
          consent.headers,
        );
      } catch (error) {
        if (error instanceof AuthorizationError && error.redirectTo)
          return Response.redirect(error.redirectTo, 302);
        return page(
          "<h1>Connection could not start.</h1><p>Start again from your agent and check its callback URL and requested permissions.</p>",
          undefined,
          400,
        );
      }
    }
    if (request.method !== "POST")
      return new Response("Use GET or POST.", { status: 405 });
    if (request.headers.get("Origin") !== issuer)
      return new Response("Wrong origin.", { status: 403 });
    try {
      const form = await request.formData(),
        handle = String(form.get("handle") ?? "");
      if (
        form.getAll("handle").length !== 1 ||
        form.getAll("decision").length !== 1 ||
        form.getAll("persistent").length > 1
      )
        throw new HttpError(400, "Invalid consent.");
      const key = `consent:${await hash(handle)}`,
        policy = await this.oauthEnv.OAUTH_KV.get<{ subject: string }>(
          key,
          "json",
        );
      if (policy?.subject !== user.id)
        throw new HttpError(400, "Consent expired.");
      if (form.get("decision") === "deny") {
        const denied = await oauth.denyConsent(request, handle);
        await this.oauthEnv.OAUTH_KV.delete(key);
        return continueTo(denied.redirectTo, denied.headers);
      }
      if (form.get("decision") !== "approve")
        throw new HttpError(400, "Invalid consent.");
      const scopes = [...new Set(form.getAll("scope").map(String))],
        persistent = form.get("persistent") === "yes";
      if (
        !scopes.includes("mcp:read") ||
        scopes.some(
          (scope) => !["mcp:read", "mcp:write", "mcp:admin"].includes(scope),
        )
      )
        throw new HttpError(400, "Read access is required.");
      if (persistent) scopes.push("offline_access");
      const approved = await oauth.approveConsent(request, handle, {
        scope: scopes,
      });
      await this.oauthEnv.OAUTH_KV.delete(key);
      const details = await oauth.describeConsent(approved.request);
      const result = await oauth.completeAuthorization({
        request: approved.request,
        userId: user.id,
        scope: scopes,
        metadata: { clientName: details.clientName },
        props: { subject: user.id, scopes, persistent } satisfies Props,
      });
      return continueTo(result.redirectTo, approved.headers);
    } catch {
      return page(
        "<h1>This connection request expired.</h1><p>Start the connection again from your agent.</p>",
        undefined,
        400,
      );
    }
  }
  private async grants(request: Request, subject: string, oauth: OAuthHelpers) {
    if (request.method === "GET") {
      const grants = [];
      let cursor: string | undefined;
      do {
        const result = await oauth.listUserGrants(subject, {
          limit: 100,
          cursor,
        });
        grants.push(...result.items);
        cursor = result.cursor;
      } while (cursor);
      const token = randomToken(),
        hashed = await hash(token);
      await this.oauthEnv.OAUTH_KV.put(
        `grants:${hashed}`,
        JSON.stringify({ subject, ids: grants.map((grant) => grant.id) }),
        { expirationTtl: 600 },
      );
      return page(
        `<h1>Your connected agents.</h1><a href="/">Back to your kitchen</a>${grants.map((grant) => `<section><h2>${escape(String(grant.metadata?.clientName ?? grant.clientId))}</h2><p>${escape(grant.scope.join(" · "))}</p><form method="post"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="id" value="${escape(grant.id)}"><button>Revoke access</button></form></section>`).join("") || "<p>No agents connected yet.</p>"}`,
        new Headers({
          "Set-Cookie": setCookie(this.env, "lunchju_grants", hashed, 600),
        }),
      );
    }
    if (
      request.method !== "POST" ||
      request.headers.get("Origin") !== origin(this.env)
    )
      return new Response("Forbidden.", { status: 403 });
    const form = await request.formData(),
      hashed = await hash(String(form.get("csrf") ?? ""));
    const policy = await this.oauthEnv.OAUTH_KV.get<{
      subject: string;
      ids: string[];
    }>(`grants:${hashed}`, "json");
    if (
      cookie(request, "lunchju_grants") !== hashed ||
      policy?.subject !== subject ||
      !policy.ids.includes(String(form.get("id")))
    )
      return new Response("Invalid revocation request.", { status: 403 });
    await this.oauthEnv.OAUTH_KV.delete(`grants:${hashed}`);
    await oauth.revokeGrant(String(form.get("id")), subject);
    return new Response(null, {
      status: 303,
      headers: { Location: "/oauth/grants", "Cache-Control": "no-store" },
    });
  }
}
