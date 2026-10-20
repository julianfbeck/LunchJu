import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Clipboard,
  FileText,
  ImagePlus,
  Link,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { Recipe } from "../shared";
import type { RecipeSource } from "../recipe-sources";
import { action, ApiError } from "./api";
import { useI18n } from "./language";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
const kinds = {
  video: "Videolink",
  text: "Text / Zusatzinfo",
  image: "Bild",
} as const;
const states = {
  pending: "Offen",
  needs_info: "Angaben fehlen",
  done: "Erledigt",
} as const;
const platforms = {
  instagram: "Instagram Reels",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
};
export function sourcePrompt(source: RecipeSource, language: "de" | "en") {
  return language === "de"
    ? `Lies in LunchJu mit get_recipe_source die Quelle ${source.id}${source.url ? ` (${source.url})` : ""}. ${source.recipeId ? "Ergänze das zugeordnete Rezept mit den Zusatzinformationen." : "Erstelle daraus ein Rezept."} Werte Videolinks mit deinen eigenen Browser-/Video-/Transkriptwerkzeugen aus; lies ein vorhandenes Quellenbild mit get_recipe_source_image. Berücksichtige meine Hinweise und die contentLanguage. Erfinde keine fehlenden Zutaten oder Mengen; setze die Quelle bei Unklarheiten auf needs_info. Speichere die Zubereitung als einzelne steps mit Titel und Beschreibung. Markiere die Quelle erst nach dem Speichern des Rezepts als done und ordne dessen recipeId zu.`
    : `Read LunchJu source ${source.id}${source.url ? ` (${source.url})` : ""} with get_recipe_source. ${source.recipeId ? "Use the additional information to update the linked recipe." : "Create a recipe from it."} Read video links with your own browser/video/transcript tools and any attached image with get_recipe_source_image. Follow my notes and contentLanguage. Do not invent missing ingredients or quantities; mark unclear sources needs_info. Write preparation as individual steps with titles and descriptions. Mark the source done and assign its recipeId only after saving the recipe.`;
}
export function RecipeSources({
  sources,
  recipes,
  onChanged,
  onOpen,
}: {
  sources: RecipeSource[];
  recipes: Recipe[];
  onChanged: () => Promise<unknown>;
  onOpen: (recipe: Recipe) => void;
}) {
  const { t, language } = useI18n();
  const [formOpen, setFormOpen] = useState(false),
    [editing, setEditing] = useState<RecipeSource | null>(null),
    [kind, setKind] = useState<RecipeSource["kind"]>("video"),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("open"),
    [notice, setNotice] = useState("");
  const draftId = useRef<string | null>(null);
  const pending = sources.filter((source) => source.status !== "done").length;
  function close() {
    setFormOpen(false);
    setEditing(null);
    setFile(null);
    draftId.current = null;
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (kind === "image" && !file && !editing?.imageUrl)
        throw new Error(t("Wähle ein Bild als Quelle."));
      const source = await action<RecipeSource>(
        editing || draftId.current
          ? "update_recipe_source"
          : "add_recipe_source",
        {
          ...(editing || draftId.current
            ? { id: editing?.id ?? draftId.current }
            : {}),
          kind,
          title: form.get("title"),
          url: kind === "video" ? form.get("url") : "",
          notes: form.get("notes"),
          recipeId: form.get("recipeId") || null,
        },
      );
      draftId.current = source.id;
      if (file) {
        const upload = new FormData();
        upload.set("image", file);
        upload.set("altText", String(form.get("altText") ?? ""));
        const response = await fetch(`/api/recipe-sources/${source.id}/image`, {
          method: "POST",
          credentials: "same-origin",
          body: upload,
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok)
          throw new ApiError(
            result.error || t("Das Bild konnte nicht gespeichert werden."),
          );
      }
      await onChanged();
      close();
      setNotice(
        t("Quelle gespeichert. Dein verbundener Agent kann sie jetzt lesen."),
      );
    } catch (error) {
      setError(errorMessage(error));
      await onChanged();
    } finally {
      setBusy(false);
    }
  }
  async function mutate(operation: string, input: object) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action(operation, input);
      await onChanged();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="source-inbox">
      <summary>
        <Link size={17} />
        <span>{t("Quellen für den Agenten")}</span>
        <span className="source-count">{t("{0} offen", pending)}</span>
      </summary>
      <p className="muted">
        {t(
          "Reel, TikTok, Short, Text oder Bild ablegen. Dein verbundener Agent liest die Quelle und erstellt oder ergänzt das Rezept. Die Website analysiert keine Videos.",
        )}
      </p>
      {!formOpen && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            setKind("video");
            setEditing(null);
            setFormOpen(true);
            setError("");
          }}
        >
          <Plus size={16} />
          {t("Quelle hinzufügen")}
        </button>
      )}
      {formOpen && (
        <form
          key={editing?.id ?? "new"}
          className="source-form"
          onSubmit={save}
        >
          <div className="source-form-heading">
            <h3>{t(editing ? "Quelle bearbeiten" : "Neue Quelle")}</h3>
            <button
              type="button"
              className="icon-button"
              disabled={busy}
              aria-label={t("Abbrechen")}
              onClick={close}
            >
              <X size={18} />
            </button>
          </div>
          <div
            className="source-kind"
            role="group"
            aria-label={t("Art der Quelle")}
          >
            {(
              [
                ["video", Link],
                ["text", FileText],
                ["image", ImagePlus],
              ] as const
            ).map(([value, Icon]) => (
              <button
                type="button"
                className="secondary"
                key={value}
                aria-pressed={kind === value}
                disabled={busy}
                onClick={() => {
                  setKind(value);
                  setFile(null);
                }}
              >
                <Icon size={16} />
                {t(kinds[value])}
              </button>
            ))}
          </div>
          <label>
            {t("Titel (optional)")}
            <input
              name="title"
              maxLength={160}
              disabled={busy}
              defaultValue={editing?.title ?? ""}
            />
          </label>
          {kind === "video" && (
            <label>
              {t("Instagram Reel, TikTok oder YouTube Short")}
              <input
                name="url"
                type="url"
                required
                maxLength={2000}
                disabled={busy}
                defaultValue={editing?.url ?? ""}
                placeholder="https://…"
              />
            </label>
          )}
          {(kind === "image" || editing?.imageUrl) && (
            <>
              <label>
                {t("Quellenbild (JPG, PNG oder WebP, bis 5 MB)")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  required={
                    kind === "image" && !editing?.imageUrl && !draftId.current
                  }
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    setError("");
                    if (selected && selected.size > 5 * 1024 * 1024) {
                      setError(t("Bilder dürfen höchstens 5 MB groß sein."));
                      event.target.value = "";
                      setFile(null);
                    } else setFile(selected ?? null);
                  }}
                />
              </label>
              <label>
                {t("Bildbeschreibung")}
                <input
                  name="altText"
                  maxLength={500}
                  disabled={busy}
                  defaultValue={editing?.imageAlt ?? ""}
                />
              </label>
            </>
          )}
          <label>
            {t(
              kind === "text"
                ? "Text oder zusätzliche Informationen"
                : "Zusätzliche Hinweise (optional)",
            )}
            <textarea
              name="notes"
              rows={4}
              maxLength={6000}
              required={kind === "text"}
              disabled={busy}
              defaultValue={editing?.notes ?? ""}
              placeholder={t(
                "z. B. Zutaten aus der Bildunterschrift, eigene Änderungen oder unlesbare Stellen",
              )}
            />
          </label>
          <label>
            {t("Verwenden für")}
            <select
              name="recipeId"
              disabled={busy}
              defaultValue={editing?.recipeId ?? ""}
            >
              <option value="">{t("Neues Rezept erstellen")}</option>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {t("Ergänzen: {0}", recipe.name)}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            {t(
              "Das Speichern startet keine automatische Verarbeitung. Bitte deinen MCP-Agenten, offene Quellen zu bearbeiten.",
            )}
          </p>
          <div className="button-row">
            <button className="primary" disabled={busy}>
              {busy ? t("Wird gespeichert…") : t("Quelle speichern")}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={close}
            >
              {t("Abbrechen")}
            </button>
          </div>
        </form>
      )}
      <div className="source-list-heading">
        <h3>{t("Gespeicherte Quellen")}</h3>
        <label className="sr-only" htmlFor="source-filter">
          {t("Quellen filtern")}
        </label>
        <select
          id="source-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="open">{t("Offene Quellen")}</option>
          <option value="all">{t("Alle Quellen")}</option>
          <option value="done">{t("Erledigt")}</option>
        </select>
      </div>
      <ul className="source-list">
        {sources
          .filter(
            (source) =>
              filter === "all" ||
              (filter === "open"
                ? source.status !== "done"
                : source.status === "done"),
          )
          .map((source) => {
            const target = recipes.find(
              (recipe) => recipe.id === source.recipeId,
            );
            return (
              <li key={source.id}>
                <div className="source-item-heading">
                  <strong>
                    {source.title ||
                      (source.platform
                        ? platforms[source.platform]
                        : t(kinds[source.kind]))}
                  </strong>
                  <span
                    className={`source-status source-status-${source.status}`}
                  >
                    {t(source.ready ? states[source.status] : "Bild fehlt")}
                  </span>
                </div>
                {source.url && (
                  <a
                    className="source-link"
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.platform ? platforms[source.platform] : source.url}
                    <ArrowUpRight size={14} />
                  </a>
                )}
                {source.imageUrl && (
                  <a
                    href={source.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("Quellenbild öffnen")}
                  >
                    <img
                      className="source-image"
                      src={source.imageUrl}
                      alt={source.imageAlt || t("Quellenbild")}
                      width={180}
                      height={140}
                      loading="lazy"
                    />
                  </a>
                )}
                {source.notes && <p className="source-notes">{source.notes}</p>}
                {target && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onOpen(target)}
                  >
                    {t("Zum Rezept: {0}", target.name)}
                  </button>
                )}
                {source.resolution && (
                  <p className="source-resolution">{source.resolution}</p>
                )}
                <div className="button-row">
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || !source.ready}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          sourcePrompt(source, language),
                        );
                        setNotice(
                          t(
                            "Auftrag kopiert. Füge ihn bei deinem verbundenen Agenten ein.",
                          ),
                        );
                      } catch {
                        setError(t("Kopieren ist fehlgeschlagen."));
                      }
                    }}
                  >
                    <Clipboard size={15} />
                    {t("Agentenauftrag kopieren")}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    aria-label={t(
                      "Quelle bearbeiten: {0}",
                      source.title || t(kinds[source.kind]),
                    )}
                    onClick={() => {
                      setEditing(source);
                      setKind(source.kind);
                      setFile(null);
                      draftId.current = null;
                      setFormOpen(true);
                      setError("");
                    }}
                  >
                    <Pencil size={15} />
                    {t("Bearbeiten")}
                  </button>
                  <button
                    type="button"
                    className="text-button danger"
                    disabled={busy}
                    aria-label={t(
                      "Quelle entfernen: {0}",
                      source.title || t(kinds[source.kind]),
                    )}
                    onClick={() => {
                      if (
                        confirm(
                          t(
                            "Diese Quelle und ihr Bild entfernen? Das Rezept bleibt erhalten.",
                          ),
                        )
                      )
                        void mutate("delete_recipe_source", { id: source.id });
                    }}
                  >
                    <Trash2 size={15} />
                    {t("Entfernen")}
                  </button>
                  {source.imageUrl && (
                    <button
                      type="button"
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(t("Nur das Quellenbild entfernen?")))
                          void mutate("delete_recipe_source_image", {
                            sourceId: source.id,
                          });
                      }}
                    >
                      {t("Bild entfernen")}
                    </button>
                  )}
                </div>
                <form
                  key={source.updatedAt}
                  className="source-status-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void mutate("set_recipe_source_status", {
                      id: source.id,
                      status: form.get("status"),
                      resolution: form.get("resolution"),
                      recipeId: form.get("recipeId") || null,
                    });
                  }}
                >
                  <details>
                    <summary>{t("Status ändern")}</summary>
                    <label>
                      {t("Status")}
                      <select
                        name="status"
                        defaultValue={source.status}
                        disabled={busy}
                      >
                        {Object.entries(states).map(([value, label]) => (
                          <option key={value} value={value}>
                            {t(label)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("Rezept zuordnen")}
                      <select
                        name="recipeId"
                        defaultValue={source.recipeId ?? ""}
                        disabled={busy}
                      >
                        <option value="">{t("Kein Rezept zugeordnet")}</option>
                        {recipes.map((recipe) => (
                          <option key={recipe.id} value={recipe.id}>
                            {recipe.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("Ergebnis oder fehlende Angaben")}
                      <textarea
                        name="resolution"
                        maxLength={3000}
                        rows={2}
                        defaultValue={source.resolution}
                        disabled={busy}
                      />
                    </label>
                    <button className="secondary" disabled={busy}>
                      <Check size={15} />
                      {t("Status speichern")}
                    </button>
                  </details>
                </form>
              </li>
            );
          })}
      </ul>
      {!sources.length && (
        <p className="muted">
          {t(
            "Noch keine Quellen. Lege den ersten Link, Text oder ein Bild für deinen Agenten ab.",
          )}
        </p>
      )}
      {notice && (
        <p className="source-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
