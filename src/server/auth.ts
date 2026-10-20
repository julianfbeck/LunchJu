import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";
import type { User } from "../shared";
import { languageFromCookie } from "../i18n";
import {
  b64,
  unb64,
  cookie,
  setCookie,
  hash,
  randomToken,
  rateLimit,
  readJson,
  requireSameOrigin,
  secretMatches,
} from "./security";
import { HttpError, origin, type Env } from "./types";

const SESSION_DAYS = 30;
const signup = z.object({
  name: z.string().trim().min(1).max(80),
  token: z.string().max(256).optional(),
  label: z.string().trim().min(1).max(80).default("Mein Passkey"),
});
export async function currentUser(
  env: Env,
  request: Request,
): Promise<User | null> {
  const token = cookie(request, "lunchju_session");
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id,u.name,u.role,u.language FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`,
  )
    .bind(await hash(token), Date.now())
    .first<User>();
}
export async function requireUser(env: Env, request: Request) {
  const user = await currentUser(env, request);
  if (!user) throw new HttpError(401, "Melde dich mit deinem Passkey an.");
  return user;
}
export function requireOwner(user: User) {
  if (user.role !== "owner")
    throw new HttpError(
      403,
      "Nur der Haushaltsinhaber kann Mitglieder und Verbindungen verwalten.",
    );
}
async function session(env: Env, user: User) {
  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)",
  )
    .bind(await hash(token), user.id, Date.now() + SESSION_DAYS * 86400000)
    .run();
  const headers = new Headers({
    "Set-Cookie": setCookie(
      env,
      "lunchju_session",
      token,
      SESSION_DAYS * 86400,
    ),
  });
  headers.append("Set-Cookie", setCookie(env, "lunchju_challenge", "", 0));
  return Response.json({ user }, { headers });
}
type Pending = {
  user: User;
  label: string;
  invitation?: string;
  bootstrap?: boolean;
  additional?: boolean;
};
async function challenge(env: Env, kind: string, value: string, data: unknown) {
  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO challenges(id,challenge,kind,data,expires_at) VALUES (?,?,?,?,?)",
  )
    .bind(
      await hash(token),
      value,
      kind,
      JSON.stringify(data),
      Date.now() + 300000,
    )
    .run();
  return token;
}
async function takeChallenge(env: Env, request: Request, kind: string) {
  const row = await env.DB.prepare(
    "DELETE FROM challenges WHERE id=? AND kind=? AND expires_at>? RETURNING challenge,data",
  )
    .bind(await hash(cookie(request, "lunchju_challenge")), kind, Date.now())
    .first<{ challenge: string; data: string }>();
  if (!row)
    throw new HttpError(
      400,
      "Diese Passkey-Anfrage ist abgelaufen oder wurde bereits verwendet. Bitte beginne erneut.",
    );
  return row;
}
export async function authRoute(
  env: Env,
  request: Request,
  path: string,
): Promise<Response> {
  if (path === "/api/auth/session" && request.method === "GET") {
    const user = await currentUser(env, request);
    const owner = await env.DB.prepare(
      "SELECT id FROM users WHERE role='owner' LIMIT 1",
    ).first();
    return Response.json({
      user,
      setup: !owner,
      homeName: env.HOME_NAME ?? "Stuttgart",
    });
  }
  if (request.method !== "POST") throw new HttpError(405, "Verwende POST.");
  requireSameOrigin(request, env);
  await rateLimit(
    env,
    `auth:${await hash(request.headers.get("CF-Connecting-IP") ?? "local")}`,
    30,
  );
  if (path === "/api/auth/logout") {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(cookie(request, "lunchju_session")))
      .run();
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": setCookie(env, "lunchju_session", "", 0) } },
    );
  }
  const body = (await readJson(request)) as Record<string, unknown>;
  const rpID = new URL(origin(env)).hostname;
  if (path === "/api/auth/register/options") {
    const data = signup.parse(body),
      existing = await currentUser(env, request);
    const pending: Pending = {
      user: existing ?? {
        id: crypto.randomUUID(),
        name: data.name,
        role: "member",
        language: languageFromCookie(request.headers.get("Cookie")),
      },
      label: data.label,
    };
    if (existing) pending.additional = true;
    else {
      const owner = await env.DB.prepare(
        "SELECT id FROM users WHERE role='owner'",
      ).first();
      if (!owner) {
        if (!(await secretMatches(data.token ?? "", env.BOOTSTRAP_TOKEN)))
          throw new HttpError(403, "Gib den einmaligen Einrichtungscode ein.");
        pending.user.role = "owner";
        pending.bootstrap = true;
      } else {
        const invitation = await hash(data.token ?? "");
        const valid = await env.DB.prepare(
          "SELECT token_hash FROM invitations WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
        )
          .bind(invitation, Date.now())
          .first();
        if (!valid)
          throw new HttpError(
            403,
            "Bitte den Haushaltsinhaber um eine neue Einladung.",
          );
        pending.invitation = invitation;
      }
    }
    const keys = existing
      ? await env.DB.prepare("SELECT id FROM passkeys WHERE user_id=?")
          .bind(existing.id)
          .all<{ id: string }>()
      : { results: [] };
    const options = await generateRegistrationOptions({
      rpName: "LunchJu",
      rpID,
      userName: pending.user.name,
      userDisplayName: pending.user.name,
      userID: new TextEncoder().encode(pending.user.id),
      attestationType: "none",
      excludeCredentials: keys.results.map((key) => ({ id: key.id })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
    const token = await challenge(env, "register", options.challenge, pending);
    return Response.json(options, {
      headers: {
        "Set-Cookie": setCookie(env, "lunchju_challenge", token, 300),
      },
    });
  }
  if (path === "/api/auth/register/verify") {
    const pending = await takeChallenge(env, request, "register");
    const data: Pending = JSON.parse(pending.data);
    if (
      data.additional &&
      (await currentUser(env, request))?.id !== data.user.id
    )
      throw new HttpError(
        401,
        "Melde dich erneut an, bevor du einen Passkey hinzufügst.",
      );
    const verified = await verifyRegistrationResponse({
      response: body as unknown as RegistrationResponseJSON,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin(env),
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verified.verified || !verified.registrationInfo)
      throw new HttpError(400, "Der Passkey konnte nicht überprüft werden.");
    const key = verified.registrationInfo.credential;
    const writes: D1PreparedStatement[] = [];
    if (data.bootstrap)
      writes.push(
        env.DB.prepare(
          "INSERT INTO users(id,name,role,language) SELECT ?,?,'owner',? WHERE NOT EXISTS(SELECT 1 FROM users WHERE role='owner')",
        ).bind(data.user.id, data.user.name, data.user.language ?? "de"),
      );
    else if (data.invitation) {
      writes.push(
        env.DB.prepare(
          "INSERT INTO users(id,name,role,language) SELECT ?,?,'member',? WHERE EXISTS(SELECT 1 FROM invitations WHERE token_hash=? AND used_at IS NULL AND expires_at>?)",
        ).bind(
          data.user.id,
          data.user.name,
          data.user.language ?? "de",
          data.invitation,
          Date.now(),
        ),
      );
      writes.push(
        env.DB.prepare(
          "UPDATE invitations SET used_at=? WHERE token_hash=? AND used_at IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=?)",
        ).bind(Date.now(), data.invitation, data.user.id),
      );
    }
    writes.push(
      env.DB.prepare(
        "INSERT INTO passkeys(id,user_id,public_key,counter,transports,name) SELECT ?,id,?,?,?,? FROM users WHERE id=? AND active=1",
      ).bind(
        key.id,
        b64(key.publicKey),
        key.counter,
        JSON.stringify(key.transports ?? []),
        data.label,
        data.user.id,
      ),
    );
    const result = await env.DB.batch(writes);
    if (!result.at(-1)?.meta.changes)
      throw new HttpError(
        409,
        "Diese Einladung oder dieser Einrichtungscode wurde bereits verwendet.",
      );
    return session(env, data.user);
  }
  if (path === "/api/auth/login/options") {
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
    });
    const token = await challenge(env, "login", options.challenge, {});
    return Response.json(options, {
      headers: {
        "Set-Cookie": setCookie(env, "lunchju_challenge", token, 300),
      },
    });
  }
  if (path === "/api/auth/login/verify") {
    const pending = await takeChallenge(env, request, "login");
    const response = body as unknown as AuthenticationResponseJSON;
    const key = await env.DB.prepare(
      "SELECT p.*,u.name AS user_name,u.role,u.language FROM passkeys p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.active=1",
    )
      .bind(response.id)
      .first<{
        id: string;
        user_id: string;
        public_key: string;
        counter: number;
        user_name: string;
        role: User["role"];
        language: User["language"];
      }>();
    if (!key)
      throw new HttpError(
        401,
        "Dieser Passkey gehört nicht zu diesem Haushalt.",
      );
    const verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin(env),
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: key.id,
        publicKey: unb64(key.public_key),
        counter: key.counter,
      },
    });
    if (!verified.verified)
      throw new HttpError(401, "Der Passkey konnte nicht überprüft werden.");
    const update = await env.DB.prepare(
      "UPDATE passkeys SET counter=? WHERE id=? AND counter=?",
    )
      .bind(verified.authenticationInfo.newCounter, key.id, key.counter)
      .run();
    if (!update.meta.changes)
      throw new HttpError(
        409,
        "Der Passkey wurde geändert. Bitte melde dich erneut an.",
      );
    return session(env, {
      id: key.user_id,
      name: key.user_name,
      role: key.role,
      language: key.language,
    });
  }
  throw new HttpError(404, "Anmeldepfad nicht gefunden.");
}
