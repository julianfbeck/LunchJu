import { translate, languageLocale, type Language } from "./i18n";
// Storage and MCP enum values stay stable. Bring keeps the German default.
export const unitLabels = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  piece: "Stück",
  tsp: "TL",
  tbsp: "EL",
  cup: "Tasse",
} as const;
export const locationLabels = {
  All: "Alle",
  Pantry: "Vorratsschrank",
  Fridge: "Kühlschrank",
  Freezer: "Gefrierfach",
} as const;
export const mealSlotLabels = {
  breakfast: "Frühstück",
  lunch: "Mittagessen",
  dinner: "Abendessen",
  snack: "Zwischenmahlzeit",
} as const;
export const formatNumber = (value: number, language: Language = "de") =>
  new Intl.NumberFormat(languageLocale(language), {
    maximumFractionDigits: 3,
  }).format(value);
export const formatQuantity = (
  value: number,
  unit: keyof typeof unitLabels,
  language: Language = "de",
) =>
  `${formatNumber(value, language)} ${translate(language, unitLabels[unit])}`;
