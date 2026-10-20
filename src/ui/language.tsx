import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import {
  languageCookie,
  languageLocale,
  translate,
  type Language,
} from "../i18n";

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
} | null>(null);

export function LanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language;
  children: ReactNode;
}) {
  const [language, updateLanguage] = useState(initialLanguage);
  function setLanguage(value: Language) {
    document.cookie = languageCookie(value, location.protocol === "https:");
    updateLanguage(value);
  }
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
    <LanguageContext.Provider value={{ language, setLanguage }}>
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
  const { language, setLanguage } = useI18n();
  const id = useId();
  return (
    <label className="language-selector" htmlFor={id}>
      <span>Sprache / Language</span>
      <select
        id={id}
        value={language}
        onChange={(event) =>
          setLanguage(event.target.value === "en" ? "en" : "de")
        }
      >
        <option value="de" lang="de">
          Deutsch
        </option>
        <option value="en" lang="en">
          English
        </option>
      </select>
    </label>
  );
}
