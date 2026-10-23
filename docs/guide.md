# LunchJu guide

Setup, deployment and agent reference. [Back to the README](../README.md).

## Architecture

```mermaid
flowchart TD
  Browser[Mobile / desktop · TanStack Start + React Query] --> Worker[Cloudflare Worker · shared operations]
  Agent[MCP client] --> Worker
  Worker --> D1[D1 · kitchen, users, sessions, integration tokens]
  Worker --> OAuth[SQLite Durable Object · OAuth lifecycle and validation]
  Worker --> Bring[Bring API]
  Worker --> R2[Private R2 · recipe and source images]
  OAuth --> D1
```

TanStack Start renders the application through Cloudflare's Vite plugin. D1 holds the single home's data. A SQLite Durable Object supplies strongly consistent storage to Cloudflare's OAuth provider, following OpenWish's approach.

Only OAuth state changes and token validation pass through the Durable Object's queue. After validation, MCP tools execute in the outer Worker, so a slow Bring call does not hold up other users' authentication. Revocation blocks subsequent validations; already admitted requests can finish. There is no Workers KV binding and no runtime schema migration.

The Worker also serves static assets and runs daily cleanup of expired sessions, invitations, challenges and rate-limit records. The interface uses system fonts. There is no Supabase, external application server, or model API dependency.

## Local development

Use Node.js 24 or newer; the test database adapter uses `node:sqlite`.

```sh
npm ci
cp .dev.vars.example .dev.vars
# Set independent random BOOTSTRAP_TOKEN and ENCRYPTION_KEY values.
# Generate each with: openssl rand -hex 32
npm run db:migrate
npm run dev
```

