import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
it("migrates existing private covers without changing object keys, recipe data or meal history", () => {
  const db = new DatabaseSync(":memory:");
  for (const name of [
    "0001_kitchen.sql",
    "0002_recipe_images.sql",
    "0003_recipe_scaling.sql",
    "0004_user_language.sql",
  ])
    db.exec(
      readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
    );
  const recipeId = crypto.randomUUID();
  db.prepare(
    "INSERT INTO recipes(id,name,servings,ingredients,instructions,created_at,updated_at,image_key,image_alt) VALUES (?,'Pasta',2,'[]','[]','time','time','recipes/existing.png','Originalbild')",
  ).run(recipeId);
  db.prepare(
    "INSERT INTO meals(id,recipe_id,name,date,slot,servings,status,created_at) VALUES (?,?,'Pasta','2026-10-20','dinner',2,'eaten','time')",
  ).run(crypto.randomUUID(), recipeId);
  db.exec(
    readFileSync(
      new URL("../migrations/0005_recipe_collections.sql", import.meta.url),
      "utf8",
    ),
  );
  expect(db.prepare("SELECT * FROM recipe_images").get()).toMatchObject({
    id: recipeId,
    recipe_id: recipeId,
    image_key: "recipes/existing.png",
    alt_text: "Originalbild",
  });
  expect(
    db.prepare("SELECT image_key,image_alt,images_version FROM recipes").get(),
  ).toMatchObject({
    image_key: "recipes/existing.png",
    image_alt: "Originalbild",
    images_version: 0,
  });
  expect(db.prepare("SELECT status FROM meals").get()?.status).toBe("eaten");
  db.prepare("DELETE FROM recipes WHERE id=?").run(recipeId);
  expect(db.prepare("SELECT COUNT(*) AS n FROM recipe_images").get()?.n).toBe(
    0,
  );
  expect(db.prepare("SELECT recipe_id,status FROM meals").get()).toMatchObject({
    recipe_id: null,
    status: "eaten",
  });
  db.close();
});
