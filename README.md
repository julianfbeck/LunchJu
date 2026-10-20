# LunchJu

**Shared meal planning for people and agents.**

Recipes, pantry, meal plans and groceries for one shared home. Use the mobile-first app or connect your agent through MCP. Built with TanStack Start and Cloudflare Workers, D1 and R2.

## Features

- Recipes with cookbooks, categories, filters, photo galleries and cooking tips.
- Portion scaling, step-by-step cooking, meal planning and food history.
- Pantry quantities and expiry dates, grocery generation and Bring sync.
- A source inbox for recipe photos, notes, Instagram Reels, TikTok and YouTube Shorts. Your connected agent handles extraction.
- MCP access to the same kitchen operations, including images and recipe organization.
- Shared household accounts with passkeys, German/English selection and an installable PWA.

## Screenshots

Local preview with fictional data.

|                                                             Recipes                                                             |                                                       Meal plan                                                       |                                                             Groceries                                                              |                                                              Pantry                                                              |
| :-----------------------------------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------: |
| [<img src="docs/screenshots/mobile-recipes.jpg" width="210" alt="Recipes and portions" />](docs/screenshots/mobile-recipes.jpg) | [<img src="docs/screenshots/mobile-plan.jpg" width="210" alt="Weekly meal plan" />](docs/screenshots/mobile-plan.jpg) | [<img src="docs/screenshots/mobile-groceries.jpg" width="210" alt="Groceries and Bring" />](docs/screenshots/mobile-groceries.jpg) | [<img src="docs/screenshots/mobile-pantry.jpg" width="210" alt="Pantry and expiry dates" />](docs/screenshots/mobile-pantry.jpg) |

[Desktop screenshot](docs/screenshots/desktop-kitchen.jpg) · [Capture instructions](scripts/screenshots/README.md)

## Run locally

Requires Node.js 24+.

```sh
npm ci
cp .dev.vars.example .dev.vars
# Set independent BOOTSTRAP_TOKEN and ENCRYPTION_KEY values in .dev.vars.
# Generate each with: openssl rand -hex 32
npm run db:migrate
npm run dev
```

Open [localhost:3000](http://localhost:3000), enter your bootstrap token and create a passkey. Invite other members from Settings.

## Connect an agent

Add your deployed instance's MCP endpoint to an OAuth-capable client:

```text
https://lunchju.example.com/mcp
```

Sign in with a passkey and choose read, write or admin permissions. Agents use your selected language for new content.

Try: “Plan three dinners using our pantry, create the missing groceries and sync them to Bring.”

## Deploy your own

Configure your own Worker, D1 database, private R2 bucket and domain in `wrangler.jsonc`. Set your secrets and the single Bring list to connect.

See the [setup, deployment and MCP guide](docs/guide.md) for commands, tool details and current limits. The PWA requires a connection for kitchen data; stock changes and Bring sync are explicit actions.

[Third-party notices](THIRD_PARTY_NOTICES.md)
