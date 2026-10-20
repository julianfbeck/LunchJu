// Fictional content for documentation captures. No production data or credentials.
export function demoCatalog() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const day = (offset) => {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const timestamp = `${date}T08:00:00.000Z`;
  const uuid = (index) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const ingredient = (name, quantity, unit = "g") => ({ name, quantity, unit });
  const recipe = (index, value) => ({
    id: uuid(index),
    images: value.imageUrl
      ? [
          {
            id: uuid(index + 500),
            url: value.imageUrl,
            altText: value.imageAlt,
            createdAt: timestamp,
          },
        ]
      : [],
    cookbookIds: [],
    categoryIds: [],
    comments: [],
    steps: value.instructions.map((description, index) => ({
      title: `Schritt ${index + 1}`,
      description,
      durationMinutes: null,
    })),
    servings: 2,
    scalingNotes: "",
    favorite: true,
    sourceUrl: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...value,
  });
  const recipes = [
    recipe(1, {
      name: "Pilz-Tagliatelle",
      description:
        "Goldbraune Pilze, frischer Spinat und ein wenig Parmesan. Ein schnelles Abendessen für zwei.",
      minutes: 25,
      imageUrl: "/scripts/screenshots/assets/pasta.jpg",
      imageAlt: "Tagliatelle mit Pilzen, Spinat und geriebenem Parmesan",
      tags: ["Vegetarisch", "Schnell"],
      ingredients: [
        ingredient("Tagliatelle", 200),
        ingredient("Champignons", 250),
        ingredient("Spinat", 100),
        ingredient("Parmesan", 40),
        ingredient("Olivenöl", 1, "tbsp"),
      ],
      instructions: [
        "Tagliatelle in Salzwasser bissfest kochen. Etwas Kochwasser auffangen.",
        "Pilze in Olivenöl goldbraun braten, Spinat dazugeben und zusammenfallen lassen.",
        "Pasta und etwas Kochwasser untermischen. Mit Parmesan servieren.",
      ],
    }),
    recipe(2, {
      name: "Kichererbsen-Bowl",
      description:
        "Knackiges Gemüse, cremige Avocado und Kichererbsen mit einem frischen Zitronendressing.",
      minutes: 20,
      imageUrl: "/scripts/screenshots/assets/salad.jpg",
      imageAlt: "Bunte Bowl mit Kichererbsen, Avocado, Tomaten und Salat",
      tags: ["Vegan", "Meal Prep"],
      ingredients: [
        ingredient("Kichererbsen", 240),
        ingredient("Avocado", 1, "piece"),
        ingredient("Cherrytomaten", 150),
        ingredient("Blattsalat", 80),
        ingredient("Zitrone", 1, "piece"),
      ],
      instructions: [
        "Kichererbsen abspülen und abtropfen lassen. Gemüse waschen und schneiden.",
        "Alles in zwei Schüsseln anrichten. Mit Zitronensaft und Olivenöl abschmecken.",
      ],
    }),
    recipe(3, {
      name: "Ofenlachs mit Reis",
      description:
        "Saftiger Lachs mit grünen Bohnen, Reis und frischen Kräutern.",
      minutes: 35,
      imageUrl: "/scripts/screenshots/assets/salmon.jpg",
      imageAlt: "Lachsfilet mit Reis, grünen Bohnen und Tomaten",
      tags: ["Aus dem Ofen", "Für zwei"],
      ingredients: [
        ingredient("Lachsfilet", 300),
        ingredient("Reis", 150),
        ingredient("Grüne Bohnen", 250),
        ingredient("Cherrytomaten", 100),
        ingredient("Zitrone", 1, "piece"),
      ],
      instructions: [
        "Ofen auf 180 °C Ober-/Unterhitze vorheizen. Reis nach Packungsangabe kochen.",
        "Lachs und Tomaten in eine Form legen und 18–22 Minuten backen. Bohnen separat garen.",
        "Alles zusammen mit Zitronensaft und frischen Kräutern servieren.",
      ],
    }),
  ];
  const meal = (index, recipeIndex, offset, slot, status = "planned") => ({
    id: uuid(100 + index),
    recipeId: recipes[recipeIndex].id,
    name: recipes[recipeIndex].name,
    date: day(offset),
    slot,
    servings: 2,
    ingredients: recipes[recipeIndex].ingredients,
    status,
    notes: slot === "lunch" ? "Für die Mittagspause" : "Zusammen kochen",
    eatenAt: status === "eaten" ? timestamp : null,
    scalingNotes: "",
  });
  const pantry = [
    ["Spinat", 200, "g", "Fridge", 1],
    ["Champignons", 400, "g", "Fridge", 2],
    ["Parmesan", 100, "g", "Fridge", 12],
    ["Tagliatelle", 500, "g", "Pantry", null],
    ["Kichererbsen", 480, "g", "Pantry", null],
    ["Reis", 750, "g", "Pantry", null],
    ["Olivenöl", 500, "ml", "Pantry", null],
    ["Grüne Bohnen", 500, "g", "Freezer", 90],
  ].map(([name, quantity, unit, location, expires], index) => ({
    id: uuid(200 + index),
    name,
    quantity,
    unit,
    location,
    expiresOn: expires === null ? null : day(expires),
    updatedAt: timestamp,
  }));
  const groceries = [
    ["Avocado", 2, "piece", "Für die Bowls", false],
    ["Cherrytomaten", 250, "g", "Für zwei Rezepte", false],
    ["Zitronen", 2, "piece", "Bio", false],
    ["Lachsfilet", 300, "g", "Für Freitag", false],
    ["Blattsalat", 1, "piece", "Frisch vom Markt", false],
    ["Hafermilch", 1, "l", "Fürs Frühstück", false],
    ["Tagliatelle", 500, "g", "", true],
    ["Olivenöl", 500, "ml", "", true],
  ].map(([name, quantity, unit, notes, checked], index) => ({
    id: uuid(300 + index),
    name,
    quantity,
    unit,
    notes,
    checked,
    bringUuid: uuid(400 + index),
    updatedAt: timestamp,
  }));
  return {
    cookbooks: [],
    categories: [],
    sources: [],
    recipes,
    pantry,
    groceries,
    meals: [
      meal(1, 1, 0, "lunch"),
      meal(2, 0, 0, "dinner"),
      meal(3, 2, 1, "dinner"),
      meal(4, 1, 2, "lunch"),
      meal(5, 0, -1, "dinner", "eaten"),
    ],
    home: { name: "Stuttgart", timeZone: "Europe/Berlin", locale: "de-DE" },
    contentLanguage: "de",
    bring: { connected: true, listId: uuid(500) },
    preferences: {
      diet: "Viel Gemüse, unter der Woche gern vegetarisch.",
      allergies: [],
      notes: "Meistens für zwei Personen. Mittags gern Reste mitnehmen.",
    },
    user: { id: uuid(600), name: "Alex", role: "owner", language: "de" },
  };
}
