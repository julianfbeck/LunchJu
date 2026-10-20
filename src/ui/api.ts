import {
  browserLanguage,
  translate,
  languageLocale,
  type Language,
} from "../i18n";
export class ApiError extends Error {
  constructor(message: string) {
    super(translate(browserLanguage(), message));
  }
}
export function passkeyError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.name === "InvalidStateError")
    return translate(
      browserLanguage(),
      "Dieser Passkey ist bereits registriert. Wähle einen anderen Passkey.",
    );
  return translate(
    browserLanguage(),
    "Die Passkey-Anmeldung wurde abgebrochen oder ist fehlgeschlagen. Bitte versuche es erneut.",
  );
}
export async function request<T>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(
      "LunchJu ist gerade nicht erreichbar. Bitte prüfe deine Verbindung.",
    );
  }
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new ApiError(
      data.error ??
        translate(
          browserLanguage(),
          "Anfrage fehlgeschlagen ({0}).",
          response.status,
        ),
    );
  return data;
}
export const action = <T = unknown>(operation: string, input: unknown = {}) =>
  request<T>("/api/action", { operation, input });
export function today(timeZone = "Europe/Berlin") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function formatDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
  language: Language = "de",
) {
  return new Intl.DateTimeFormat(languageLocale(language), {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