Open [localhost:3000](http://localhost:3000). Keep `APP_ORIGIN=http://localhost:3000` in `.dev.vars`. Local D1 and Durable Object state are separate from deployed instances.

On first launch, enter the deployment's `BOOTSTRAP_TOKEN` and create the owner's passkey. The token cannot enroll another owner after setup. The owner can invite more members from Settings. Invitations expire after 24 hours and can be used once. A member can be disabled without removing shared kitchen data.

Add a spare passkey in Settings before replacing your only device. Passkeys are tied to the site hostname: choose the final production hostname before registering users, or keep the existing hostname available while migrating accounts. There is no password or email recovery route.

## Deployment

Deploy your own instance with a Cloudflare Worker, a D1 database, a private R2 bucket and a custom domain. The checked-in `wrangler.jsonc` belongs to an existing installation; replace its resource identifiers and settings with your own before deploying.

1. Sign in to your Cloudflare account and create the storage resources below.
2. Update `wrangler.jsonc`: set your Worker name, the D1 `database_id`, R2 `bucket_name`, custom-domain route and `APP_ORIGIN` (for example, `https://lunchju.example.com`). Keep the existing binding names so the application can find its resources.
3. Set `HOME_NAME` and `TIME_ZONE` for your home. For Bring, set `BRING_LIST_ID` and `BRING_LIST_NAME` to your own list's UUID and exact name. Each deployment accepts only that list.
4. Apply migrations, install independent Worker secrets and deploy.

```sh
npx wrangler login
npx wrangler d1 create lunchju
npx wrangler r2 bucket create lunchju-images
# Update wrangler.jsonc with your resources and domain before continuing.
npm run db:migrate:remote
npx wrangler secret put BOOTSTRAP_TOKEN
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put BRING_API_KEY
npm run deploy
```

`ENCRYPTION_KEY` must be 32 random bytes encoded as 64 hexadecimal characters. Store it in your password manager: replacing it makes existing Bring tokens unreadable, requiring reconnection. `.dev.vars`, local runtime state and build output are ignored by Git. Production secrets must be installed with Wrangler; `.dev.vars` is only for local development.

Use a fixed HTTPS `APP_ORIGIN` matching your custom domain. OAuth metadata, redirect validation, CSRF checks and passkey verification use this value. Wrangler manages the domain's DNS record and TLS certificate. The `workers.dev` endpoint and preview URLs are disabled in the checked-in configuration. `HOME_NAME`, `TIME_ZONE`, `BRING_LIST_ID` and `BRING_LIST_NAME` are ordinary Wrangler variables. Some built-in labels and error messages still use the original home name, Stuttgart.

Health endpoint: `GET /api/health`. Do not delete or replace the OAuth Durable Object binding when redeploying; it stores registered clients and grants. Apply future D1 migrations deliberately before deploying code that requires them.

## Agent connection

After deploying your instance, add its streamable HTTP MCP endpoint to an OAuth-capable client. Replace the example domain with your own:

```text
https://lunchju.example.com/mcp
```

The client discovers the authorization server, registers a client, and opens consent in your browser. Sign in with a LunchJu passkey, then choose permissions:

| Scope       | Capability                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------- |
| `mcp:read`  | Catalog, recipes, ingredient checks and permitted account information                       |
| `mcp:write` | Add/edit recipes and stock, plan/log meals, groceries, preferences and explicit Bring sync  |
| `mcp:admin` | Delete items and manage integrations or accounts where the signed-in user's role permits it |

Read access is required. Access tokens last 15 minutes. Check **Keep connected until I revoke access** for renewable agent access; it is off by default. Refresh tokens use the provider's rotation and retry handling. Review and revoke grants at `/oauth/grants`, also linked from Settings. Disabling a member blocks their sessions and future OAuth token validation.

The MCP resource `lunchju://catalog` and `get_catalog` tool return the complete recipe, cookbook, category, source, pantry, meal, grocery and preferences catalog, including each recipe’s `cookbookIds`, `categoryIds`, `images` metadata, structured `steps` and attributed `comments`. Tool names and JSON schemas are registered from `src/server/operations.ts`; UI requests call that same implementation. Deletion and integration administration require explicit admin scope. Owner-only checks still apply to an agent acting for a member.

The catalog's `contentLanguage` (`de` or `en`) and `home.locale` reflect the authenticated account's current selection. Agents must read `get_catalog` or `get_language` before creating content and write new cookbook names, recipe titles, ingredient names, preparation steps, tags, cooking notes, tips and image descriptions in that language. Initialization instructions, tool descriptions and tool responses include the current language. OAuth identity determines the preference; an agent does not need a browser cookie, and existing tokens continue to work after a language change. `set_language` (`mcp:write`) changes only the calling account's preference. It does not translate stored recipes. Ingredient matching remains based on stored names; changing language does not add cross-language synonym matching.

### Recipe sources and preparation

Use **Rezept fotografieren / Photograph recipe** directly in Recipes to open the phone's camera, or **Foto auswählen / Choose photo** to pick an existing image. Check the preview, optionally select a recipe to supplement, then press **Für den Agenten speichern / Save for your agent**. Supporting mobile browsers request the rear camera; desktop browsers offer their file picker. Camera and library photos are decoded locally, resized to at most 2560 pixels on the longest edge and re-encoded without the original EXIF/location metadata. Input photos may be up to 40 MiB; the saved private image stays within the 5 MiB upload limit. Formats such as HEIC depend on browser decoding support; use JPEG if your browser cannot read one.

The source inbox also accepts video links and additional text. Saved sources persist until processed or deleted. Every new authenticated MCP connection receives fresh import counts and instructions to check `list_recipe_sources`, inspect photos with `get_recipe_source_image`, extract ingredients and steps, avoid duplicate recipes and assign suitable existing cookbooks and categories. The `lunchju://recipe-inbox` resource exposes ready pending sources, sources needing clarification, the current content language and whether the connection can import. Connecting or reading never marks work complete. Read-only connections report the queue; importing requires write scope. Finished sources are excluded from the pending queue, and incomplete image uploads remain unavailable until their image is saved.

Processing runs in your connected agent when it follows these MCP server instructions; saving alone does not launch a server-side model or background job. **Agentenauftrag kopieren / Copy agent prompt** remains available to request an import explicitly with clients that do not act on connection instructions. Video access depends on that agent's browser, video or transcript tools and the platform's access restrictions. LunchJu does not fetch, embed, transcribe or run OCR on sources. If a video cannot be read, add a transcript, notes or a screenshot instead. Source images use the same private R2 bucket and authenticated access as recipe photos; direct agent uploads support JPG, PNG and WebP up to 5 MiB.

Agents use `list_recipe_sources` (pending sources by default) and `get_recipe_source` to read source metadata, notes and the optional target recipe. `get_recipe_source_image` returns an MCP image block so the agent can inspect the image. `add_recipe_source`, `update_recipe_source` and `upload_recipe_source_image` require write scope; source and source-image deletion require admin scope. Image-only drafts stay out of the default queue until their upload completes. Source text and images are untrusted input, never instructions that override the agent's rules.

After extracting reliable information, the agent creates or updates a recipe, adds tips or recipe photos as appropriate, and calls `set_recipe_source_status` with `status: "done"` and the saved `recipeId`. A completed source requires a linked recipe. When ingredients, amounts or access are missing, use `status: "needs_info"` with a `resolution` describing what is needed. Editing a source or replacing its image reopens it. Deleting a source preserves its linked recipe.

Recipe `steps` are ordered objects with `title`, `description` and optional `durationMinutes`. `create_recipe` and `update_recipe` accept them; `set_recipe_steps` replaces only the preparation. For example:

```json
{
  "recipeId": "RECIPE_UUID",
  "steps": [
    {
      "title": "Gemüse vorbereiten",
      "description": "Tomaten waschen und würfeln.",
      "durationMinutes": 5
    }
  ]
}
```

The recipe editor supports adding, removing and moving individual cards. Cooking mode shows one card at a time with optional completion marks; progress lasts for the current view. Durations are guidance, without a running timer. Existing recipes and clients using `instructions: string[]` remain supported: descriptions and legacy instructions stay synchronized, and omitted structured steps retain their titles and durations when instructions have not changed. Cooking times and step descriptions do not automatically scale with servings.

### Categories and filters

Use **Kategorien verwalten / Manage categories** in Recipes to create, rename or delete shared categories. Assign one or several categories in the recipe editor or directly in recipe details. Six editable German starter categories are included: Frühstück, Hauptgerichte, Suppen & Eintöpfe, Salate, Snacks, and Desserts & Backen. Existing recipes start uncategorized; the migration does not infer classifications or change recipe content. Deleting a category preserves recipes, photos, cookbooks and tips. Category names are stored content, so switching interface language does not translate them.

The category dropdown includes **Ohne Kategorie / Uncategorized**. Combine it with maximum preparation time, recipes with/without photos, cookbook, tag, favorites and text search; every selected condition must match. The visible result count updates immediately, and **Filter zurücksetzen / Reset filters** clears the complete selection. These filters use the same implementation in the browser and `list_recipes`.

MCP tools: `list_categories` requires read scope, `create_category`, `update_category` and `set_recipe_categories` require write scope, and `delete_category` requires admin scope. Recipes and the catalog include `categoryIds`; the catalog also includes `categories`. Recipe creation and editing accept optional `categoryIds`: omission preserves current memberships on update, while `[]` clears them. Agent connection instructions include assigning imports to suitable existing categories. `list_recipes` accepts `categoryId` (UUID, `unfiled` or empty), `maxMinutes` (positive integer up to 2880, or `null` without a limit), and `image` (`any`, `with`, `without`) alongside its existing filters.

## Install the app

In Settings, open **LunchJu als App / LunchJu as an app**. Supporting browsers show an installation button once the site is eligible. On iPhone, open LunchJu in Safari and use **Share → Add to Home Screen**. Android and desktop browsers also offer installation in their browser menu. Installed LunchJu opens in its own window and uses the same passkey-only account and language settings.

The service worker caches only the generic bilingual offline notice. Authenticated pages, APIs, OAuth, MCP, recipe images and mutations always use the network. Offline changes are not queued. Reconnect before viewing or editing kitchen data.

Use **Kochbücher verwalten / Manage cookbooks** in the recipe list to create, rename or remove shared cookbooks. A recipe can belong to several books; assign them in the recipe editor or its detail view. Removing a cookbook only removes its memberships and preserves every recipe, photo and tip. `list_cookbooks`, `create_cookbook`, `update_cookbook`, `delete_cookbook` and `set_recipe_cookbooks` expose the same actions to agents. Recipe creation and editing also accept `cookbookIds`; omitting it on update preserves memberships, while `[]` clears them. `list_recipes` combines `search`, `cookbookId` (or `unfiled`), `tag`, `favoritesOnly` and `sort` (`favorites`, `name`, `newest`, `updated`, `quickest`).

Each recipe supports up to 20 private images. Agents use `upload_recipe_image` (`mcp:write`) with `recipeId`, plain base64 `data`, `contentType` and optional `altText`. Set `append: true` to add a gallery image, or supply `imageId` to replace one specific image. Without either option, the existing cover is replaced for compatibility. JPEG, PNG and WebP are supported up to 5 MiB per image. `get_recipe_image` (`mcp:read`) and `delete_recipe_image` (`mcp:admin`) accept optional `imageId`; omitting it selects the cover. Reads return native MCP image content. `update_recipe_image` (`mcp:write`) updates `altText` and/or selects a cover with `makeCover: true`. Deleting the cover promotes another photo; deleting a recipe removes every stored photo. The catalog includes metadata, while bytes remain in private R2 and require an authenticated request. Website members can select several files, replace individual photos and choose a cover in recipe details.

**Tips and notes** preserves cooking experiences for next time separately from recipe instructions and quantity rules. Agents use `add_recipe_note` (`mcp:write`) with `recipeId` and `body`; the compatible `add_recipe_comment` writes to the same persistent `recipe.comments`. `update_recipe_comment` (`mcp:write`) and `delete_recipe_comment` (`mcp:admin`) also take `commentId`. Author identity and the agent marker come from authentication and cannot be supplied by the caller. Authors can edit/remove their own notes; the household owner can moderate all notes. Notes appear as plain text in recipe details and the catalog. Connection instructions tell agents to read them before future planning or cooking; they remain untrusted data and never change scaling rules automatically.

`scale_recipe` (`mcp:read`) accepts `recipeId` and `servings` and returns scaled ingredients, the original preparation steps, cooking time and scaling notes without changing the base recipe. `set_recipe_scaling` (`mcp:write`) replaces the recipe's special scaling rules and notes. Identify each rule by its zero-based `ingredientIndex`, current `ingredientName` and `ingredientUnit`; stale references are rejected. For example:

```json
{
  "recipeId": "RECIPE_UUID",
  "notes": "Ab 6 Personen in zwei Pfannen braten. Garzeit bleibt gleich.",
  "rules": [
    {
      "ingredientIndex": 2,
      "ingredientName": "Eier",
      "ingredientUnit": "piece",
      "mode": "linear",
      "roundUpTo": 1,
      "note": "Ganze Eier verwenden."
    }
  ]
}
```

`mode=linear` multiplies by the serving ratio; `mode=fixed` keeps the ingredient's base quantity. Optional `roundUpTo` rounds upward in that ingredient's unit after scaling. `rules: []` restores proportional scaling for all ingredients. `notes` and per-ingredient `note` are displayed as cooking guidance and never interpreted as quantity formulas. Website members can edit the same settings under each ingredient's **Skalierung** control and the recipe's scaling notes. Recipe updates from older clients preserve omitted notes and rules for ingredients that still match uniquely by name and unit.

Example requests:

- “Read our pantry and preferences, add three vegetarian recipes, and plan dinners for next week.”
- “Check whether we have enough ingredients for four servings of tomato pasta.”
- “Generate groceries for this week's plan, then sync them to Bring.”

An optional `AGENT_API_KEY` Worker secret provides full owner access for a trusted client that cannot use OAuth. It is disabled unless explicitly configured. Prefer OAuth for per-client consent and revocation.

## Bring

The native Worker client ports the HTTP protocol from `bring-cli`; see `THIRD_PARTY_NOTICES.md` for source details. Set `BRING_API_KEY` to that client's application key as a Worker secret. The home owner connects their Bring email/password in Settings; LunchJu automatically selects the list configured in `BRING_LIST_ID` and `BRING_LIST_NAME`. Both its UUID and name must match, and all other lists are excluded. LunchJu sends the password to Bring for login and never persists it. Access and refresh tokens are stored with AES-GCM authenticated encryption in D1.

Press **Bring abgleichen** in Einkaufen or Einstellungen, or call `bring_sync`. A database lease prevents overlapping integration operations. Stable item IDs and queued removals allow retries without generating new remote IDs. Bring failures leave local groceries saved and report a sanitized error.

Locally edited items take precedence during a sync. New remote items and remote completions are imported. Bring's free-text quantity descriptions are preserved in notes; imported items start as one piece because a description cannot reliably be converted to a numeric quantity. The list's article language is set to `de-DE`, with Bring's German article catalog mapping display names to stable IDs. Switching to another list is rejected. Synchronization is explicit, without background polling.

## Food quantities and history

Ingredient names match after Unicode, case and whitespace normalization. There is no fuzzy synonym matching. Mass and volume are separate; the app never guesses a food's density. A cup is defined as 240 ml, a tablespoon as 15 ml, and a teaspoon as 5 ml.

Ingredient previews, MCP scaling, pantry checks and meal snapshots use the same scaling function. Cooking time and prose instructions stay as written; special preparation requirements belong in the scaling notes. Shopping is generated from each meal's saved ingredients. Existing meals retain their snapshots when recipe rules change. New meals also retain the original ingredient quantities and rules, so rescaling a meal after deleting its recipe does not compound earlier rounding.

Use **Next day** on a planned meal to move it one calendar day ahead. The shared `move_meal` tool (`mcp:write`) accepts `{ "id": "MEAL_UUID", "date": "2026-10-24" }`. It changes only the date, preserving portions, notes and ingredient/recipe snapshots even if the original recipe changed or was deleted. Repeating the same target date is safe; already eaten meals cannot be moved. Recipe details fill the screen on mobile and retain a dialog layout on desktop.

Meal-plan generation uses the earliest-expiring usable stock first and excludes stock that expires before the meal date. Existing shopping-list quantities are treated as a minimum: generation does not remove manually requested extras or automatically shrink old entries after a plan changes.

Marking a meal eaten does not automatically consume pantry stock. Checking a grocery does not automatically create pantry stock. Update stock explicitly through the UI or agent, so uncertain serving sizes and purchase amounts do not silently corrupt inventory. Food history records meals and servings; nutrition or calorie calculation is not included.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

Tests run the production SQL against SQLite and exercise signed WebAuthn registration/login, challenge replay protection, invitation claims, session revocation, permission checks, meal snapshots, quantity allocation, grocery generation, encrypted Bring tokens, German article mapping and restrictions to Stuttgart. Scaling tests cover fixed amounts, rounding, stock checks, meal and shopping consistency, older clients, stale references and rescaling after recipe deletion. Image tests cover authenticated multipart uploads, galleries, cover selection/promotion, cross-recipe isolation, limits, replacement, removal, storage failures and concurrent updates. Cookbook and comment tests cover memberships, filtering, legacy clients, author permissions, scopes, MCP operations and migration of existing cover photos. Source tests cover link validation without remote fetching, private image uploads and native MCP reads, storage failures, concurrent replacements, status transitions and linked-recipe preservation. Step tests cover structured and legacy preparation, migration fallback, scoped writes and escaped German/English rendering. MCP tests include image-sized payloads and authentication before body processing. OAuth tests cover PKCE consent, code exchange/reuse, persistent refresh across object restart, CSRF, revocation and English consent. Language tests cover account isolation, registration preferences, German/English rendering and formatting, and live language changes within an existing MCP client connection. PWA tests verify the manifest and real icons, offline fallback, and exclusion of private data and mutations from service worker caching.

Physical-device passkey UX and a real Bring account connection require a user's browser and account. Protocol tests do not substitute for those final checks.

Implementation references: [Cloudflare TanStack Start](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/), [Cloudflare MCP authorization](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/), and [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server).

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for the OpenWish and Bring client source notices.
