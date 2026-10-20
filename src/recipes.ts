import { z } from "zod";
import { id, type Recipe } from "./shared";
export const recipeFilterSchema = z.object({
  search: z.string().max(200).default(""),
  cookbookId: z.union([id, z.literal("unfiled"), z.literal("")]).default(""),
  categoryId: z.union([id, z.literal("unfiled"), z.literal("")]).default(""),
  maxMinutes: z.number().int().min(1).max(2880).nullable().default(null),
  image: z.enum(["any", "with", "without"]).default("any"),
  tag: z.string().max(160).default(""),
  favoritesOnly: z.boolean().default(false),
  sort: z
    .enum(["favorites", "name", "newest", "updated", "quickest"])
    .default("favorites"),
});
export type RecipeFilters = z.infer<typeof recipeFilterSchema>;
export function filterRecipes(
  recipes: Recipe[],
  filters: RecipeFilters,
  language = "de",
) {
  const search = filters.search.trim().toLocaleLowerCase(language);
  return recipes
    .filter(
      (recipe) =>
        (!filters.cookbookId ||
          (filters.cookbookId === "unfiled"
            ? !recipe.cookbookIds.length
            : recipe.cookbookIds.includes(filters.cookbookId))) &&
        (!filters.categoryId ||
          (filters.categoryId === "unfiled"
            ? !recipe.categoryIds.length
            : recipe.categoryIds.includes(filters.categoryId))) &&
        (filters.maxMinutes === null || recipe.minutes <= filters.maxMinutes) &&
        (filters.image === "any" ||
          (filters.image === "with"
            ? !!recipe.imageUrl || !!recipe.images.length
            : !recipe.imageUrl && !recipe.images.length)) &&
        (!filters.tag || recipe.tags.includes(filters.tag)) &&
        (!filters.favoritesOnly || recipe.favorite) &&
        `${recipe.name} ${recipe.description} ${recipe.tags.join(" ")} ${recipe.ingredients.map((item) => item.name).join(" ")}`
          .toLocaleLowerCase(language)
          .includes(search),
    )
    .sort((a, b) => {
      const name =
        a.name.localeCompare(b.name, language) || a.id.localeCompare(b.id);
      switch (filters.sort) {
        case "name":
          return name;
        case "quickest":
          return a.minutes - b.minutes || name;
        case "newest":
          return b.createdAt.localeCompare(a.createdAt) || name;
        case "updated":
          return b.updatedAt.localeCompare(a.updatedAt) || name;
        default:
          return Number(b.favorite) - Number(a.favorite) || name;
      }
    });
}
