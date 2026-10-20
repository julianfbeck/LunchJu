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
import type { Recipe } from "../shared";
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
  const inputId = useId();
  const count = personCount(value);
  return (
    <div className="servings-control">
      <label htmlFor={inputId}>
        <Users size={15} /> Personen
      </label>
      <div className="servings-stepper">
        <button
          type="button"
          aria-label="Eine Person weniger"
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
          aria-label="Eine Person mehr"
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
  busy,
  onOpen,
  onPlan,
  onEdit,
  onFavorite,
}: {
  recipes: Recipe[];
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
  busy,
  onOpen,
  onPlan,
  onEdit,
  onFavorite,
}: {
  recipe: Recipe;
  busy: boolean;
  onOpen: (recipe: Recipe, servings: number) => void;
  onPlan: (recipe: Recipe, servings: number) => void;
  onEdit: (recipe: Recipe) => void;
  onFavorite: (recipe: Recipe) => void;
}) {
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
        aria-label={`Rezept öffnen: ${recipe.name}`}
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
            <span>Kein Bild</span>
          </span>
        )}
      </button>
      <button
        className={`favorite ${recipe.favorite ? "is-favorite" : ""}`}
        disabled={busy}
        aria-label={
          recipe.favorite ? "Favorit entfernen" : "Als Favorit markieren"
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
        <p>{recipe.description}</p>
        <div className="recipe-meta">
          <span>
            <Clock size={14} />
            {formatNumber(recipe.minutes)} Min.
          </span>
          <span>Grundrezept: {formatNumber(recipe.servings)} Portionen</span>
          <button
            className="icon-button"
            aria-label={`Bearbeiten: ${recipe.name}`}
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
          <CalendarDays size={16} /> Planen
        </button>
      </div>
      <div
        className="recipe-ingredients-preview"
        aria-live="polite"
        aria-atomic="true"
      >
        {servings === null ? (
          <p>Wähle eine Personenzahl zwischen 0,1 und 100.</p>
        ) : (
          <>
            <p>
              {ingredients
                .slice(0, 3)
                .map(
                  (item) =>
                    `${formatQuantity(item.quantity, item.unit)} ${item.name}`,
                )
                .join(" · ")}
              {ingredients.length > 3 ? " · …" : ""}
            </p>
            <button className="text-button" onClick={open}>
              Alle Zutaten für {formatNumber(servings)} Personen
            </button>
          </>
        )}
      </div>
    </article>
  );
}
