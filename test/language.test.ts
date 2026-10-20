import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { languageCookie, languageFromCookie, translate } from "../src/i18n";
import { formatNumber, formatQuantity } from "../src/locale";
import { formatDate } from "../src/ui/api";
import { LanguageProvider } from "../src/ui/language";
import { KitchenApp } from "../src/ui/app";
import { RecipeList } from "../src/ui/recipe-list";
import { fixture } from "./support/db";
import { runOperation } from "../src/server/operations";
import type { Recipe } from "../src/shared";

describe("Language selection", () => {
  it("restores a supported choice and defaults to German for missing or invalid cookies", () => {
    expect(languageFromCookie(null)).toBe("de");
    expect(
      languageFromCookie("session=test; lunchju_language=en; other=x"),
    ).toBe("en");
    expect(languageFromCookie("lunchju_language=fr")).toBe("de");
    expect(languageFromCookie("other_lunchju_language=en")).toBe("de");
    expect(languageCookie("en", true)).toBe(
      "lunchju_language=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
    expect(languageFromCookie(languageCookie("de", false))).toBe("de");
  });

  it("localises dates and units while retaining German defaults for Bring", () => {
    expect(formatNumber(1234.5)).toBe("1.234,5");
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    expect(formatQuantity(2.5, "piece")).toBe("2,5 Stück");
    expect(formatQuantity(2.5, "piece", "en")).toBe("2.5 pcs");
    expect(formatDate("2026-10-20", { weekday: "long" }, "en")).toBe("Tuesday");
    expect(formatDate("2026-10-20", { weekday: "long" })).toBe("Dienstag");
  });

  it("interpolates user content without translating or interpreting it", () => {
    expect(translate("en", "Bearbeiten: {0}", "Vorräte {1} <img>")).toBe(
      "Edit: Vorräte {1} <img>",
    );
    expect(translate("en", " Personen ")).toBe(" People ");
    expect(translate("en", "constructor")).toBe("constructor");
    expect(translate("en", "  ")).toBe("  ");
  });

  it("renders the selected language before login with an accessible selector", () => {
    for (const language of ["de", "en"] as const) {
      const client = new QueryClient();
      client.setQueryData(["session"], {
        user: null,
        setup: false,
        homeName: "Stuttgart",
      });
      const html = renderToStaticMarkup(
        createElement(LanguageProvider, {
          initialLanguage: language,
          children: createElement(
            QueryClientProvider,
            { client },
            createElement(KitchenApp),
          ),
        }),
      );
      expect(html).toContain(
        language === "en" ? "Sign in with passkey" : "Mit Passkey anmelden",
      );
      expect(html).toMatch(
        new RegExp(`<option value="${language}"[^>]* selected=""`),
      );
      expect(html).toContain("Sprache / Language");
    }
  });

  it("translates recipe controls while leaving stored recipes and enum values intact", async () => {
    const f = fixture();
    const recipe = (await runOperation(
      "create_recipe",
      {
        name: "Vorräte",
        description: "Nur deutsche Rezepttexte.",
        servings: 2,
        minutes: 20,
        ingredients: [{ name: "Eier", quantity: 2.5, unit: "piece" }],
        instructions: ["Eier braten."],
      },
      f.env,
      f.access,
    )) as Recipe;
    const props = {
      recipes: [recipe],
      busy: false,
      onOpen() {},
      onPlan() {},
      onEdit() {},
      onFavorite() {},
    };
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, {
        initialLanguage: "en",
        children: createElement(RecipeList, props),
      }),
    );
    expect(html).toContain("Nur deutsche Rezepttexte.");
    expect(html).toContain("2.5 pcs Eier");
    expect(html).toContain("Open recipe: Vorräte");
    expect(html).toContain("All ingredients for 2 people");
    expect(recipe.ingredients[0].unit).toBe("piece");
    expect(recipe.name).toBe("Vorräte");
  });
});
