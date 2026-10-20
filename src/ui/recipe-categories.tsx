import { useState } from "react";
import { Folder, Pencil, Trash2 } from "lucide-react";
import type { Category, Recipe } from "../shared";
import { action } from "./api";
import { useI18n } from "./language";

export function CategoryPicker({
  categories,
  selected,
  onChange,
}: {
  categories: Category[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="cookbook-picker">
      <legend>{t("Kategorien")}</legend>
      {categories.map((category) => (
        <label key={category.id}>
          <input
            type="checkbox"
            checked={selected.includes(category.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, category.id]
                  : selected.filter((id) => id !== category.id),
              )
            }
          />
          {category.name}
        </label>
      ))}
      {!categories.length && (
        <p className="muted">{t("Lege im Rezeptbereich eine Kategorie an.")}</p>
      )}
    </fieldset>
  );
}
export function CategoryManager({
  categories,
  recipes,
  onChanged,
}: {
  categories: Category[];
  recipes: Recipe[];
  onChanged: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Category | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function change(operation: string, input: object) {
    setBusy(true);
    setError("");
    try {
      await action(operation, input);
      setEditing(null);
      await onChanged();
      return true;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t("Speichern fehlgeschlagen."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="cookbook-manager">
      <summary>
        <Folder size={17} />
        {t("Kategorien verwalten")}{" "}
        <span className="muted">({categories.length})</span>
      </summary>
      <p className="muted">
        {t(
          "Ordne ein Rezept einer oder mehreren Kategorien zu. Kochbücher und Schlagwörter bleiben zusätzlich verfügbar.",
        )}
      </p>
      <ul>
        {categories.map((category) => (
          <li key={category.id}>
            <div>
              <strong>{category.name}</strong>
              <span className="muted">
                {" "}
                ·{" "}
                {t(
                  "{0} Rezepte",
                  recipes.filter((recipe) =>
                    recipe.categoryIds.includes(category.id),
                  ).length,
                )}
              </span>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="icon-button"
                disabled={busy}
                aria-label={t("Kategorie bearbeiten: {0}", category.name)}
                onClick={() => {
                  setEditing(category);
                  setError("");
                }}
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                className="icon-button danger"
                disabled={busy}
                aria-label={t("Kategorie entfernen: {0}", category.name)}
                onClick={() => {
                  if (
                    confirm(
                      t(
                        "Kategorie „{0}“ entfernen? Alle Rezepte bleiben erhalten.",
                        category.name,
                      ),
                    )
                  )
                    void change("delete_category", { id: category.id });
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form
        key={editing?.id ?? "new"}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const name = new FormData(form).get("name");
          const saved = await change(
            editing ? "update_category" : "create_category",
            {
              ...(editing ? { id: editing.id } : {}),
              name,
            },
          );
          if (saved) form.reset();
        }}
      >
        <label>
          {t(editing ? "Kategorie umbenennen" : "Neue Kategorie")}
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={editing?.name ?? ""}
            disabled={busy}
          />
        </label>
        <div className="button-row">
          <button className="secondary" disabled={busy}>
            {t("Speichern")}
          </button>
          {editing && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              {t("Abbrechen")}
            </button>
          )}
        </div>
      </form>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
    </details>
  );
}
export function RecipeCategories({
  recipe,
  categories,
  onSaved,
}: {
  recipe: Recipe;
  categories: Category[];
  onSaved: (recipe: Recipe) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="recipe-collection">
      <summary>
        {t("Kategorien")} ·{" "}
        {categories
          .filter((category) => recipe.categoryIds.includes(category.id))
          .map((category) => category.name)
          .join(", ") || t("Ohne Kategorie")}
      </summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          const form = new FormData(event.currentTarget);
          try {
            onSaved(
              await action<Recipe>("set_recipe_categories", {
                recipeId: recipe.id,
                categoryIds: form.getAll("categoryId"),
              }),
            );
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : t("Speichern fehlgeschlagen."),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset
          className="cookbook-picker"
          key={recipe.categoryIds.join(",")}
          disabled={busy}
        >
          <legend>{t("Kategorien auswählen")}</legend>
          {categories.map((category) => (
            <label key={category.id}>
              <input
                type="checkbox"
                name="categoryId"
                value={category.id}
                defaultChecked={recipe.categoryIds.includes(category.id)}
              />
              {category.name}
            </label>
          ))}
        </fieldset>
        <button className="secondary" disabled={busy || !categories.length}>
          {t("Kategorien speichern")}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
    </details>
  );
}
