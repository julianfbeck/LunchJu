import { z } from "zod";
import {
  id,
  date,
  text,
  recipeSchema,
  pantrySchema,
  mealSchema,
  grocerySchema,
  missingIngredients,
  normalizeName,
} from "../shared";
import {
  catalog,
  rows,
  loadRecipe,
  saveRecipe,
  savePantry,
  saveMeal,
  addGrocery,
  groceryPlan,
  deleteItem,
  saveSetting,
  audit,
} from "./db";
import {
  connectBring,
  bringLists,
  chooseBringList,
  syncBring,
  disconnectBring,
} from "./bring";
import { hash, randomToken } from "./security";
import { requireOwner } from "./auth";
import {
  uploadRecipeImage,
  deleteRecipeImage,
  recipeImageData,
  decodeImage,
  MAX_IMAGE_BASE64,
} from "./images";
import { HttpError, now, type Env, type Access } from "./types";

type Context = { env: Env; access: Access };
function operation<S extends z.ZodType>(
  description: string,
  scope: "mcp:read" | "mcp:write" | "mcp:admin",
  schema: S,
  handler: (input: z.infer<S>, context: Context) => Promise<unknown>,
) {
  return {
    description,
    scope,
    schema,
    async run(input: unknown, context: Context) {
      if (
        !context.access.scopes.includes("mcp:read") ||
        !context.access.scopes.includes(scope)
      )
        throw new HttpError(403, `Gib ${scope} für diese Aktion frei.`);
      return handler(schema.parse(input), context);
    },
  };
}
const empty = z.object({});
const target = z.object({ id });
const range = z
  .object({ from: date, to: date })
  .refine(
    (input) =>
      input.to >= input.from &&
      new Date(input.to).getTime() - new Date(input.from).getTime() <=
        62 * 86400000,
    "Wähle einen aufsteigenden Zeitraum von höchstens 62 Tagen.",
  );
