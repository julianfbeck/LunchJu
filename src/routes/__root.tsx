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
      { title: "LunchJu · A little kitchen harmony" },
      {
        name: "description",
        content:
          "Your recipes, pantry, meal plans and groceries. One shared kitchen for your household and your agent.",
      },
      { name: "theme-color", content: "#f6f6ee" },
    ],
    links: [
      { rel: "stylesheet", href: style },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
    ],
  }),
  component: () => (
    <html lang="en">
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
      <h1>This page wandered out of the kitchen.</h1>
      <a href="/">Back to LunchJu</a>
    </main>
  ),
});
