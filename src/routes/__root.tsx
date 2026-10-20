import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import style from "../styles.css?url";
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width,initial-scale=1,viewport-fit=cover",
      },
      { title: "LunchJu · Küchenbuch" },
      {
        name: "description",
        content:
          "Rezepte, Vorräte, Wochenplan und Einkaufsliste für deinen Haushalt in Stuttgart und deinen Agenten.",
      },
      { name: "theme-color", content: "#ffffff" },
    ],
    links: [
      { rel: "stylesheet", href: style },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
    ],
  }),
  component: () => (
    <html lang="de">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
  notFoundComponent: () => (
    <main className="auth-page">
      <h1>Seite nicht gefunden</h1>
      <a href="/">Zurück zu LunchJu</a>
    </main>
  ),
});
