import type { User } from "../shared";
export interface Env {
  DB: D1Database;
  OAUTH_STATE: DurableObjectNamespace;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  HOME_NAME?: string;
  TIME_ZONE?: string;
  BOOTSTRAP_TOKEN?: string;
  ENCRYPTION_KEY?: string;
  AGENT_API_KEY?: string;
  BRING_API_KEY?: string;
}
export type Access = { user: User; scopes: string[]; agent: boolean };
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const now = () => new Date().toISOString();
export function origin(env: Env) {
  const url = new URL(env.APP_ORIGIN);
  if (
    url.origin !== env.APP_ORIGIN ||
    (url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new HttpError(503, "Configure a canonical HTTPS APP_ORIGIN.");
  return url.origin;
}
