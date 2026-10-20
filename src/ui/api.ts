export class ApiError extends Error {}
export function passkeyError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.name === "InvalidStateError")
    return "Dieser Passkey ist bereits registriert. Wähle einen anderen Passkey.";
  return "Die Passkey-Anmeldung wurde abgebrochen oder ist fehlgeschlagen. Bitte versuche es erneut.";
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
      data.error ?? `Anfrage fehlgeschlagen (${response.status}).`,
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
) {
  return new Intl.DateTimeFormat("de-DE", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
