# README screenshots

The images in `docs/screenshots/` are captures of LunchJu's production React components and stylesheet. The frames crop Chrome's desktop scrollbar from the mobile captures. The README uses these local sample-data captures without linking to a personal deployment.

All displayed accounts, recipes, meals, stock and grocery items are fictional. The Bring status is sample data. The preview neither reads production data nor connects to Cloudflare or Bring. It runs on loopback with a separate Vite configuration and no `.dev.vars` loading. Mutation requests are rejected.

## Refresh the captures

```sh
npm ci
node scripts/screenshots/serve.mjs
```

Open [the screenshot preview](http://127.0.0.1:4310) in your usual Chrome profile. It renders the unmodified `KitchenApp`, with a sample account and API responses from `fixtures.mjs`. Dates are relative to the capture day in Europe/Berlin.

1. Set a mobile viewport of **430 × 932**. Capture **Rezepte**, **Plan**, **Einkaufsliste** and **Vorräte** into their corresponding `docs/screenshots/mobile-*.jpg` files.
2. Set a desktop viewport of **1440 × 1000**, open **Rezepte** and save `docs/screenshots/desktop-kitchen.jpg`.
3. Inspect every image, check that the photo previews have loaded, and restore your normal browser viewport. Stop the server with Ctrl+C.

An optional [custom overview](http://127.0.0.1:4310/overview) combines three saved mobile captures in a branded layout at **1600 × 1000**. Its editable composition is `overview.html`; it uses the tagline “Shared meal planning for people and agents” and contains no deployment URL. The README currently uses the individual captures instead of an overview banner.

These viewport sizes describe the CSS layout. The browser integration may scale the exported JPEG to the display size. Keep each image's original aspect ratio when embedding it.

The preview and its photos live outside `public/` and are not included in the deployed app.

## Sample photography

The food images are from Unsplash. The original image URLs are retained here for provenance; they are used only in this documentation preview.

- [Pasta with mushrooms and greens](https://images.unsplash.com/photo-1473093226795-af9932fe5856)
- [Chickpea and vegetable bowl](https://images.unsplash.com/photo-1512621776951-a57141f2eefd)
- [Salmon with rice and vegetables](https://images.unsplash.com/photo-1547592180-85f173990554)

Local copies use `?auto=format&fit=crop&w=700&q=80&fm=jpg`.
