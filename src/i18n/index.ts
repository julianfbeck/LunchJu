import english from "./en.json";

export type Language = "de" | "en";
export const LANGUAGE_COOKIE = "lunchju_language";
export const languageLocale = (language: Language) =>
  language === "en" ? "en-GB" : "de-DE";

export function languageFromCookie(
  cookie: string | null | undefined,
): Language {
  const value = cookie
    ?.split(";")
    .find((part) => part.trim().startsWith(`${LANGUAGE_COOKIE}=`))
    ?.trim()
    .slice(LANGUAGE_COOKIE.length + 1);
  return value === "en" ? "en" : "de";
}

export function browserLanguage(): Language {
  return typeof document === "undefined"
    ? "de"
    : languageFromCookie(document.cookie);
}

export function languageCookie(language: Language, secure: boolean) {
  return `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}

// Only translate application copy. Values passed into placeholders (recipes,
// member names, notes, etc.) are never interpreted or translated.
export function translate(
  language: Language,
  message: string,
  ...values: (string | number)[]
) {
  const key = message.trim();
  if (!key) return message;
  const translated =
    language === "en" && Object.hasOwn(english, key)
      ? (english as Record<string, string>)[key]
      : key;
  const text =
    message.slice(0, message.length - message.trimStart().length) +
    translated +
    message.slice(message.trimEnd().length);
  return text.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    values[Number(index)] === undefined
      ? placeholder
      : String(values[Number(index)]),
  );
}
