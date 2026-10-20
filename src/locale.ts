// Storage and MCP enum values stay stable; all user-facing labels are German.
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
export const formatNumber = (value: number) =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(value);
export const formatQuantity = (value: number, unit: keyof typeof unitLabels) =>
  `${formatNumber(value)} ${unitLabels[unit]}`;