export const operations = {
  get_catalog: operation(
    "Liest den vollständigen Katalog für Stuttgart: Rezepte, Vorräte, Mahlzeiten, Essensverlauf, Einkaufsliste, Ernährungswünsche und Bring-Status. Zugangsdaten werden nie ausgegeben.",
    "mcp:read",
    empty,
    async (_, c) => catalog(c.env, c.access),
  ),
  get_recipe: operation(
    "Liest ein Rezept mit allen Zutaten und Zubereitungsschritten.",
    "mcp:read",
    target,
    async (input, c) => loadRecipe(c.env, input.id),
  ),
  create_recipe: operation(
    "Fügt ein deutsches Rezept hinzu. Mengen beziehen sich auf die angegebene Portionszahl; Einheiten immer ausdrücklich angeben.",
    "mcp:write",
    recipeSchema,
    async (input, c) => saveRecipe(c.env, input),
  ),
  update_recipe: operation(
    "Aktualisiert ein Rezept. Gespeicherte Zutatenstände bereits geplanter oder gegessener Mahlzeiten bleiben erhalten.",
    "mcp:write",
    recipeSchema.extend({ id }),
    async ({ id, ...input }, c) => {
      await loadRecipe(c.env, id);
      return saveRecipe(c.env, input, id);
    },
  ),
  delete_recipe: operation(
    "Löscht ein Rezept. Vorhandene Mahlzeiten behalten Namen und gespeicherte Zutaten.",
    "mcp:admin",
    target,
    async (input, c) => deleteItem(c.env, "recipes", input.id),
  ),
  upload_recipe_image: operation(
    "Lädt ein Rezeptbild hoch oder ersetzt es. data enthält reines Base64 ohne data-URL-Präfix, contentType ist image/jpeg, image/png oder image/webp. Höchstens 5 MB; altText beschreibt das Bild auf Deutsch.",
    "mcp:write",
    z.object({
      recipeId: id,
      data: z.string().min(1).max(MAX_IMAGE_BASE64),
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      altText: z.string().trim().max(500).default(""),
    }),
    async (input, c) =>
      uploadRecipeImage(
        c.env,
        input.recipeId,
        decodeImage(input.data),
        input.contentType,
        input.altText,
      ),
  ),
  get_recipe_image: operation(
    "Liest das Rezeptbild als Bildinhalt mit deutscher Beschreibung. Benötigt Lesezugriff auf den Haushalt Stuttgart.",
    "mcp:read",
    z.object({ recipeId: id }),
    async (input, c) => recipeImageData(c.env, input.recipeId),
  ),
  delete_recipe_image: operation(
    "Entfernt das Bild eines Rezepts aus dem privaten Bildspeicher. Das Rezept bleibt erhalten.",
    "mcp:admin",
    z.object({ recipeId: id }),
    async (input, c) => deleteRecipeImage(c.env, input.recipeId),
  ),
  check_ingredients: operation(
    "Prüft Zutaten für die gewünschte Portionszahl ohne abgelaufene Vorräte. Kompatible Einheiten werden umgerechnet; Zutatennamen müssen übereinstimmen.",
    "mcp:read",
    z.object({ recipeId: id, servings: z.number().positive().max(100) }),
    async (input, c) => {
      const recipe = await loadRecipe(c.env, input.recipeId),
        data = await catalog(c.env, c.access);
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: data.home.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const missing = missingIngredients(
        recipe.ingredients,
        data.pantry.filter(
          (item) => !item.expiresOn || item.expiresOn >= today,
        ),
        input.servings / recipe.servings,
      );
      return {
        canCook: missing.length === 0,
        recipe: recipe.name,
        servings: input.servings,
        missing,
      };
    },
  ),
  add_pantry_item: operation(
    "Erfasst einen Vorrat mit Menge, Einheit, Lagerort und optionalem Haltbarkeitsdatum.",
    "mcp:write",
    pantrySchema,
    async (input, c) => savePantry(c.env, input),
  ),
  update_pantry_item: operation(
    "Aktualisiert einen Vorrat einschließlich seiner Restmenge. Die Menge darf null sein.",
    "mcp:write",
    pantrySchema.extend({ id }),
    async ({ id, ...input }, c) => {
      await exists(c.env, "pantry", id);
      return savePantry(c.env, input, id);
    },
  ),
  delete_pantry_item: operation(
    "Entfernt einen Vorrat.",
    "mcp:admin",
    target,
    async (input, c) => deleteItem(c.env, "pantry", input.id),
  ),
  plan_meal: operation(
    "Plant ein Rezept oder eine benannte Mahlzeit. Zutaten werden auf Portionen skaliert und gespeichert. status=eaten erfasst eine gegessene Mahlzeit. Vorräte werden separat angepasst.",
    "mcp:write",
    mealSchema,
    async (input, c) => saveMeal(c.env, input),
  ),
  update_meal: operation(
    "Bearbeitet oder verschiebt eine Mahlzeit. Bei Rezeptmahlzeiten werden die gespeicherten Zutaten aktualisiert.",
    "mcp:write",
    mealSchema.safeExtend({ id }),
    async ({ id, ...input }, c) => {
      await exists(c.env, "meals", id);
      return saveMeal(c.env, input, id);
    },
  ),
  mark_meal_eaten: operation(
    "Markiert eine Mahlzeit als gegessen. Wiederholungen erhalten die ursprüngliche Uhrzeit. Vorräte bei Bedarf ausdrücklich anpassen.",
    "mcp:write",
    target,
    async (input, c) => {
      await exists(c.env, "meals", input.id);
      await c.env.DB.prepare(
        "UPDATE meals SET status='eaten',eaten_at=COALESCE(eaten_at,?) WHERE id=?",
      )
        .bind(now(), input.id)
        .run();
      return { id: input.id, status: "eaten" };
    },
  ),
  delete_meal: operation(
    "Entfernt eine geplante Mahlzeit oder einen Eintrag im Essensverlauf.",
    "mcp:admin",
    target,
    async (input, c) => deleteItem(c.env, "meals", input.id),
  ),
  add_grocery: operation(
    "Ergänzt einen Einkaufsartikel. Die Menge eines bereits offenen Artikels mit gleichem Namen und gleicher Einheit wird erhöht.",
    "mcp:write",
    grocerySchema,
    async (input, c) => addGrocery(c.env, input),
  ),
  update_grocery: operation(
    "Bearbeitet einen Einkaufsartikel oder hakt ihn ab. Abhaken verändert Vorräte nicht automatisch.",
    "mcp:write",
    grocerySchema.extend({ id, checked: z.boolean() }),
    async (input, c) => {
      await exists(c.env, "groceries", input.id);
      const updated = await c.env.DB.prepare(
        "UPDATE groceries SET name=?,normalized_name=?,quantity=?,unit=?,notes=?,checked=?,updated_at=?,bring_synced_at=NULL WHERE id=? AND (?=1 OR NOT EXISTS(SELECT 1 FROM groceries WHERE checked=0 AND normalized_name=? AND unit=? AND id!=?)) RETURNING id",
      )
        .bind(
          input.name,
          normalizeName(input.name),
          input.quantity,
          input.unit,
          input.notes,
          +input.checked,
          now(),
          input.id,
          +input.checked,
          normalizeName(input.name),
          input.unit,
          input.id,
        )
        .first();
      if (!updated)
        throw new HttpError(
          409,
          "Ein offener Einkaufsartikel mit diesem Namen und dieser Einheit existiert bereits. Bearbeite ihn oder wähle eine andere Einheit.",
        );
      return input;
    },
  ),
  delete_grocery: operation(
    "Entfernt einen Einkaufsartikel. Bei Bring verknüpfte Artikel werden beim nächsten ausdrücklichen Abgleich entfernt.",
    "mcp:admin",
    target,
    async (input, c) => deleteItem(c.env, "groceries", input.id),
  ),
  generate_groceries: operation(
    "Erstellt fehlende Einkaufsartikel für geplante Mahlzeiten im Zeitraum. Zutaten werden summiert, Einheiten umgerechnet und haltbare Vorräte abgezogen. Wiederholungen erzeugen keine doppelten Mengen.",
    "mcp:write",
    range,
    async (input, c) => groceryPlan(c.env, input.from, input.to),
  ),
  set_preferences: operation(
    "Speichert Ernährungsweise, Allergien und Kochhinweise für die gemeinsame Planung in Stuttgart.",
    "mcp:write",
    z.object({
      diet: z.string().max(160),
      allergies: z.array(text).max(30),
      notes: z.string().max(3000),
    }),
    async (input, c) => {
      await saveSetting(c.env, "preferences", JSON.stringify(input));
      return input;
    },
  ),
  bring_connect: operation(
    "Verbindet Bring ausschließlich mit der Liste Stuttgart. Nur für den Haushaltsinhaber. Das Passwort wird nie gespeichert; Tokens werden verschlüsselt.",
    "mcp:admin",
    z.object({ email: z.email(), password: z.string().min(1).max(256) }),
    async (input, c) => {
      requireOwner(c.access.user);
      return connectBring(c.env, input.email, input.password);
    },
  ),
  bring_lists: operation(
    "Liefert ausschließlich die erlaubte Bring-Liste Stuttgart. Nur für den Haushaltsinhaber.",
    "mcp:read",
    empty,
    async (_, c) => {
      requireOwner(c.access.user);
      return bringLists(c.env);
    },
  ),
  bring_choose_list: operation(
    "Bestätigt die festgelegte Bring-Liste Stuttgart. Andere Listen sind gesperrt. Nur für den Haushaltsinhaber.",
    "mcp:admin",
    z.object({ listId: z.string().min(1).max(100) }),
    async (input, c) => {
      requireOwner(c.access.user);
      return chooseBringList(c.env, input.listId);
    },
  ),
  bring_sync: operation(
    "Gleicht Einkaufsartikel ausschließlich mit Stuttgart ab: überträgt lokale Änderungen und übernimmt neue und gekaufte Artikel.",
    "mcp:write",
    empty,
    async (_, c) => syncBring(c.env),
  ),
  bring_disconnect: operation(
    "Trennt Bring und löscht die gespeicherten Tokens. Nur für den Haushaltsinhaber.",
    "mcp:admin",
    empty,
    async (_, c) => {
      requireOwner(c.access.user);
      return disconnectBring(c.env);
    },
  ),
  list_members: operation(
    "Listet die Mitglieder des einzigen Haushalts Stuttgart auf. Nur für den Haushaltsinhaber.",
    "mcp:read",
    empty,
    async (_, c) => {
      requireOwner(c.access.user);
      return {
        members: await rows(
          c.env.DB,
          "SELECT id,name,role,active FROM users ORDER BY created_at",
        ),
      };
    },
  ),
  create_invitation: operation(
    "Erstellt eine einmalige Einladung zum Haushalt Stuttgart für die Registrierung mit Passkey. Gültig für 24 Stunden. Nur für den Haushaltsinhaber.",
    "mcp:admin",
    empty,
    async (_, c) => {
      requireOwner(c.access.user);
      const token = randomToken();
      await c.env.DB.prepare(
        "INSERT INTO invitations(token_hash,created_by,expires_at) VALUES (?,?,?)",
      )
        .bind(await hash(token), c.access.user.id, Date.now() + 86400000)
        .run();
      return {
        url: `${c.env.APP_ORIGIN}/#invite=${token}`,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
    },
  ),
  set_member_active: operation(
    "Aktiviert oder deaktiviert ein Mitglied. Deaktivieren widerruft Sitzungen und Agentenzugriff. Der Haushaltsinhaber kann nicht deaktiviert werden.",
    "mcp:admin",
    z.object({ id, active: z.boolean() }),
    async (input, c) => {
      requireOwner(c.access.user);
      await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE users SET active=? WHERE id=? AND role!='owner'",
        ).bind(+input.active, input.id),
        c.env.DB.prepare(
          "DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND role!='owner' AND active=0)",
        ).bind(input.id, input.id),
      ]);
      return { id: input.id, active: input.active };
    },
  ),
  list_passkeys: operation(
    "Listet deine Passkeys ohne Schlüsselmaterial auf.",
    "mcp:read",
    empty,
    async (_, c) => ({
      passkeys: await rows(
        c.env.DB,
        "SELECT id,name,created_at FROM passkeys WHERE user_id=?",
        c.access.user.id,
      ),
    }),
  ),
  delete_passkey: operation(
    "Entfernt einen deiner Passkeys. Der letzte Passkey kann nicht gelöscht werden.",
    "mcp:admin",
    z.object({ credentialId: z.string().min(1).max(2048) }),
    async (input, c) => {
      const deleted = await c.env.DB.prepare(
        "DELETE FROM passkeys WHERE id=? AND user_id=? AND (SELECT COUNT(*) FROM passkeys WHERE user_id=?)>1 RETURNING id",
      )
        .bind(input.credentialId, c.access.user.id, c.access.user.id)
        .first();
      if (!deleted)
        throw new HttpError(
          409,
          "Behalte mindestens einen Passkey und wähle nur einen Passkey deines Kontos.",
        );
      return { deleted: input.credentialId };
    },
  ),
};
async function exists(
  env: Env,
  table: "pantry" | "meals" | "groceries",
  id: string,
) {
  if (
    !(await env.DB.prepare(`SELECT id FROM ${table} WHERE id=?`)
      .bind(id)
      .first())
  )
    throw new HttpError(404, "Eintrag nicht gefunden.");
}
export type OperationName = keyof typeof operations;
export async function runOperation(
  name: string,
  input: unknown,
  env: Env,
  access: Access,
) {
  if (!Object.hasOwn(operations, name))
    throw new HttpError(404, "Unbekannte Aktion.");
  const op = operations[name as OperationName],
    result = await op.run(input, { env, access });
  if (op.scope !== "mcp:read")
    await audit(env, access, name).catch(() =>
      console.error("Protokollierung fehlgeschlagen."),
    );
  return result;
}
