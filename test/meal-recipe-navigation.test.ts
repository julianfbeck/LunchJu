import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fixture } from "./support/db";
import { runOperation } from "../src/server/operations";
import type { Recipe } from "../src/shared";
import { KitchenApp } from "../src/ui/app";
import { LanguageProvider } from "../src/ui/language";
import { today } from "../src/ui/api";

describe("Recipe navigation from the meal plan", () => {
  it.each(["de", "en"] as const)(
    "offers recipe controls for planned and eaten meals, with safe fallbacks (%s)",
    async (language) => {
      const f = fixture();
      try {
        const call = (name: string, input: unknown = {}) =>
          runOperation(name, input, f.env, f.access);
        const input = {
          name: "Curry & Reis",
          servings: 2,
          ingredients: [{ name: "Reis", quantity: 200, unit: "g" }],
          instructions: ["Reis kochen."],
        };
        const recipe = (await call("create_recipe", input)) as Recipe;
        const meal = {
          recipeId: recipe.id,
          date: today(),
          slot: "dinner",
          servings: 3.5,
        };
        await call("plan_meal", { ...meal, name: "Heute: Curry & Reis" });
        await call("plan_meal", {
          ...meal,
          name: "Schon gegessen",
          status: "eaten",
        });
        // A matching name alone must not link a meal to an unrelated recipe.
        await call("plan_meal", {
          name: recipe.name,
          date: today(),
          slot: "lunch",
        });
        const deleted = (await call("create_recipe", {
          ...input,
          name: "Gelöschtes Rezept",
        })) as Recipe;
        await call("plan_meal", { ...meal, recipeId: deleted.id });
        await call("delete_recipe", { id: deleted.id });

        const data = await call("get_catalog");
        const client = new QueryClient();
        client.setQueryData(["session"], {
          user: f.access.user,
          setup: false,
          homeName: "Stuttgart",
        });
        client.setQueryData(["catalog"], data);
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
        const cards = html.match(/<article class="meal-card">.*?<\/article>/g)!;
        expect(cards).toHaveLength(4);
        const prefix = language === "de" ? "Rezept öffnen" : "Open recipe";
        for (const name of ["Heute: Curry &amp; Reis", "Schon gegessen"]) {
          const card = cards.find((value) => value.includes(name))!;
          expect(card).toContain(`aria-label="${prefix}: ${name}"`);
          expect(card).toContain('type="button"');
          expect(card).toContain(language === "de" ? "3,5" : "3.5");
        }
        const unlinked = cards.filter(
          (card) => !card.includes('class="meal-recipe-link"'),
        );
        expect(unlinked).toHaveLength(2);
        expect(unlinked.join("")).toContain("Gelöschtes Rezept");
        expect(unlinked.join("")).toContain("Curry &amp; Reis");
        expect(unlinked.join("")).not.toContain(`${prefix}:`);
        // Recipe navigation must leave the existing meal actions available.
        expect(
          cards.every((card) => card.includes('class="icon-button danger"')),
        ).toBe(true);
        const moveLabel =
          language === "de"
            ? "Auf den nächsten Tag verschieben"
            : "Move to the next day";
        expect(cards.filter((card) => card.includes(moveLabel))).toHaveLength(
          3,
        );
        expect(
          cards.find((card) => card.includes("Schon gegessen")),
        ).not.toContain(moveLabel);
        expect(unlinked.every((card) => card.includes(moveLabel))).toBe(true);
        client.clear();
      } finally {
        f.sqlite.close();
      }
    },
  );
});
