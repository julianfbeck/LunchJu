import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { languageFromCookie } from "../i18n";

export const getLanguage = createServerFn({ method: "GET" }).handler(() =>
  languageFromCookie(getRequestHeader("cookie")),
);
