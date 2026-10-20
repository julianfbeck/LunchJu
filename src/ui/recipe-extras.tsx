import { useEffect, useState } from "react";
import { BookOpen, ImagePlus, Pencil, Trash2 } from "lucide-react";
import type {
  Cookbook,
  Category,
  Recipe,
  RecipeComment,
  User,
} from "../shared";
import type { RecipeFilters } from "../recipes";
import { recipeFilterSchema } from "../recipes";
import { action, ApiError } from "./api";
import { useI18n } from "./language";

type Saved = (recipe: Recipe) => void;
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
export function CookbookPicker({
  cookbooks,
  selected,
  onChange,
}: {
  cookbooks: Cookbook[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="cookbook-picker">
      <legend>{t("Kochbücher")}</legend>
      {cookbooks.length ? (
        cookbooks.map((book) => (
          <label key={book.id}>
            <input
              type="checkbox"
              checked={selected.includes(book.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, book.id]
                    : selected.filter((id) => id !== book.id),
                )
              }
            />
            {book.name}
          </label>
        ))
      ) : (
        <p className="muted">
          {t("Lege im Rezeptbereich dein erstes Kochbuch an.")}
        </p>
      )}
    </fieldset>
  );
}
export function RecipeFiltersBar({
  filters,
  setFilters,
  cookbooks,
  categories = [],
  recipes,
  count,
}: {
  filters: RecipeFilters;
  setFilters: (filters: RecipeFilters) => void;
  cookbooks: Cookbook[];
  categories?: Category[];
  recipes: Recipe[];
  count: number;
}) {
  const { t, language } = useI18n();
  const tags = [...new Set(recipes.flatMap((recipe) => recipe.tags))].sort(
    (a, b) => a.localeCompare(b, language),
  );
  return (
    <div className="recipe-filters">
      <label>
        {t("Kategorie")}
        <select
          value={filters.categoryId}
          onChange={(event) =>
            setFilters({ ...filters, categoryId: event.target.value })
          }
        >
          <option value="">{t("Alle Kategorien")}</option>
          <option value="unfiled">{t("Ohne Kategorie")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name} (
              {
                recipes.filter((recipe) =>
                  recipe.categoryIds.includes(category.id),
                ).length
              }
              )
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Kochbuch")}
        <select
          value={filters.cookbookId}
          onChange={(event) =>
            setFilters({ ...filters, cookbookId: event.target.value })
          }
        >
          <option value="">{t("Alle Kochbücher")}</option>
          <option value="unfiled">{t("Ohne Kochbuch")}</option>
          {cookbooks.map((book) => (
            <option key={book.id} value={book.id}>
              {book.name} (
              {
                recipes.filter((recipe) => recipe.cookbookIds.includes(book.id))
                  .length
              }
              )
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Schlagwort")}
        <select
          value={filters.tag}
          onChange={(event) =>
            setFilters({ ...filters, tag: event.target.value })
          }
        >
          <option value="">{t("Alle Schlagwörter")}</option>
          {tags.map((tag) => (
            <option key={tag}>{tag}</option>
          ))}
        </select>
      </label>
      <label>
        {t("Sortieren")}
        <select
          value={filters.sort}
          onChange={(event) =>
            setFilters({
              ...filters,
              sort: event.target.value as RecipeFilters["sort"],
            })
          }
        >
          {(
            [
              ["favorites", "Favoriten zuerst"],
              ["name", "Name"],
              ["newest", "Neueste zuerst"],
              ["updated", "Zuletzt geändert"],
              ["quickest", "Schnellste zuerst"],
            ] as const
          ).map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Zubereitungszeit")}
        <select
          aria-label={t("Maximale Zubereitungszeit")}
          value={filters.maxMinutes ?? ""}
          onChange={(event) =>
            setFilters({
              ...filters,
              maxMinutes: event.target.value
                ? Number(event.target.value)
                : null,
            })
          }
        >
          <option value="">{t("Beliebige Dauer")}</option>
          {[15, 30, 45, 60, 90].map((minutes) => (
            <option key={minutes} value={minutes}>
              {t("Bis {0} Min.", minutes)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Rezeptbilder")}
        <select
          value={filters.image}
          onChange={(event) =>
            setFilters({
              ...filters,
              image: event.target.value as RecipeFilters["image"],
            })
          }
        >
          <option value="any">{t("Mit und ohne Bild")}</option>
          <option value="with">{t("Nur mit Bild")}</option>
          <option value="without">{t("Nur ohne Bild")}</option>
        </select>
      </label>
      <label className="checkbox-filter">
        <input
          type="checkbox"
          checked={filters.favoritesOnly}
          onChange={(event) =>
            setFilters({ ...filters, favoritesOnly: event.target.checked })
          }
        />
        {t("Nur Favoriten")}
      </label>
      <span className="muted recipe-result-count" aria-live="polite">
        {t("{0} von {1} Rezepten", count, recipes.length)}
      </span>
      <button
        type="button"
        className="text-button"
        disabled={
          JSON.stringify(filters) ===
          JSON.stringify(recipeFilterSchema.parse({}))
        }
        onClick={() => setFilters(recipeFilterSchema.parse({}))}
      >
        {t("Filter zurücksetzen")}
      </button>
    </div>
  );
}
export function CookbookManager({
  cookbooks,
  recipes,
  onChanged,
}: {
  cookbooks: Cookbook[];
  recipes: Recipe[];
  onChanged: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Cookbook | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await action(editing ? "update_cookbook" : "create_cookbook", {
        ...(editing ? { id: editing.id } : {}),
        name: data.get("name"),
        description: data.get("description"),
      });
      setEditing(null);
      form.reset();
      await onChanged();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="cookbook-manager">
      <summary>
        <BookOpen size={17} />
        {t("Kochbücher verwalten")}{" "}
        <span className="muted">({cookbooks.length})</span>
      </summary>
      <p className="muted">
        {t(
          "Ein Rezept kann in mehreren Kochbüchern stehen. Zuordnen kannst du es beim Bearbeiten oder im Rezept.",
        )}
      </p>
      <ul>
        {cookbooks.map((book) => (
          <li key={book.id}>
            <div>
              <strong>{book.name}</strong>
              <span className="muted">
                {" "}
                ·{" "}
                {t(
                  "{0} Rezepte",
                  recipes.filter((recipe) =>
                    recipe.cookbookIds.includes(book.id),
                  ).length,
                )}
              </span>
              {book.description && <p>{book.description}</p>}
            </div>
            <div className="button-row">
              <button
                type="button"
                className="icon-button"
                aria-label={t("Kochbuch bearbeiten: {0}", book.name)}
                disabled={busy}
                onClick={() => {
                  setEditing(book);
                  setError("");
                }}
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                className="icon-button danger"
                aria-label={t("Kochbuch entfernen: {0}", book.name)}
                disabled={busy}
                onClick={async () => {
                  if (
                    !confirm(
                      t(
                        "Kochbuch „{0}“ entfernen? Alle Rezepte bleiben erhalten.",
                        book.name,
                      ),
                    )
                  )
                    return;
                  setBusy(true);
                  setError("");
                  try {
                    await action("delete_cookbook", { id: book.id });
                    if (editing?.id === book.id) setEditing(null);
                    await onChanged();
                  } catch (error) {
                    setError(message(error));
                  } finally {
                    setBusy(false);
                  }
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
        onSubmit={save}
        className="cookbook-form"
      >
        <h3>{t(editing ? "Kochbuch bearbeiten" : "Neues Kochbuch")}</h3>
        <label>
          {t("Name")}
          <input
            name="name"
            maxLength={160}
            required
            defaultValue={editing?.name ?? ""}
            disabled={busy}
          />
        </label>
        <label>
          {t("Beschreibung")}
          <textarea
            name="description"
            maxLength={2000}
            rows={2}
            defaultValue={editing?.description ?? ""}
            disabled={busy}
          />
        </label>
        <div className="button-row">
          <button className="secondary" disabled={busy}>
            {t(editing ? "Speichern" : "Kochbuch anlegen")}
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
export function RecipeCookbooks({
  recipe,
  cookbooks,
  onSaved,
}: {
  recipe: Recipe;
  cookbooks: Cookbook[];
  onSaved: Saved;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(recipe.cookbookIds),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const membership = recipe.cookbookIds.join(",");
  useEffect(() => {
    setSelected(recipe.cookbookIds);
  }, [membership]);
  return (
    <details className="recipe-collection">
      <summary>
        {t("Kochbücher")} ·{" "}
        {cookbooks
          .filter((book) => recipe.cookbookIds.includes(book.id))
          .map((book) => book.name)
          .join(", ") || t("Noch nicht zugeordnet")}
      </summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            onSaved(
              await action<Recipe>("set_recipe_cookbooks", {
                recipeId: recipe.id,
                cookbookIds: selected,
              }),
            );
          } catch (error) {
            setError(message(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <CookbookPicker
            cookbooks={cookbooks}
            selected={selected}
            onChange={setSelected}
          />
        </fieldset>
        <button className="secondary" disabled={busy || !cookbooks.length}>
          {t("Zuordnung speichern")}
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
export function RecipeGallery({
  recipe,
  onSaved,
}: {
  recipe: Recipe;
  onSaved: Saved;
}) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState(""),
    [editing, setEditing] = useState<"add" | "replace" | "metadata" | null>(
      null,
    ),
    [files, setFiles] = useState<File[]>([]),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const images = recipe.images;
  const cover = images.find(
    (image) => image.url.split("?v=")[1] === recipe.imageUrl?.split("?v=")[1],
  );
  const selected =
    images.find((image) => image.id === selectedId) ?? cover ?? images[0];
  useEffect(() => {
    if (!files[0]) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(files[0]);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);
  async function mutate(operation: string, input: object) {
    setBusy(true);
    setError("");
    try {
      onSaved(
        await action<Recipe>(operation, { recipeId: recipe.id, ...input }),
      );
      setEditing(null);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length) return;
    const description = String(
      new FormData(event.currentTarget).get("altText") ?? "",
    ).trim();
    setBusy(true);
    setError("");
    let completed = 0;
    try {
      for (const file of files) {
        const form = new FormData();
        form.set("image", file);
        form.set("altText", description || recipe.name);
        if (editing === "add") form.set("append", "true");
        const path =
          editing === "replace" && selected ? `images/${selected.id}` : "image";
        const response = await fetch(`/api/recipes/${recipe.id}/${path}`, {
          method: "POST",
          body: form,
          credentials: "same-origin",
        });
        const result = (await response.json()) as Recipe & { error?: string };
        if (!response.ok)
          throw new ApiError(
            result.error || t("Das Bild konnte nicht gespeichert werden."),
          );
        completed++;
        onSaved(result);
      }
      setEditing(null);
      setFiles([]);
    } catch (error) {
      setFiles(files.slice(completed));
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="recipe-image-editor" aria-label={t("Rezeptbilder")}>
      {(preview || selected) && (
        <img
          className="recipe-cover"
          src={preview || selected.url}
          alt={selected?.altText || recipe.name}
          width={560}
          height={350}
        />
      )}
      {images.length > 1 && (
        <div className="recipe-gallery" aria-label={t("Bild auswählen")}>
          {images.map((image, index) => (
            <button
              type="button"
              key={image.id}
              aria-pressed={selected?.id === image.id}
              aria-label={t("Bild {0} anzeigen", index + 1)}
              disabled={busy}
              onClick={() => {
                setSelectedId(image.id);
                setEditing(null);
                setFiles([]);
                setError("");
              }}
            >
              <img
                src={image.url}
                alt={image.altText || recipe.name}
                width={80}
                height={64}
                loading="lazy"
              />
              {image.id === cover?.id && <span>{t("Titelbild")}</span>}
            </button>
          ))}
        </div>
      )}
      {!editing && (
        <div className="image-actions">
          <button
            className="text-button"
            disabled={busy || images.length >= 20}
            onClick={() => {
              setEditing("add");
              setError("");
            }}
          >
            <ImagePlus size={17} />
            {t("Bilder hinzufügen")}
          </button>
          {selected && (
            <>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setEditing("replace")}
              >
                {t("Bild ersetzen")}
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setEditing("metadata")}
              >
                {t("Bildbeschreibung")}
              </button>
              {selected.id !== cover?.id && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void mutate("update_recipe_image", {
                      imageId: selected.id,
                      makeCover: true,
                    })
                  }
                >
                  {t("Als Titelbild")}
                </button>
              )}
              <button
                className="text-button danger"
                disabled={busy}
                onClick={() => {
                  if (confirm(t("Dieses Rezeptbild entfernen?")))
                    void mutate("delete_recipe_image", {
                      imageId: selected.id,
                    });
                }}
              >
                <Trash2 size={15} />
                {t("Bild entfernen")}
              </button>
            </>
          )}
        </div>
      )}
      {editing && (
        <form
          key={`${editing}-${selected?.id ?? "new"}`}
          onSubmit={
            editing === "metadata"
              ? (event) => {
                  event.preventDefault();
                  void mutate("update_recipe_image", {
                    imageId: selected!.id,
                    altText: new FormData(event.currentTarget).get("altText"),
                  });
                }
              : upload
          }
        >
          {editing !== "metadata" && (
            <label>
              {t("Rezeptbilder (JPG, PNG oder WebP, je bis 5 MB)")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple={editing === "add"}
                required
                disabled={busy}
                onChange={(event) => {
                  const chosen = Array.from(event.target.files ?? []);
                  setError("");
                  if (chosen.some((file) => file.size > 5 * 1024 * 1024)) {
                    setError(t("Bilder dürfen höchstens 5 MB groß sein."));
                    event.target.value = "";
                    setFiles([]);
                  } else if (
                    editing === "add" &&
                    chosen.length + images.length > 20
                  ) {
                    setError(t("Ein Rezept kann höchstens 20 Bilder haben."));
                    event.target.value = "";
                    setFiles([]);
                  } else setFiles(chosen);
                }}
              />
            </label>
          )}
          <label>
            {t("Bildbeschreibung")}
            <input
              name="altText"
              maxLength={500}
              defaultValue={
                editing === "add"
                  ? recipe.name
                  : selected?.altText || recipe.name
              }
              disabled={busy}
            />
          </label>
          <div className="button-row">
            <button
              className="secondary"
              disabled={busy || (editing !== "metadata" && !files.length)}
            >
              {busy ? t("Wird gespeichert…") : t("Speichern")}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setFiles([]);
                setError("");
              }}
            >
              {t("Abbrechen")}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
    </section>
  );
}
export function RecipeComments({
  recipe,
  user,
  onSaved,
}: {
  recipe: Recipe;
  user: User;
  onSaved: Saved;
}) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<RecipeComment | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(
    event: React.FormEvent<HTMLFormElement>,
    comment?: RecipeComment,
  ) {
    event.preventDefault();
    const form = event.currentTarget,
      body = new FormData(form).get("body");
    setBusy(true);
    setError("");
    try {
      onSaved(
        await action<Recipe>(
          comment ? "update_recipe_comment" : "add_recipe_comment",
          {
            recipeId: recipe.id,
            ...(comment ? { commentId: comment.id } : {}),
            body,
          },
        ),
      );
      setEditing(null);
      form.reset();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  const input = (comment?: RecipeComment) => (
    <form onSubmit={(event) => void save(event, comment)}>
      <label>
        {t(comment ? "Tipp bearbeiten" : "Dein Kochtipp")}
        <textarea
          name="body"
          rows={3}
          maxLength={3000}
          required
          defaultValue={comment?.body ?? ""}
          disabled={busy}
          placeholder={t("Was hat beim Kochen gut funktioniert?")}
        />
      </label>
      <div className="button-row">
        <button className="secondary" disabled={busy}>
          {t(comment ? "Speichern" : "Tipp hinzufügen")}
        </button>
        {comment && (
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
  );
  return (
    <section className="recipe-comments">
      <h3>
        {t("Tipps & Kommentare")}{" "}
        <span className="muted">({recipe.comments.length})</span>
      </h3>
      {!recipe.comments.length && (
        <p className="muted">
          {t(
            "Noch keine Tipps. Halte hier deine Erfahrungen und die Hinweise deines Agenten fest.",
          )}
        </p>
      )}
      <ol>
        {recipe.comments.map((comment) => (
          <li key={comment.id}>
            <div className="comment-author">
              <strong>
                {comment.authorName}
                {comment.agent ? ` · ${t("Agent")}` : ""}
              </strong>
              <time dateTime={comment.createdAt}>
                {new Date(comment.createdAt).toLocaleDateString(locale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                {comment.updatedAt !== comment.createdAt
                  ? ` · ${t("bearbeitet")}`
                  : ""}
              </time>
            </div>
            {editing?.id === comment.id ? (
              input(comment)
            ) : (
              <>
                <p className="comment-body">{comment.body}</p>
                {(comment.authorId === user.id || user.role === "owner") && (
                  <div className="button-row">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => setEditing(comment)}
                    >
                      {t("Bearbeiten")}
                    </button>
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={async () => {
                        if (!confirm(t("Diesen Kommentar entfernen?"))) return;
                        setBusy(true);
                        setError("");
                        try {
                          onSaved(
                            await action<Recipe>("delete_recipe_comment", {
                              recipeId: recipe.id,
                              commentId: comment.id,
                            }),
                          );
                        } catch (error) {
                          setError(message(error));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {t("Entfernen")}
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
      {!editing && input()}
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
    </section>
  );
}
