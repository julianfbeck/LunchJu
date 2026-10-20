import { useI18n } from "./language";
import { useId, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Clock,
  Heart,
  Minus,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import type { Recipe, Cookbook, Category } from "../shared";
import { scaleIngredients } from "../scaling";
import { formatNumber, formatQuantity } from "../locale";
export function personCount(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0.1 && number <= 100
    ? number
    : null;
}
export function ServingsControl({
  value,
  onChange,
  baseServings,
}: {
  value: string;
  onChange: (value: string) => void;
  baseServings: number;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const count = personCount(value);
  return (
    <div className="servings-control">
      <label htmlFor={inputId}>
        <Users size={15} />
        {t(" Personen")}
      </label>
      <div className="servings-stepper">
        <button
          type="button"
          aria-label={t("Eine Person weniger")}
          disabled={count !== null && count <= 0.1}
          onClick={() =>
            onChange(String(Math.max(0.1, (count ?? baseServings) - 1)))
          }
        >
          <Minus size={15} />
        </button>
        <input
          id={inputId}
          type="number"
          min="0.1"
          max="100"
          step="any"
          inputMode="decimal"
          value={value}
          aria-invalid={count === null}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            if (count === null) onChange(String(baseServings));
          }}
        />
        <button
          type="button"
          aria-label={t("Eine Person mehr")}
          disabled={count !== null && count >= 100}
          onClick={() =>
            onChange(String(Math.min(100, (count ?? baseServings) + 1)))
          }
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
export function RecipeList({
  recipes,
  cookbooks = [],
  categories = [],
  busy,
  onOpen,
  onPlan,
  onEdit,
  onFavorite,
}: {
  recipes: Recipe[];
  cookbooks?: Cookbook[];
  categories?: Category[];
  busy: boolean;
  onOpen: (recipe: Recipe, servings: number) => void;
  onPlan: (recipe: Recipe, servings: number) => void;
  onEdit: (recipe: Recipe) => void;
  onFavorite: (recipe: Recipe) => void;
}) {
  return (
    <div className="recipe-list">
      {recipes.map((recipe) => (
        <RecipeRow
          key={recipe.id}
          recipe={recipe}
          cookbooks={cookbooks}
          categories={categories}
          busy={busy}
          onOpen={onOpen}
          onPlan={onPlan}
          onEdit={onEdit}
          onFavorite={onFavorite}
        />
      ))}
    </div>
  );
}
function RecipeRow({
  recipe,
  cookbooks,
  categories,
  busy,
  onOpen,
  onPlan,
  onEdit,
  onFavorite,
}: {
  recipe: Recipe;
  cookbooks: Cookbook[];
  categories: Category[];
  busy: boolean;
  onOpen: (recipe: Recipe, servings: number) => void;
  onPlan: (recipe: Recipe, servings: number) => void;
  onEdit: (recipe: Recipe) => void;
  onFavorite: (recipe: Recipe) => void;
}) {
  const { t, language } = useI18n();
  const [people, setPeople] = useState(String(recipe.servings));
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const servings = personCount(people);
  const ingredients =
    servings === null ? [] : scaleIngredients(recipe, servings);
  const open = () => onOpen(recipe, servings ?? recipe.servings);
  return (
    <article className="recipe-row">
      <button
        className="recipe-thumbnail"
        onClick={open}
        aria-label={t("Rezept öffnen: {0}", recipe.name)}
      >
        {recipe.imageUrl && failedImage !== recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt={recipe.imageAlt || recipe.name}
            width={128}
            height={128}
            loading="lazy"
            onError={() => setFailedImage(recipe.imageUrl)}
          />
        ) : (
          <span className="recipe-no-image">
            <BookOpen size={26} />
            <span>{t("Kein Bild")}</span>
          </span>
        )}
      </button>
      <button
        className={`favorite ${recipe.favorite ? "is-favorite" : ""}`}
        disabled={busy}
        aria-label={
          recipe.favorite ? t("Favorit entfernen") : t("Als Favorit markieren")
        }
        aria-pressed={recipe.favorite}
        onClick={() => onFavorite(recipe)}
      >
        <Heart size={18} fill={recipe.favorite ? "currentColor" : "none"} />
      </button>
      <div className="recipe-summary">
        <div className="tag-row">
          {recipe.tags.slice(0, 2).map((tag) => (
            <span className="pill" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <button className="recipe-title" onClick={open}>
          {recipe.name}
        </button>
        {recipe.cookbookIds.length > 0 && (
          <p className="recipe-book-names">
            {cookbooks
              .filter((book) => recipe.cookbookIds.includes(book.id))
              .map((book) => book.name)
              .join(" · ")}
          </p>
        )}
        {!!recipe.categoryIds?.length && (
          <p className="recipe-book-names recipe-category-names">
            {categories
              .filter((category) => recipe.categoryIds.includes(category.id))
              .map((category) => category.name)
              .join(" · ")}
          </p>
        )}
        <p>{recipe.description}</p>
        <div className="recipe-meta">
          <span>
            <Clock size={14} />
            {formatNumber(recipe.minutes, language)}
            {t(" Min.")}
          </span>
          <span>
            {t("Grundrezept: ")}
            {formatNumber(recipe.servings, language)}
            {t(" Portionen")}
          </span>
          {(recipe.images.length > 1 || recipe.comments.length > 0) && (
            <span>
              {[
                recipe.images.length > 1
                  ? t("{0} Bilder", recipe.images.length)
                  : "",
                recipe.comments.length
                  ? t("{0} Tipps", recipe.comments.length)
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          <button
            className="icon-button"
            aria-label={t("Bearbeiten: {0}", recipe.name)}
            onClick={() => onEdit(recipe)}
          >
            <Pencil size={15} />
          </button>
        </div>
      </div>
      <div className="recipe-scaling">
        <ServingsControl
          value={people}
          onChange={setPeople}
          baseServings={recipe.servings}
        />
        <button
          className="text-button"
          disabled={servings === null}
          onClick={() => onPlan(recipe, servings!)}
        >
          <CalendarDays size={16} />
          {t(" Planen")}
        </button>
      </div>
      <div
        className="recipe-ingredients-preview"
        aria-live="polite"
        aria-atomic="true"
      >
        {servings === null ? (
          <p>{t("Wähle eine Personenzahl zwischen 0,1 und 100.")}</p>
        ) : (
          <>
            <p>
              {ingredients
                .slice(0, 3)
                .map(
                  (item) =>
                    `${formatQuantity(item.quantity, item.unit, language)} ${item.name}`,
                )
                .join(" · ")}
              {ingredients.length > 3 ? " · …" : ""}
            </p>
            <button className="text-button" onClick={open}>
              {t(
                "Alle Zutaten für {0} Personen",
                formatNumber(servings, language),
              )}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
