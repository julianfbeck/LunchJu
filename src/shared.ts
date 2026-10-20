import { z } from "zod";
import type { Language } from "./i18n";
z.config(z.locales.de());

export const text = z.string().trim().min(1).max(160);
export const id = z.string().uuid();
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Verwende ein gültiges Datum im Format JJJJ-MM-TT");
export const unit = z.enum([
  "g",
  "kg",
  "ml",
  "l",
  "piece",
  "tsp",
  "tbsp",
  "cup",
]);
export const servingsSchema = z.number().finite().positive().max(100);
export const ingredientScalingSchema = z.object({
  mode: z.enum(["linear", "fixed"]).default("linear"),
  roundUpTo: z.number().finite().min(0.001).max(100000).optional(),
  note: z.string().trim().max(500).default(""),
});
export const ingredientSchema = z.object({
  name: text,
  quantity: z.number().finite().positive().max(100000),
  unit,
  scaling: ingredientScalingSchema.optional(),
});
export const recipeSchema = z.object({
  name: text,
  description: z.string().max(3000).default(""),
  servings: servingsSchema.default(2),
  scalingNotes: z.string().trim().max(2000).default(""),
  minutes: z.number().int().min(0).max(2880).default(30),
  ingredients: z.array(ingredientSchema).min(1).max(100),
  instructions: z.array(z.string().trim().min(1).max(3000)).min(1).max(60),
  tags: z.array(text).max(15).default([]),
  sourceUrl: z
    .union([
      z.literal(""),
      z
        .url()
        .refine((value) =>
          ["http:", "https:"].includes(new URL(value).protocol),
        ),
    ])
    .default(""),
  favorite: z.boolean().default(false),
});
export const pantrySchema = z.object({
  name: text,
  quantity: z.number().finite().min(0).max(100000),
  unit,
  location: z.enum(["Pantry", "Fridge", "Freezer"]).default("Pantry"),
  expiresOn: date.nullable().default(null),
});
export const mealSchema = z
  .object({
    recipeId: id.optional(),
    name: text.optional(),
    date,
    slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    servings: servingsSchema.default(2),
    notes: z.string().max(2000).default(""),
    status: z.enum(["planned", "eaten"]).default("planned"),
  })
  .refine(
    (value) => value.recipeId || value.name,
    "Wähle ein Rezept oder benenne die Mahlzeit",
  );
export const grocerySchema = z.object({
  name: text,
  quantity: z.number().finite().positive().max(100000),
  unit,
  notes: z.string().max(1000).default(""),
});
export type Ingredient = z.infer<typeof ingredientSchema>;
export type Recipe = z.infer<typeof recipeSchema> & {
  id: string;
  imageUrl: string | null;
  imageAlt: string;
  createdAt: string;
  updatedAt: string;
};
export type PantryItem = z.infer<typeof pantrySchema> & {
  id: string;
  updatedAt: string;
};
export type Meal = Omit<z.infer<typeof mealSchema>, "recipeId"> & {
  id: string;
  recipeId: string | null;
  name: string;
  ingredients: Ingredient[];
  eatenAt: string | null;
  scalingNotes: string;
};
export type Grocery = z.infer<typeof grocerySchema> & {
  id: string;
  checked: boolean;
  bringUuid: string | null;
  updatedAt: string;
};
export type User = {
  id: string;
  name: string;
  role: "owner" | "member";
  language: Language | null;
};
export type Catalog = {
  recipes: Recipe[];
  pantry: PantryItem[];
  meals: Meal[];
  groceries: Grocery[];
  home: { name: string; timeZone: string; locale: "de-DE" | "en-GB" };
  contentLanguage: Language;
  bring: { connected: boolean; listId: string | null };
  user: User;
};

export function normalizeName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/\s+/g, " ");
}
const units = {
  g: ["mass", 1],
  kg: ["mass", 1000],
  ml: ["volume", 1],
  l: ["volume", 1000],
  tsp: ["volume", 5],
  tbsp: ["volume", 15],
  cup: ["volume", 240],
  piece: ["count", 1],
} as const;
export function quantityIn(
  quantity: number,
  from: Ingredient["unit"],
  to: Ingredient["unit"],
): number | null {
  return units[from][0] === units[to][0]
    ? (quantity * units[from][1]) / units[to][1]
    : null;
}
export function missingIngredients(
  ingredients: Ingredient[],
  pantry: PantryItem[],
  scale = 1,
) {
  const needed = new Map<string, Ingredient>();
  for (const item of ingredients) {
    const group = units[item.unit][0];
    const key = `${normalizeName(item.name)}:${group}`;
    const existing = needed.get(key);
    if (existing)
      existing.quantity += quantityIn(
        item.quantity * scale,
        item.unit,
        existing.unit,
      )!;
    else needed.set(key, { ...item, quantity: item.quantity * scale });
  }
  return [...needed.values()]
    .map((item) => {
      const available = pantry
        .filter(
          (stock) => normalizeName(stock.name) === normalizeName(item.name),
        )
        .reduce(
          (sum, stock) =>
            sum + (quantityIn(stock.quantity, stock.unit, item.unit) ?? 0),
          0,
        );
      return {
        ...item,
        quantity:
          Math.round(Math.max(0, item.quantity - available) * 1000) / 1000,
        required: item.quantity,
        available,
      };
    })
    .filter((item) => item.quantity > 0);
}
export function mealPlanMissing(
  meals: Pick<Meal, "date" | "ingredients">[],
  pantry: PantryItem[],
) {
  const stock = pantry
    .map((item) => ({ ...item }))
    .sort((a, b) =>
      (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999"),
    );
  const missing: Ingredient[] = [];
  for (const meal of [...meals].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const item of meal.ingredients) {
      let needed = item.quantity;
      for (const lot of stock) {
        if (
          normalizeName(lot.name) !== normalizeName(item.name) ||
          (lot.expiresOn && lot.expiresOn < meal.date)
        )
          continue;
        const available = quantityIn(lot.quantity, lot.unit, item.unit);
        if (available === null) continue;
        const used = Math.min(needed, available);
        needed -= used;
        lot.quantity -= quantityIn(used, item.unit, lot.unit)!;
        if (needed < 0.000001) break;
      }
      if (needed > 0.000001) missing.push({ ...item, quantity: needed });
    }
  }
  return missingIngredients(missing, []);
}
