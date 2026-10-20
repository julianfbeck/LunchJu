import handler from "@tanstack/react-start/server-entry";
import { ZodError, z } from "zod";
import { languageFromCookie, translate } from "./i18n";
import { authRoute, requireUser } from "./server/auth";
import { runOperation } from "./server/operations";
import { handleMcp } from "./server/mcp";
import { isOAuthPath } from "./server/oauth";
import {
  readJson,
  requireSameOrigin,
  boundedBody,
  rateLimit,
} from "./server/security";
import { HttpError, origin, type Env } from "./server/types";
import {
  getRecipeImage,
  uploadRecipeImage,
  MAX_IMAGE_BYTES,
} from "./server/images";
import { audit } from "./server/db";
export { LunchJuOAuth } from "./server/oauth";

export async function cleanup(env: Env) {
  await env.DB.batch(
    ["sessions", "challenges", "invitations", "rate_limits"].map((table) =>
      env.DB.prepare(`DELETE FROM ${table} WHERE expires_at<?`).bind(
        table === "rate_limits" ? Math.floor(Date.now() / 1000) : Date.now(),
      ),
    ),
  );
}
export async function routeRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health")
    return Response.json({ ok: true, service: "lunchju" });
  if (isOAuthPath(url.pathname))
    return env.OAUTH_STATE.get(
      env.OAUTH_STATE.idFromName("lunchju-oauth-v1"),
    ).fetch(request);
  if (url.pathname === "/mcp") {
    if (
      request.headers.get("Origin") &&
      request.headers.get("Origin") !== origin(env)
    )
      throw new HttpError(403, "Dieser Ursprung ist nicht erlaubt.");
    return handleMcp(request, env, ctx);
  }
  if (url.pathname.startsWith("/api/auth/"))
    return authRoute(env, request, url.pathname);
  if (url.pathname.startsWith("/api/")) {
    const user = await requireUser(env, request);
    const access = {
      user,
      scopes: ["mcp:read", "mcp:write", "mcp:admin"],
      agent: false,
    };
    const imageRoute = url.pathname.match(
      /^\/api\/recipes\/([^/]+)\/(?:image|images\/([^/]+))$/,
    );
    if (imageRoute) {
      if (request.method === "GET") {
        const { image } = await getRecipeImage(
          env,
          imageRoute[1],
          imageRoute[2],
        );
        return new Response(image.body, {
          headers: {
            "Content-Type": image.httpMetadata?.contentType ?? "image/jpeg",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
          },
        });
      }
      if (request.method !== "POST")
        throw new HttpError(405, "Verwende GET oder POST.");
      requireSameOrigin(request, env);
      await rateLimit(env, `image:${user.id}`, 20);
      if (
        !request.headers.get("Content-Type")?.startsWith("multipart/form-data")
      )
        throw new HttpError(415, "Sende das Bild als Formulardatei.");
      const bounded = await boundedBody(
        request,
        MAX_IMAGE_BYTES + 16384,
        30000,
      );
      const form = await bounded.formData();
      const file = form.get("image");
      const altText = form.get("altText") ?? "";
      if (
        !(file instanceof File) ||
        typeof altText !== "string" ||
        altText.length > 500
      )
        throw new HttpError(
          400,
          "Bitte wähle ein Bild und eine Beschreibung mit höchstens 500 Zeichen.",
        );
      const recipe = await uploadRecipeImage(
        env,
        imageRoute[1],
        new Uint8Array(await file.arrayBuffer()),
        file.type,
        altText.trim(),
        { append: form.get("append") === "true", imageId: imageRoute[2] },
      );
      await audit(env, access, "upload_recipe_image", imageRoute[1]).catch(() =>
        console.error("Protokollierung fehlgeschlagen."),
      );
      return Response.json(recipe);
    }
    if (request.method !== "POST") throw new HttpError(405, "Verwende POST.");
    requireSameOrigin(request, env);
    await rateLimit(env, `api:${user.id}`, 180);
    const body = (await readJson(request)) as {
      operation?: unknown;
      input?: unknown;
    };
    if (url.pathname !== "/api/action" || typeof body.operation !== "string")
      throw new HttpError(404, "Pfad nicht gefunden.");
    return Response.json(
      await runOperation(body.operation, body.input ?? {}, env, access),
    );
  }
  return null;
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      const response =
        (await routeRequest(request, env, ctx)) ??
        (await handler.fetch(request));
      const headers = new Headers(response.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "same-origin");
      headers.set("X-Frame-Options", "DENY");
      if (new URL(request.url).pathname.startsWith("/api/"))
        headers.set("Cache-Control", "no-store");
      if (headers.get("Content-Type")?.includes("text/html"))
        headers.set("Cache-Control", "private, no-store");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      const language = languageFromCookie(request.headers.get("Cookie"));
      if (error instanceof ZodError)
        return Response.json(
          {
            error: error.issues
              .map(
                (issue) =>
                  `${issue.path.join(".")}: ${language === "en" ? z.locales.en().localeError({ ...issue, input: undefined }) : issue.message}`,
              )
              .join("; "),
          },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      if (error instanceof HttpError)
        return Response.json(
          { error: translate(language, error.message) },
          { status: error.status, headers: { "Cache-Control": "no-store" } },
        );
      console.error(
        "LunchJu request failed:",
        error instanceof Error
          ? origin(env).startsWith("http://localhost:")
            ? error.stack
            : error.name
          : "UnknownError",
      );
      return Response.json(
        {
          error: translate(
            language,
            "Ein Fehler ist aufgetreten. Bitte versuche es erneut.",
          ),
        },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanup(env));
  },
};
