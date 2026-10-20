import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import style from "../styles.css?url";
import { LanguageProvider, useI18n } from "../ui/language";
import { getLanguage } from "../ui/language-server";
import { translate } from "../i18n";
import { PwaProvider } from "../ui/pwa";
export const Route = createRootRoute({
  loader: () => getLanguage(),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width,initial-scale=1,viewport-fit=cover",
      },
      { title: translate(loaderData ?? "de", "LunchJu · Küchenbuch") },
      {
        name: "description",
        content: translate(
          loaderData ?? "de",
          "Rezepte, Vorräte, Wochenplan und Einkaufsliste für deinen Haushalt in Stuttgart und deinen Agenten.",
        ),
      },
      { name: "theme-color", content: "#ffffff" },
      { name: "application-name", content: "LunchJu" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "LunchJu" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    ],
    links: [
      { rel: "stylesheet", href: style },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
        sizes: "180x180",
      },
    ],
  }),
  component: Root,
  notFoundComponent: NotFound,
});
function Root() {
  const language = Route.useLoaderData();
  return (
    <LanguageProvider initialLanguage={language ?? "de"}>
      <PwaProvider>
        <Document />
      </PwaProvider>
    </LanguageProvider>
  );
}
function Document() {
  const { language } = useI18n();
  return (
    <html lang={language}>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
function NotFound() {
  const { t } = useI18n();
  return (
    <main className="auth-page">
      <h1>{t("Seite nicht gefunden")}</h1>
      <a href="/">{t("Zurück zu LunchJu")}</a>
    </main>
  );
}
