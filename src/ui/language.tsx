import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  useRef,
  type ReactNode,
} from "react";
import {
  languageCookie,
  browserLanguage,
  languageLocale,
  translate,
  type Language,
} from "../i18n";
import type { User } from "../shared";
import { action } from "./api";

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => Promise<void>;
  bindAccount: (user: User | null) => void;
  saving: boolean;
  error: string;
} | null>(null);

export function LanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language;
  children: ReactNode;
}) {
  const [language, updateLanguage] = useState(initialLanguage);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const account = useRef<User | null | undefined>(undefined);
  const sequence = useRef(0),
    savingRef = useRef(false);
  const applyLanguage = useCallback((value: Language) => {
    document.cookie = languageCookie(value, location.protocol === "https:");
    updateLanguage(value);
  }, []);
  const setLanguage = useCallback(
    async (value: Language) => {
      const user = account.current;
      const version = ++sequence.current;
      setError("");
      if (!user) {
        applyLanguage(value);
        return;
      }
      savingRef.current = true;
      setSaving(true);
      try {
        await action("set_language", { language: value });
        if (sequence.current === version && account.current?.id === user.id) {
          account.current = { ...user, language: value };
          applyLanguage(value);
        }
      } catch (error) {
        if (sequence.current === version)
          setError(
            error instanceof Error
              ? error.message
              : "Speichern fehlgeschlagen.",
          );
      } finally {
        if (sequence.current === version) {
          savingRef.current = false;
          setSaving(false);
        }
      }
    },
    [applyLanguage],
  );
  const bindAccount = useCallback(
    (user: User | null) => {
      const changed = account.current?.id !== user?.id;
      account.current = user;
      if (changed) {
        ++sequence.current;
        savingRef.current = false;
        setSaving(false);
        setError("");
      }
      if (!user || savingRef.current) return;
      if (user.language) applyLanguage(user.language);
      // Adopt an existing browser choice once for accounts created before this
      // setting existed. Subsequent visits and OAuth clients use the account.
      else if (changed) void setLanguage(browserLanguage());
    },
    [applyLanguage, setLanguage],
  );
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = translate(language, "LunchJu · Küchenbuch");
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute(
      "content",
      translate(
        language,
        "Rezepte, Vorräte, Wochenplan und Einkaufsliste für deinen Haushalt in Stuttgart und deinen Agenten.",
      ),
    );
  }, [language]);
  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, bindAccount, saving, error }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("LanguageProvider is missing");
  return {
    ...context,
    locale: languageLocale(context.language),
    t: (message: string, ...values: (string | number)[]) =>
      translate(context.language, message, ...values),
  };
}

export function LanguageSelector() {
  const { language, setLanguage, saving, error } = useI18n();
  const id = useId();
  return (
    <label className="language-selector" htmlFor={id}>
      <span className="language-label">Sprache / Language</span>
      <select
        id={id}
        value={language}
        disabled={saving}
        onChange={(event) =>
          void setLanguage(event.target.value === "en" ? "en" : "de")
        }
      >
        <option value="de" lang="de">
          Deutsch
        </option>
        <option value="en" lang="en">
          English
        </option>
      </select>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
