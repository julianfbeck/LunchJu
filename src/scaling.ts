import type { Recipe } from "./shared";

export class RecipeScalingError extends Error {}
const validServings = (value: number) =>
  Number.isFinite(value) && value > 0 && value <= 100;

export type RecipeSnapshot = Pick<
  Recipe,
  "servings" | "ingredients" | "scalingNotes"
>;

export function scaleIngredients(
  recipe: Pick<Recipe, "servings" | "ingredients">,
  servings: number,
) {
  if (!validServings(servings) || !validServings(recipe.servings))
    throw new RecipeScalingError("Wähle eine gültige Personenzahl bis 100.");
  const factor = servings / recipe.servings;
  return recipe.ingredients.map((item) => {
    let quantity =
      item.scaling?.mode === "fixed" ? item.quantity : item.quantity * factor;
    if (item.scaling?.roundUpTo) {
      const step = item.scaling.roundUpTo;
      // Remove floating point noise before rounding up to a whole increment.
      quantity = Math.ceil(Number((quantity / step).toPrecision(12))) * step;
    }
    if (!Number.isFinite(quantity) || quantity <= 0)
      throw new RecipeScalingError(
        "Die gewählte Personenzahl ergibt eine ungültige Zutatenmenge.",
      );
    return { ...item, quantity: Number(quantity.toPrecision(12)) };
  });
}
