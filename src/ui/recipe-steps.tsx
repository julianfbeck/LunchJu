import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Trash2,
} from "lucide-react";
import type { RecipeStep } from "../shared";
import { useI18n } from "./language";
import { formatNumber } from "../locale";

export const emptyStep = (): RecipeStep => ({
  title: "",
  description: "",
  durationMinutes: null,
});
export function RecipeStepsEditor({
  steps,
  onChange,
}: {
  steps: RecipeStep[];
  onChange: (steps: RecipeStep[]) => void;
}) {
  const { t } = useI18n();
  function patch(index: number, value: Partial<RecipeStep>) {
    onChange(
      steps.map((step, i) => (i === index ? { ...step, ...value } : step)),
    );
  }
  function move(index: number, direction: number) {
    const next = [...steps];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    onChange(next);
  }
  return (
    <fieldset className="step-editor">
      <legend>{t("Schritt für Schritt")}</legend>
      <p className="muted">
        {t(
          "Eine Tätigkeit pro Schritt. Beschreibe jeweils genau, was zu tun ist.",
        )}
      </p>
      {steps.map((step, index) => (
        <div className="step-editor-card" key={index}>
          <div className="step-card-heading">
            <span className="step-number">{index + 1}</span>
            <strong>{t("Schritt {0}", index + 1)}</strong>
            <div className="step-reorder">
              <button
                type="button"
                className="icon-button"
                aria-label={t("Schritt {0} nach oben", index + 1)}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={t("Schritt {0} nach unten", index + 1)}
                disabled={index === steps.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                className="icon-button danger"
                aria-label={t("Schritt {0} entfernen", index + 1)}
                disabled={steps.length === 1}
                onClick={() => onChange(steps.filter((_, i) => i !== index))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          <label>
            {t("Titel (optional)")}
            <input
              maxLength={160}
              value={step.title}
              onChange={(event) => patch(index, { title: event.target.value })}
              placeholder={t("z. B. Gemüse vorbereiten")}
            />
          </label>
          <label>
            {t("Beschreibung für Schritt {0}", index + 1)}
            <textarea
              required
              rows={3}
              maxLength={3000}
              value={step.description}
              onChange={(event) =>
                patch(index, { description: event.target.value })
              }
              placeholder={t("Was genau soll in diesem Schritt passieren?")}
            />
          </label>
          <label className="step-duration-input">
            {t("Dauer in Minuten (optional)")}
            <input
              type="number"
              min={1}
              max={2880}
              step={1}
              value={step.durationMinutes ?? ""}
              onChange={(event) =>
                patch(index, {
                  durationMinutes: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={steps.length >= 60}
        onClick={() => onChange([...steps, emptyStep()])}
      >
        <Plus size={16} />
        {t("Schritt hinzufügen")}
      </button>
    </fieldset>
  );
}
export function RecipeInstructions({ steps }: { steps: RecipeStep[] }) {
  const { t, language } = useI18n();
  const [focused, setFocused] = useState(false),
    [active, setActive] = useState(0),
    [done, setDone] = useState<number[]>([]);
  const current = Math.min(active, Math.max(0, steps.length - 1));
  function toggle(index: number) {
    setDone((value) =>
      value.includes(index)
        ? value.filter((i) => i !== index)
        : [...value, index],
    );
  }
  return (
    <section
      className="recipe-instructions"
      aria-label={t("Schritt für Schritt")}
    >
      <div className="instructions-heading">
        <h3>{t("Zubereitung")}</h3>
        <button
          type="button"
          className="text-button"
          aria-pressed={focused}
          onClick={() => setFocused(!focused)}
        >
          {t(focused ? "Alle Schritte" : "Kochmodus")}
        </button>
      </div>
      <div className="step-progress">
        <span aria-live="polite">
          {t("{0} von {1} Schritten erledigt", done.length, steps.length)}
        </span>
        {!!done.length && (
          <button
            type="button"
            className="text-button"
            onClick={() => setDone([])}
          >
            {t("Zurücksetzen")}
          </button>
        )}
        <progress
          aria-label={t("Kochfortschritt")}
          value={done.length}
          max={Math.max(1, steps.length)}
        />
      </div>
      <ol className={`instruction-cards ${focused ? "is-focused" : ""}`}>
        {steps.map((step, index) => (
          <li
            key={index}
            hidden={focused && current !== index}
            className={done.includes(index) ? "is-done" : ""}
          >
            <div className="step-card-heading">
              <span className="step-number" aria-hidden="true">
                {index + 1}
              </span>
              <h4>{step.title || t("Schritt {0}", index + 1)}</h4>
              {step.durationMinutes !== null && (
                <span className="step-duration">
                  <Clock size={14} />
                  {formatNumber(step.durationMinutes, language)} {t("Min.")}
                </span>
              )}
            </div>
            <p className="instruction-description">{step.description}</p>
            <button
              type="button"
              className="text-button step-complete"
              aria-pressed={done.includes(index)}
              aria-label={t("Schritt {0} erledigt", index + 1)}
              onClick={() => toggle(index)}
            >
              <Check size={16} />
              {t(done.includes(index) ? "Erledigt" : "Als erledigt markieren")}
            </button>
          </li>
        ))}
      </ol>
      {focused && (
        <div className="step-navigation">
          <button
            type="button"
            className="secondary"
            disabled={current === 0}
            onClick={() => setActive(current - 1)}
          >
            <ChevronLeft size={16} />
            {t("Zurück")}
          </button>
          <span>{t("Schritt {0} von {1}", current + 1, steps.length)}</span>
          <button
            type="button"
            className="secondary"
            disabled={current >= steps.length - 1}
            onClick={() => setActive(current + 1)}
          >
            {t("Weiter")}
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
