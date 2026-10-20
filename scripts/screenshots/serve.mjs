import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { demoCatalog } from "./fixtures.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const catalog = demoCatalog();
const json = (res, value, status = 200) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
const server = await createServer({
  root,
  configFile: false,
  publicDir: false,
  plugins: [
    react(),
    {
      name: "lunchju-documentation-preview",
      configureServer(vite) {
        vite.middlewares.use(handlePreview);
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 4310,
    strictPort: true,
    open: false,
    fs: { deny: ["**/.env*", "**/.dev.vars*", "**/.git/**", "**/*.{crt,pem}"] },
  },
});
async function handlePreview(req, res, next) {
  const url = new URL(req.url, "http://127.0.0.1:4310");
  if (url.pathname === "/overview") {
    res.setHeader("Content-Type", "text/html");
    res.end(await readFile(new URL("./overview.html", import.meta.url)));
    return;
  }
  if (url.pathname === "/api/auth/session")
    return json(res, {
      user: catalog.user,
      setup: false,
      homeName: "Stuttgart",
    });
  if (url.pathname === "/api/action") {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 8192)
        return json(res, { error: "Preview request too large" }, 413);
    }
    try {
      const { operation, input = {} } = JSON.parse(raw);
      if (operation === "get_catalog") return json(res, catalog);
      if (operation === "list_members")
        return json(res, { members: [{ ...catalog.user, active: 1 }] });
      if (operation === "list_passkeys")
        return json(res, {
          passkeys: [
            {
              id: "demo-passkey",
              name: "Mein iPhone",
              created_at: catalog.recipes[0].createdAt,
            },
          ],
        });
      if (operation === "check_ingredients") {
        const { missingIngredients } =
          await server.ssrLoadModule("/src/shared.ts");
        const { scaleIngredients } =
          await server.ssrLoadModule("/src/scaling.ts");
        const recipe = catalog.recipes.find(
          (value) => value.id === input.recipeId,
        );
        if (!recipe) return json(res, { error: "Demo recipe not found" }, 404);
        const missing = missingIngredients(
          scaleIngredients(recipe, input.servings),
          catalog.pantry,
        );
        return json(res, { canCook: missing.length === 0, missing });
      }
      return json(
        res,
        { error: "This documentation preview is read-only." },
        405,
      );
    } catch {
      return json(res, { error: "Invalid preview request" }, 400);
    }
  }
  if (url.pathname === "/") {
    const html =
      '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LunchJu · Documentation preview</title></head><body><div id="root"></div><script type="module" src="/scripts/screenshots/app.tsx"></script></body></html>';
    res.setHeader("Content-Type", "text/html");
    res.end(await server.transformIndexHtml(url.pathname, html));
    return;
  }
  // Documentation images are served only from their known directory.
  if (url.pathname.startsWith("/docs/screenshots/")) {
    const folder = resolve(root, "docs/screenshots");
    const file = resolve(
      folder,
      url.pathname.slice("/docs/screenshots/".length),
    );
    if (!file.startsWith(folder + sep))
      return json(res, { error: "Not found" }, 404);
    try {
      const body = await readFile(file);
      res.setHeader(
        "Content-Type",
        extname(file) === ".jpg" ? "image/jpeg" : "text/plain",
      );
      res.end(body);
    } catch {
      json(res, { error: "Not found" }, 404);
    }
    return;
  }
  next();
}
await server.listen();
console.log("LunchJu screenshot preview: http://127.0.0.1:4310");
console.log(
  "Uses the real UI with fictional, read-only data. No Cloudflare or Bring connection.",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
