import { describe, it, expect } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { fixture } from "./support/db";
import { authRoute, currentUser } from "../src/server/auth";
import { b64, hash, rateLimit } from "../src/server/security";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { runOperation } from "../src/server/operations";
const req = (path: string, body: unknown, cookies = "") =>
  new Request(`https://kitchen.example${path}`, {
    method: "POST",
    headers: {
      Origin: "https://kitchen.example",
      "Content-Type": "application/json",
      Cookie: cookies,
    },
    body: JSON.stringify(body),
  });
describe("Passkey-only authentication", () => {
  it("registers an invited member with a real WebAuthn attestation, consumes the invitation once, and blocks a competing registration", async () => {
    const f = fixture();
    const invitation = (await runOperation(
      "create_invitation",
      {},
      f.env,
      f.access,
    )) as { url: string };
    const token = new URLSearchParams(
      new URL(invitation.url).hash.slice(1),
    ).get("invite")!;
    const pending = await Promise.all(
      ["Sam", "Another Sam"].map(async (name) => {
        const options = await authRoute(
          f.env,
          req(
            "/api/auth/register/options",
            { name, token },
            "lunchju_language=en",
          ),
          "/api/auth/register/options",
        );
        return {
          cookie: options.headers.get("Set-Cookie")!.split(";")[0],
          options: (await options.json()) as { challenge: string },
        };
      }),
    );
    function attestation(challenge: string) {
      const { publicKey } = generateKeyPairSync("ec", {
          namedCurve: "prime256v1",
        }),
        jwk = publicKey.export({ format: "jwk" });
      const cose = Buffer.concat([
        Buffer.from([0xa5, 1, 2, 3, 0x26, 0x20, 1, 0x21, 0x58, 0x20]),
        Buffer.from(jwk.x!, "base64url"),
        Buffer.from([0x22, 0x58, 0x20]),
        Buffer.from(jwk.y!, "base64url"),
      ]);
      const id = crypto.getRandomValues(new Uint8Array(32));
      const authData = Buffer.concat([
        createHash("sha256").update("kitchen.example").digest(),
        Buffer.from([0x45, 0, 0, 0, 0]),
        Buffer.alloc(16),
        Buffer.from([0, 32]),
        id,
        cose,
      ]);
      return {
        id: b64(id),
        rawId: b64(id),
        type: "public-key",
        response: {
          clientDataJSON: b64(
            Buffer.from(
              JSON.stringify({
                type: "webauthn.create",
                challenge,
                origin: f.env.APP_ORIGIN,
              }),
            ),
          ),
          attestationObject: b64(
            isoCBOR.encode(
              new Map<string, string | Map<string, never> | Uint8Array>([
                ["fmt", "none"],
                ["attStmt", new Map<string, never>()],
                ["authData", authData],
              ]),
            ),
          ),
          transports: ["internal"],
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    }
    const first = await authRoute(
      f.env,
      req(
        "/api/auth/register/verify",
        attestation(pending[0].options.challenge),
        pending[0].cookie,
      ),
      "/api/auth/register/verify",
    );
    expect(first.status).toBe(200);
    await expect(
      authRoute(
        f.env,
        req(
          "/api/auth/register/verify",
          attestation(pending[1].options.challenge),
          pending[1].cookie,
        ),
        "/api/auth/register/verify",
      ),
    ).rejects.toThrow("bereits verwendet");
    expect(
      f.sqlite.prepare("SELECT name FROM users WHERE role='member'").all(),
    ).toEqual([{ name: "Sam" }]);
    expect(
      f.sqlite.prepare("SELECT language FROM users WHERE role='member'").get(),
    ).toEqual({ language: "en" });
    expect(f.sqlite.prepare("SELECT * FROM passkeys").all()).toHaveLength(1);
  });
  it("verifies a real signed WebAuthn assertion, creates a revocable session, and rejects challenge replay", async () => {
    const f = fixture(),
      { privateKey, publicKey } = generateKeyPairSync("ec", {
        namedCurve: "prime256v1",
      }),
      jwk = publicKey.export({ format: "jwk" });
    const cose = Buffer.concat([
      Buffer.from([0xa5, 1, 2, 3, 0x26, 0x20, 1, 0x21, 0x58, 0x20]),
      Buffer.from(jwk.x!, "base64url"),
      Buffer.from([0x22, 0x58, 0x20]),
      Buffer.from(jwk.y!, "base64url"),
    ]);
    const credential = b64(crypto.getRandomValues(new Uint8Array(32)));
    f.sqlite
      .prepare(
        "INSERT INTO passkeys(id,user_id,public_key,counter) VALUES (?,?,?,0)",
      )
      .run(credential, f.access.user.id, b64(cose));
    const options = await authRoute(
      f.env,
      req("/api/auth/login/options", {}),
      "/api/auth/login/options",
    );
    const data = (await options.json()) as { challenge: string };
    const cookie = options.headers.get("Set-Cookie")!.split(";")[0];
    const clientData = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: data.challenge,
        origin: f.env.APP_ORIGIN,
      }),
    );
    const authData = Buffer.concat([
      createHash("sha256").update("kitchen.example").digest(),
      Buffer.from([0x05, 0, 0, 0, 1]),
    ]);
    const signature = sign(
      "sha256",
      Buffer.concat([
        authData,
        createHash("sha256").update(clientData).digest(),
      ]),
      privateKey,
    );
    const response = {
      id: credential,
      rawId: credential,
      type: "public-key",
      response: {
        clientDataJSON: b64(clientData),
        authenticatorData: b64(authData),
        signature: b64(signature),
        userHandle: b64(Buffer.from(f.access.user.id)),
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };
    const verified = await authRoute(
      f.env,
      req("/api/auth/login/verify", response, cookie),
      "/api/auth/login/verify",
    );
    expect(verified.status).toBe(200);
    expect(await verified.clone().json()).toMatchObject({
      user: { name: "Alex" },
    });
    await expect(
      authRoute(
        f.env,
        req("/api/auth/login/verify", response, cookie),
        "/api/auth/login/verify",
      ),
    ).rejects.toThrow("bereits verwendet");
    const sessionCookie = verified.headers
      .getSetCookie()
      .find((value) => value.startsWith("lunchju_session="))!
      .split(";")[0];
    expect(
      await currentUser(
        f.env,
        new Request(f.env.APP_ORIGIN, { headers: { Cookie: sessionCookie } }),
      ),
    ).toMatchObject({ id: f.access.user.id });
    await authRoute(
      f.env,
      req("/api/auth/logout", {}, sessionCookie),
      "/api/auth/logout",
    );
    expect(
      await currentUser(
        f.env,
        new Request(f.env.APP_ORIGIN, { headers: { Cookie: sessionCookie } }),
      ),
    ).toBeNull();
  });
  it("requires same-origin requests and an invitation once an owner exists", async () => {
    const f = fixture();
    await expect(
      authRoute(
        f.env,
        new Request("https://kitchen.example/api/auth/login/options", {
          method: "POST",
        }),
        "/api/auth/login/options",
      ),
    ).rejects.toThrow("deiner LunchJu");
    await expect(
      authRoute(
        f.env,
        req("/api/auth/register/options", {
          name: "Guest",
          token: f.env.BOOTSTRAP_TOKEN,
        }),
        "/api/auth/register/options",
      ),
    ).rejects.toThrow("Einladung");
  });
  it("requires a strong bootstrap token for the first account and gives no password login", async () => {
    const f = fixture();
    f.sqlite.prepare("DELETE FROM users").run();
    await expect(
      authRoute(
        f.env,
        req("/api/auth/register/options", { name: "Owner", token: "wrong" }),
        "/api/auth/register/options",
      ),
    ).rejects.toThrow("Einrichtungscode");
    const options = await authRoute(
      f.env,
      req("/api/auth/register/options", {
        name: "Owner",
        token: f.env.BOOTSTRAP_TOKEN,
      }),
      "/api/auth/register/options",
    );
    expect(options.status).toBe(200);
    await expect(
      authRoute(
        f.env,
        req("/api/auth/password", { password: "anything" }),
        "/api/auth/password",
      ),
    ).rejects.toThrow("nicht gefunden");
  });
  it("blocks disabled accounts even if a session has not expired", async () => {
    const f = fixture();
    const token = "test-session";
    f.sqlite
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(await hash(token), f.access.user.id, Date.now() + 60000);
    f.sqlite.prepare("UPDATE users SET active=0").run();
    expect(
      await currentUser(
        f.env,
        new Request(f.env.APP_ORIGIN, {
          headers: { Cookie: `lunchju_session=${token}` },
        }),
      ),
    ).toBeNull();
  });
  it("uses an atomic rate limit counter", async () => {
    const f = fixture();
    await rateLimit(f.env, "test", 2);
    await rateLimit(f.env, "test", 2);
    await expect(rateLimit(f.env, "test", 2)).rejects.toThrow("Zu viele");
  });
});
