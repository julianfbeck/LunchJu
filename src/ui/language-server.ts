import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { languageFromCookie } from "../i18n";
import { currentUser } from "../server/auth";
import type { Env } from "../server/types";

export const getLanguage = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest();
    const user = await currentUser(env as Env, request);
    return user?.language ?? languageFromCookie(request.headers.get("Cookie"));
  },
);
