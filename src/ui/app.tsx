import { useI18n, LanguageSelector } from "./language";
import { InstallApp } from "./pwa";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import {
  CalendarDays,
  BookOpen,
  PackageOpen,
  ShoppingBasket,
  Settings2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Check,
  Clock,
  Users,
  KeyRound,
  Bot,
  Trash2,
  Pencil,
  RefreshCw,
  LogOut,
  ArrowUpRight,
  Copy,
  Leaf,
  Utensils,
} from "lucide-react";
import { scaleIngredients } from "../scaling";
import { RecipeList, ServingsControl, personCount } from "./recipe-list";
import { filterRecipes, recipeFilterSchema } from "../recipes";
import {
  CookbookManager,
  CookbookPicker,
  RecipeFiltersBar,
  RecipeGallery,
  RecipeCookbooks,
  RecipeComments,
} from "./recipe-extras";
import type {
  Catalog,
  Recipe,
  PantryItem,
  Meal,
  Grocery,
  Ingredient,
  User,
} from "../shared";
import {
  action,
  request,
  today,
  addDays,
  formatDate,
  passkeyError,
  ApiError,
} from "./api";
import {
  unitLabels,
  locationLabels,
  mealSlotLabels,
  formatNumber,
} from "../locale";
type Data = Catalog & {
  preferences: {
    diet: string;
    allergies: string[];
    notes: string;
  };
};
type Tab = "today" | "recipes" | "pantry" | "groceries" | "settings";
type Editor = {
  type: "recipe" | "pantry" | "meal" | "grocery";
  value?: Recipe | PantryItem | Meal | Grocery;
  recipe?: Recipe;
  servings?: number;
};
const tabs = [
  {
    id: "today",
    name: "Wochenplan",
    icon: CalendarDays,
  },
  {
    id: "recipes",
    name: "Rezepte",
    icon: BookOpen,
  },
  {
    id: "pantry",
    name: "Vorräte",
    icon: PackageOpen,
  },
  {
    id: "groceries",
    name: "Einkaufsliste",
    icon: ShoppingBasket,
  },
  {
    id: "settings",
    name: "Einstellungen",
    icon: Settings2,
  },
] as const;
const units = ["g", "kg", "ml", "l", "piece", "tsp", "tbsp", "cup"];
export function KitchenApp() {
  const { t, bindAccount } = useI18n();
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () =>
      request<{
        user: User | null;
        setup: boolean;
        homeName: string;
      }>("/api/auth/session"),
  });
  const [tab, setTab] = useState<Tab>("today"),
    [notice, setNotice] = useState("");
  const user = session.data?.user;
  useEffect(() => {
    if (user !== undefined) bindAccount(user);
  }, [user?.id, user?.language, !!session.data, bindAccount]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 6500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  if (session.isPending)
    return (
      <div className="loading-screen">
        <Brand />
        <LanguageSelector />
        <p>{t("Wird geladen…")}</p>
      </div>
    );
  if (session.error)
    return (
      <div className="auth-page">
        <Brand />
        <LanguageSelector />
        <h1>{t("LunchJu konnte nicht geladen werden")}</h1>
        <p className="error">{session.error.message}</p>
        <p>{t("Bitte versuche es gleich noch einmal.")}</p>
        <button onClick={() => session.refetch()}>
          {t("Erneut versuchen")}
        </button>
      </div>
    );
  if (!session.data.user)
    return (
      <AuthScreen
        setup={session.data.setup}
        homeName={session.data.homeName}
        onLogin={async () => {
          await client.invalidateQueries({
            queryKey: ["session"],
          });
          const next = new URLSearchParams(location.search).get("next");
          if (next?.startsWith("/oauth/") && !next.startsWith("//"))
            location.assign(next);
        }}
      />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="home-label">{session.data.homeName}</div>
        <nav aria-label={t("Hauptnavigation")}>
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "nav-item active" : "nav-item"}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={20} />
              {t(item.name)}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <LanguageSelector />
          <button className="agent-link" onClick={() => setTab("settings")}>
            <Bot size={18} />
            {t(" Agentenzugang ")}
            <ArrowUpRight size={15} />
          </button>
          <button className="profile" onClick={() => setTab("settings")}>
            <span className="avatar">
              {session.data.user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{session.data.user.name}</strong>
              <small>
                {session.data.user.role === "owner"
                  ? t("Haushaltsinhaber")
                  : t("Haushaltsmitglied")}
              </small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="mobile-header">
          <Brand />
          <LanguageSelector />
          <button
            className="avatar"
            aria-label={t("Deine Einstellungen")}
            onClick={() => setTab("settings")}
          >
            {session.data.user.name.slice(0, 1).toUpperCase()}
          </button>
        </header>
        <KitchenContent tab={tab} setTab={setTab} notify={setNotice} />
      </main>
      <nav className="bottom-nav" aria-label={t("Mobile Navigation")}>
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={22} />
            <span>{item.id === "today" ? t("Plan") : t(item.name)}</span>
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
    </div>
  );
}
function Brand() {
  const { t } = useI18n();
  return (
    <a className="brand" href="/" aria-label={t("LunchJu Startseite")}>
      <span className="brand-icon" aria-hidden="true">
        lj
      </span>
      lunchju
    </a>
  );
}
function AuthScreen({
  setup,
  homeName,
  onLogin,
}: {
  setup: boolean;
  homeName: string;
  onLogin: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [invite, setInvite] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get("invite");
    if (token) {
      setInvite(token);
      history.replaceState(null, "", location.pathname + location.search);
    }
  }, []);
  async function login() {
    setBusy(true);
    setError("");
    try {
      const options = await request<
        Parameters<typeof startAuthentication>[0]["optionsJSON"]
      >("/api/auth/login/options", {});
      const response = await startAuthentication({
        optionsJSON: options,
      });
      await request("/api/auth/login/verify", response);
      await onLogin();
    } catch (error) {
      setError(passkeyError(error));
    } finally {
      setBusy(false);
    }
  }
  async function register(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const options = await request<
        Parameters<typeof startRegistration>[0]["optionsJSON"]
      >("/api/auth/register/options", {
        name: form.get("name"),
        token: invite || form.get("token"),
        label: t("Mein erster Passkey"),
      });
      const response = await startRegistration({
        optionsJSON: options,
      });
      await request("/api/auth/register/verify", response);
      await onLogin();
    } catch (error) {
      setError(passkeyError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="auth-intro">
          <span className="eyebrow">{t("DEIN GEMEINSAMES KÜCHENBUCH")}</span>
          <h1>
            {t("Dein Küchenbuch")}
            <br />
            {t("für Stuttgart.")}
          </h1>
          <p>
            {t("Rezepte, Vorräte und dein Plan für die nächsten Mahlzeiten.")}
          </p>
          <ol className="notebook-index">
            <li>
              <span>01</span>
              <strong>{t("Rezepte")}</strong>
              <small>{t("Zum Nachkochen und Aufheben")}</small>
            </li>
            <li>
              <span>02</span>
              <strong>{t("Wochenplan")}</strong>
              <small>{t("Was diese Woche auf den Tisch kommt")}</small>
            </li>
            <li>
              <span>03</span>
              <strong>{t("Vorräte")}</strong>
              <small>{t("Was du schon zu Hause hast")}</small>
            </li>
            <li>
              <span>04</span>
              <strong>{t("Einkaufsliste")}</strong>
              <small>{t("Was noch fehlt")}</small>
            </li>
          </ol>
        </div>
        <small>{t("FÜR DEINEN HAUSHALT IN STUTTGART.")}</small>
      </section>
      <section className="auth-panel">
        <LanguageSelector />
        <div className="auth-card">
          <span className="eyebrow">
            {setup ? t("ERSTE EINRICHTUNG") : t("DEIN HAUSHALT")}
          </span>
          <h2>
            {setup
              ? t("Haushalt einrichten")
              : invite
                ? t("Dem Haushalt beitreten")
                : t("Anmelden")}
          </h2>
          <p>
            {setup
              ? t("Erstelle das erste Konto für deinen Haushalt in Stuttgart.")
              : invite
                ? t("Du bist zum Haushalt {0} eingeladen.", homeName)
                : t("Melde dich mit deinem Passkey für {0} an.", homeName)}
          </p>
          {setup || invite ? (
            <form onSubmit={register}>
              <Field label={t("Dein Name")}>
                <input
                  name="name"
                  autoComplete="name"
                  placeholder={t("Name")}
                  required
                  maxLength={80}
                />
              </Field>
              {setup && (
                <Field label={t("Einmaliger Einrichtungscode")}>
                  <input
                    name="token"
                    type="password"
                    autoComplete="off"
                    required
                    placeholder={t("Einrichtungscode")}
                  />
                  <small>
                    {t(
                      "Nutze den privaten Code aus der Einrichtung von LunchJu.",
                    )}
                  </small>
                </Field>
              )}
              <button className="primary full" disabled={busy}>
                <KeyRound size={18} />
                {busy
                  ? t("Passkey wird erstellt…")
                  : t("Konto mit Passkey erstellen")}
              </button>
            </form>
          ) : (
            <button className="primary full" disabled={busy} onClick={login}>
              <KeyRound size={18} />
              {busy
                ? t("Warten auf deinen Passkey…")
                : t("Mit Passkey anmelden")}
            </button>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="auth-fineprint">
            <KeyRound size={17} />
            <p>
              {setup || invite
                ? t(
                    "Erstelle deinen Passkey mit Fingerabdruck, Gesichtserkennung oder Geräte-PIN.",
                  )
                : t(
                    "Noch kein Zugang? Bitte den Haushaltsinhaber um eine Einladung.",
                  )}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
function KitchenContent({
  tab,
  setTab,
  notify,
}: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  notify: (value: string) => void;
}) {
  const { t, language } = useI18n();
  const client = useQueryClient(),
    query = useQuery({
      queryKey: ["catalog"],
      queryFn: () => action<Data>("get_catalog"),
    });
  const [editor, setEditor] = useState<Editor | null>(null),
    [detail, setDetail] = useState<Recipe | null>(null),
    [detailServings, setDetailServings] = useState(2),
    [recipeFilters, setRecipeFilters] = useState(recipeFilterSchema.parse({})),
    [day, setDay] = useState(today()),
    [location, setLocation] = useState("All"),
    [showChecked, setShowChecked] = useState(false);
  const mutation = useMutation({
    mutationFn: ({
      operation,
      input,
    }: {
      operation: string;
      input?: unknown;
    }) => action(operation, input),
    onSuccess: async () => {
      await Promise.all(
        ["catalog", "members", "passkeys", "bringLists"].map((key) =>
          client.invalidateQueries({
            queryKey: [key],
          }),
        ),
      );
    },
    onError: (error) => notify(error.message),
  });
  const run = async (operation: string, input?: unknown, message?: string) => {
    const result = await mutation.mutateAsync({
      operation,
      input,
    });
    if (message) notify(message);
    return result;
  };
  const perform = (operation: string, input?: unknown, message?: string) => {
    void run(operation, input, message).catch(() => {});
  };
  function remove(
    type: Editor["type"],
    value: {
      id: string;
      name: string;
    },
  ) {
    if (
      window.confirm(
        t(
          "„{0}“ entfernen?{1}",
          value.name,
          type === "recipe"
            ? t(" Der bisherige Essensverlauf bleibt erhalten.")
            : "",
        ),
      )
    )
      perform(
        `delete_${type === "pantry" ? "pantry_item" : type}`,
        {
          id: value.id,
        },
        t("Entfernt."),
      );
  }
  if (query.isPending)
    return (
      <div className="loading-screen">
        <p>{t("Dein Haushalt wird geladen…")}</p>
      </div>
    );
  if (query.error)
    return (
      <section className="empty-state">
        <h2>{t("Dein Haushalt konnte nicht geladen werden.")}</h2>
        <p className="error">{query.error.message}</p>
        <button onClick={() => query.refetch()}>{t("Erneut versuchen")}</button>
      </section>
    );
  const data = query.data,
    baseToday = today(data.home.timeZone);
  const monday = addDays(
      day,
      -((new Date(`${day}T12:00Z`).getUTCDay() + 6) % 7),
    ),
    week = Array.from(
      {
        length: 7,
      },
      (_, i) => addDays(monday, i),
    );
  const expired = data.pantry.filter(
    (item) => item.expiresOn && item.expiresOn <= addDays(baseToday, 3),
  );
  const planned = data.meals.filter(
    (item) =>
      item.date >= monday && item.date <= week[6] && item.status === "planned",
  );
  const title =
    tab === "today"
      ? t("Wochenplan")
      : tab === "recipes"
        ? t("Rezepte")
        : tab === "pantry"
          ? t("Vorräte")
          : tab === "groceries"
            ? t("Einkaufsliste")
            : t("Einstellungen");
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">
            {tab === "today"
              ? `${formatDate(
                  baseToday,
                  {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  },
                  language,
                )} · ${data.home.name}`
              : data.home.name}
          </span>
          <h1>{title}</h1>
          <p>
            {tab === "today"
              ? t("Plane deine Woche und halte fest, was du isst.")
              : tab === "recipes"
                ? t("Deine Rezeptsammlung zum Nachkochen.")
                : tab === "pantry"
                  ? t("Deine Vorräte, Mengen und Haltbarkeitsdaten.")
                  : tab === "groceries"
                    ? t("Die gemeinsame Einkaufsliste für deinen Haushalt.")
                    : t("Dein Haushalt, deine Verbindungen und dein Konto.")}
          </p>
        </div>
        {tab !== "settings" && (
          <button
            className="primary"
            onClick={() =>
              setEditor({
                type:
                  tab === "today"
                    ? "meal"
                    : tab === "recipes"
                      ? "recipe"
                      : tab === "pantry"
                        ? "pantry"
                        : "grocery",
              })
            }
          >
            <Plus size={18} />
            <span>
              {tab === "today"
                ? t("Mahlzeit planen")
                : tab === "recipes"
                  ? t("Rezept hinzufügen")
                  : tab === "pantry"
                    ? t("Lebensmittel hinzufügen")
                    : t("Artikel hinzufügen")}
            </span>
          </button>
        )}
      </header>
      {tab === "today" && (
        <>
          <div className="overview-grid">
            <div className="overview-card">
              <div>
                <strong>
                  {planned.length}
                  <small>{t(" Mahlzeiten")}</small>
                </strong>
                <span>{t("für diese Woche geplant")}</span>
              </div>
            </div>
            <button className="overview-card" onClick={() => setTab("pantry")}>
              <div>
                <strong>
                  {expired.length}
                  <small>{t(" Artikel")}</small>
                </strong>
                <span>{t("bald verbrauchen")}</span>
              </div>
              <ArrowUpRight size={17} />
            </button>
            <button
              className="overview-card"
              onClick={() => setTab("groceries")}
            >
              <div>
                <strong>
                  {data.groceries.filter((item) => !item.checked).length}
                  <small>{t(" Artikel")}</small>
                </strong>
                <span>{t("noch zu kaufen")}</span>
              </div>
              <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="section-heading">
            <div>
              <h2>{t("Wochenplan")}</h2>
            </div>
            <div className="week-controls">
              <button
                className="icon-button"
                aria-label={t("Vorherige Woche")}
                onClick={() => setDay(addDays(day, -7))}
              >
                <ChevronLeft size={18} />
              </button>
              <strong>
                {formatDate(monday, undefined, language)} —{" "}
                {formatDate(week[6], undefined, language)}
              </strong>
              <button
                className="icon-button"
                aria-label={t("Nächste Woche")}
                onClick={() => setDay(addDays(day, 7))}
              >
                <ChevronRight size={18} />
              </button>
              <button className="quiet" onClick={() => setDay(baseToday)}>
                {t("Heute")}
              </button>
            </div>
          </div>
          <div className="week-strip">
            {week.map((date) => (
              <button
                className={`${date === day ? "selected " : ""}${date === baseToday ? "is-today" : ""}`}
                key={date}
                aria-pressed={date === day}
                onClick={() => setDay(date)}
              >
                <span>
                  {formatDate(
                    date,
                    {
                      weekday: "short",
                    },
                    language,
                  )}
                </span>
                <strong>
                  {formatDate(
                    date,
                    {
                      day: "numeric",
                    },
                    language,
                  )}
                </strong>
                <i
                  className={
                    data.meals.some((item) => item.date === date)
                      ? "has-meal"
                      : ""
                  }
                />
              </button>
            ))}
          </div>
          <div className="day-heading">
            <h3>
              {day === baseToday
                ? t("Heute")
                : formatDate(
                    day,
                    {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    },
                    language,
                  )}
              <span>
                {data.meals.filter((item) => item.date === day).length}{" "}
                {t("Mahlzeiten")}
              </span>
            </h3>
            <button
              className="text-button"
              onClick={() =>
                setEditor({
                  type: "meal",
                  value: {
                    date: day,
                  } as Meal,
                })
              }
            >
              <Plus size={16} />
              {t(" Mahlzeit hinzufügen")}
            </button>
          </div>
          <div className="meal-list">
            {data.meals
              .filter((item) => item.date === day)
              .map((meal) => (
                <article className="meal-card" key={meal.id}>
                  <div className="meal-main">
                    <span className="eyebrow">
                      {t(mealSlotLabels[meal.slot])}{" "}
                      {meal.status === "eaten" ? t("· GEGESSEN") : ""}
                    </span>
                    <h3>{meal.name}</h3>
                    <p>
                      <Users size={14} />
                      {formatNumber(meal.servings, language)}
                      {t(" Portionen")}
                      {meal.notes && <> · {meal.notes}</>}
                    </p>
                    {meal.scalingNotes && (
                      <p className="meal-scaling-note">{meal.scalingNotes}</p>
                    )}
                  </div>
                  <div className="meal-actions">
                    {meal.status === "planned" ? (
                      <button
                        className="quiet"
                        disabled={mutation.isPending}
                        onClick={() =>
                          perform(
                            "mark_meal_eaten",
                            {
                              id: meal.id,
                            },
                            t("Im Essensverlauf gespeichert."),
                          )
                        }
                      >
                        <Check size={15} />
                        <span>{t("Als gegessen markieren")}</span>
                      </button>
                    ) : (
                      <span className="pill">
                        <Check size={14} />
                        {t(" Gegessen")}
                      </span>
                    )}
                    <button
                      className="icon-button"
                      aria-label={t("Bearbeiten: {0}", meal.name)}
                      onClick={() =>
                        setEditor({
                          type: "meal",
                          value: meal,
                        })
                      }
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={t("Entfernen: {0}", meal.name)}
                      onClick={() => remove("meal", meal)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
          </div>
          {!data.meals.some((item) => item.date === day) && (
            <Empty
              icon={<Utensils size={30} />}
              title={t("Keine Mahlzeiten geplant")}
              text={t(
                "Wähle ein Rezept oder trage eine Mahlzeit für diesen Tag ein.",
              )}
              action={t("Mahlzeit planen")}
              onClick={() =>
                setEditor({
                  type: "meal",
                  value: {
                    date: day,
                  } as Meal,
                })
              }
            />
          )}
          <div className="plan-footer">
            <div>
              <ShoppingBasket size={23} />
              <div>
                <strong>{t("Einkauf für diese Woche")}</strong>
                <p>
                  {t("Ergänze die fehlenden Zutaten aus deinem Wochenplan.")}
                </p>
              </div>
            </div>
            <button
              className="secondary"
              disabled={mutation.isPending || !planned.length}
              onClick={() =>
                perform(
                  "generate_groceries",
                  {
                    from: monday,
                    to: week[6],
                  },
                  t("Fehlende Zutaten zur Einkaufsliste hinzugefügt."),
                )
              }
            >
              {t("Einkaufsliste erstellen ")}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </>
      )}
      {tab === "recipes" && (
        <>
          <div className="filter-bar">
            <label className="search">
              <Search size={18} />
              <input
                aria-label={t("Rezepte durchsuchen")}
                placeholder={t("Rezepte oder Zutaten suchen")}
                value={recipeFilters.search}
                maxLength={200}
                onChange={(event) =>
                  setRecipeFilters({
                    ...recipeFilters,
                    search: event.target.value,
                  })
                }
              />
            </label>
            <span className="muted">
              {data.recipes.length}
              {t(" Rezepte")}
            </span>
          </div>
          <RecipeFiltersBar
            filters={recipeFilters}
            setFilters={setRecipeFilters}
            cookbooks={data.cookbooks}
            recipes={data.recipes}
            count={filterRecipes(data.recipes, recipeFilters, language).length}
          />
          <CookbookManager
            cookbooks={data.cookbooks}
            recipes={data.recipes}
            onChanged={async () => {
              await client.invalidateQueries({ queryKey: ["catalog"] });
              const books =
                client.getQueryData<Data>(["catalog"])?.cookbooks ?? [];
              setRecipeFilters((current) =>
                current.cookbookId &&
                current.cookbookId !== "unfiled" &&
                !books.some((book) => book.id === current.cookbookId)
                  ? { ...current, cookbookId: "" }
                  : current,
              );
            }}
          />
          <RecipeList
            recipes={filterRecipes(data.recipes, recipeFilters, language)}
            cookbooks={data.cookbooks}
            busy={mutation.isPending}
            onOpen={(recipe, servings) => {
              setDetailServings(servings);
              setDetail(recipe);
            }}
            onPlan={(recipe, servings) =>
              setEditor({
                type: "meal",
                recipe,
                servings,
              })
            }
            onEdit={(recipe) =>
              setEditor({
                type: "recipe",
                value: recipe,
              })
            }
            onFavorite={(recipe) =>
              perform("update_recipe", {
                ...recipe,
                favorite: !recipe.favorite,
              })
            }
          />
          {!!data.recipes.length &&
            !filterRecipes(data.recipes, recipeFilters, language).length && (
              <div className="no-recipes">
                <p>{t("Keine Rezepte für diese Auswahl.")}</p>
                <button
                  className="text-button"
                  onClick={() => setRecipeFilters(recipeFilterSchema.parse({}))}
                >
                  {t("Filter zurücksetzen")}
                </button>
              </div>
            )}
          {!data.recipes.length && (
            <Empty
              icon={<BookOpen size={30} />}
              title={t("Noch keine Rezepte")}
              text={t(
                "Füge hier ein Rezept hinzu oder bitte deinen verbundenen Agenten darum.",
              )}
              action={t("Rezept hinzufügen")}
              onClick={() =>
                setEditor({
                  type: "recipe",
                })
              }
            />
          )}
        </>
      )}
      {tab === "pantry" && (
        <>
          <div className="filter-bar">
            <div className="chips">
              {["All", "Pantry", "Fridge", "Freezer"].map((value) => (
                <button
                  className={value === location ? "selected" : ""}
                  aria-pressed={value === location}
                  key={value}
                  onClick={() => setLocation(value)}
                >
                  {t(locationLabels[value as keyof typeof locationLabels])}
                </button>
              ))}
            </div>
            <span className="muted">
              {data.pantry.length}
              {t(" Artikel vorrätig")}
            </span>
          </div>
          <div className="stock-list">
            {data.pantry
              .filter(
                (item) => location === "All" || item.location === location,
              )
              .map((item) => (
                <article className="stock-row" key={item.id}>
                  <div className="stock-name">
                    <strong>{item.name}</strong>
                    <small>
                      {t(locationLabels[item.location])}
                      {item.expiresOn &&
                        t(
                          " · Haltbar bis {0}",
                          formatDate(item.expiresOn, undefined, language),
                        )}
                    </small>
                  </div>
                  <span className="stock-quantity">
                    {formatNumber(item.quantity, language)}{" "}
                    <small>{t(unitLabels[item.unit])}</small>
                  </span>
                  {item.expiresOn && item.expiresOn < baseToday ? (
                    <span className="pill warning">
                      {t("Datum überschritten")}
                    </span>
                  ) : (
                    item.expiresOn &&
                    item.expiresOn <= addDays(baseToday, 3) && (
                      <span className="pill amber">
                        {t("Bald verbrauchen")}
                      </span>
                    )
                  )}
                  <button
                    className="icon-button"
                    aria-label={t("Bearbeiten: {0}", item.name)}
                    onClick={() =>
                      setEditor({
                        type: "pantry",
                        value: item,
                      })
                    }
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={t("Entfernen: {0}", item.name)}
                    onClick={() => remove("pantry", item)}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
          </div>
          {!data.pantry.length && (
            <Empty
              icon={<PackageOpen size={30} />}
              title={t("Noch keine Vorräte")}
              text={t(
                "Trage deine Vorräte ein, damit sie bei Planung und Einkauf berücksichtigt werden.",
              )}
              action={t("Lebensmittel hinzufügen")}
              onClick={() =>
                setEditor({
                  type: "pantry",
                })
              }
            />
          )}
          <p className="helper-note">
            <Leaf size={16} />
            {t(
              " Haltbarkeitsdaten helfen bei der Planung. Gegessene Mahlzeiten werden im Verlauf gespeichert; Vorratsmengen änderst du separat.",
            )}
          </p>
        </>
      )}
      {tab === "groceries" && (
        <>
          <div className="groceries-toolbar">
            <div className="chips">
              <button
                className={!showChecked ? "selected" : ""}
                aria-pressed={!showChecked}
                onClick={() => setShowChecked(false)}
              >
                {t("Offen")}{" "}
                <span>
                  {data.groceries.filter((item) => !item.checked).length}
                </span>
              </button>
              <button
                className={showChecked ? "selected" : ""}
                aria-pressed={showChecked}
                onClick={() => setShowChecked(true)}
              >
                {t("Gekauft")}{" "}
                <span>
                  {data.groceries.filter((item) => item.checked).length}
                </span>
              </button>
            </div>
            <button
              className="secondary"
              disabled={mutation.isPending}
              onClick={() =>
                data.bring.connected
                  ? perform(
                      "bring_sync",
                      {},
                      t("Bring und LunchJu sind abgeglichen."),
                    )
                  : setTab("settings")
              }
            >
              <RefreshCw size={16} />
              {data.bring.connected
                ? t("Mit Bring abgleichen")
                : t("Bring verbinden")}
            </button>
          </div>
          <div className="stock-list">
            {data.groceries
              .filter((item) => item.checked === showChecked)
              .map((item) => (
                <article
                  className={`stock-row ${item.checked ? "checked" : ""}`}
                  key={item.id}
                >
                  <button
                    className="grocery-check"
                    disabled={mutation.isPending}
                    aria-label={`${item.checked ? t("Wieder öffnen") : t("Abhaken")} ${item.name}`}
                    aria-pressed={item.checked}
                    onClick={() =>
                      perform("update_grocery", {
                        ...item,
                        checked: !item.checked,
                      })
                    }
                  >
                    {item.checked && <Check size={18} />}
                  </button>
                  <div className="stock-name">
                    <strong>{item.name}</strong>
                    <small>
                      {item.notes}
                      {item.bringUuid ? `${item.notes ? " · " : ""}Bring` : ""}
                    </small>
                  </div>
                  <span className="stock-quantity">
                    {formatNumber(item.quantity, language)}{" "}
                    <small>{t(unitLabels[item.unit])}</small>
                  </span>
                  <button
                    className="icon-button"
                    aria-label={t("Bearbeiten: {0}", item.name)}
                    onClick={() =>
                      setEditor({
                        type: "grocery",
                        value: item,
                      })
                    }
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={t("Entfernen: {0}", item.name)}
                    onClick={() => remove("grocery", item)}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
          </div>
          {!data.groceries.some((item) => item.checked === showChecked) && (
            <Empty
              icon={<ShoppingBasket size={30} />}
              title={
                showChecked
                  ? t("Noch nichts gekauft")
                  : t("Die Einkaufsliste ist leer")
              }
              text={
                showChecked
                  ? t("Gekaufte Artikel erscheinen hier.")
                  : t(
                      "Füge Artikel hinzu oder erstelle die Einkaufsliste aus deinem Wochenplan.",
                    )
              }
              action={t("Artikel hinzufügen")}
              onClick={() =>
                setEditor({
                  type: "grocery",
                })
              }
            />
          )}
          <div className="shopping-note">
            <span className="bring-mark">b!</span>
            <div>
              <strong>{t("Bring-Einkaufsliste Stuttgart")}</strong>
              <p>
                {data.bring.connected
                  ? t(
                      "Die Bring-Liste Stuttgart ist verbunden. Du kannst sie jederzeit abgleichen.",
                    )
                  : t(
                      "Verbinde die Bring-Liste Stuttgart in den Einstellungen.",
                    )}
              </p>
            </div>
          </div>
        </>
      )}
      {tab === "settings" && <Settings data={data} run={run} notify={notify} />}
      {editor && (
        <Modal
          title={t(
            {
              recipe: editor.value?.id
                ? "Rezept bearbeiten"
                : "Rezept hinzufügen",
              meal: editor.value?.id
                ? "Mahlzeit bearbeiten"
                : "Mahlzeit hinzufügen",
              pantry: editor.value?.id
                ? "Lebensmittel bearbeiten"
                : "Lebensmittel hinzufügen",
              grocery: editor.value?.id
                ? "Artikel bearbeiten"
                : "Artikel hinzufügen",
            }[editor.type],
          )}
          onClose={() => setEditor(null)}
        >
          <EditorForm
            editor={editor}
            data={data}
            busy={mutation.isPending}
            save={async (operation, input) => {
              await run(operation, input, t("Gespeichert."));
              setEditor(null);
            }}
            onDelete={
              editor.value?.id
                ? () => {
                    remove(
                      editor.type,
                      editor.value as {
                        id: string;
                        name: string;
                      },
                    );
                    setEditor(null);
                  }
                : undefined
            }
          />
        </Modal>
      )}
      {detail && (
        <RecipeDetail
          key={detail.id}
          recipe={
            data.recipes.find((recipe) => recipe.id === detail.id) ?? detail
          }
          cookbooks={data.cookbooks}
          user={data.user}
          initialServings={detailServings}
          onSaved={(recipe) => {
            client.setQueryData<Data>(["catalog"], (current) =>
              current
                ? {
                    ...current,
                    recipes: current.recipes.map((item) =>
                      item.id === recipe.id ? recipe : item,
                    ),
                  }
                : current,
            );
            setDetail((current) =>
              current?.id === recipe.id ? recipe : current,
            );
            void client.invalidateQueries({
              queryKey: ["catalog"],
            });
            notify(t("Rezept gespeichert."));
          }}
          onClose={() => setDetail(null)}
          onPlan={(servings) => {
            setEditor({
              type: "meal",
              recipe:
                data.recipes.find((recipe) => recipe.id === detail.id) ??
                detail,
              servings,
            });
            setDetail(null);
          }}
          onEdit={() => {
            setEditor({
              type: "recipe",
              value:
                data.recipes.find((recipe) => recipe.id === detail.id) ??
                detail,
            });
            setDetail(null);
          }}
        />
      )}
    </>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="secondary" onClick={onClick}>
        <Plus size={16} />
        {action}
      </button>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current
      ?.querySelector<HTMLElement>("input,button,select,textarea")
      ?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const focusable = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,textarea,a[href]",
        );
        if (!focusable?.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <div className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label={t("Dialog schließen")}
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function EditorForm({
  editor,
  data,
  busy,
  save,
  onDelete,
}: {
  editor: Editor;
  data: Data;
  busy: boolean;
  save: (operation: string, input: unknown) => Promise<void>;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  const value = editor.value,
    [ingredients, setIngredients] = useState<Ingredient[]>(
      editor.type === "recipe"
        ? ((value as Recipe)?.ingredients ?? [
            {
              name: "",
              quantity: 1,
              unit: "piece",
            },
          ])
        : [],
    ),
    [cookbookIds, setCookbookIds] = useState<string[]>(
      (value as Recipe)?.cookbookIds ?? [],
    ),
    [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      str = (name: string) => String(form.get(name) ?? ""),
      number = (name: string) => Number(form.get(name));
    let input: Record<string, unknown> = {},
      operation = "";
    if (editor.type === "recipe") {
      input = {
        name: str("name"),
        description: str("description"),
        servings: number("servings"),
        minutes: number("minutes"),
        sourceUrl: str("sourceUrl"),
        tags: str("tags")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        favorite: (value as Recipe)?.favorite ?? false,
        cookbookIds,
        instructions: str("instructions")
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        scalingNotes: str("scalingNotes"),
        ingredients: ingredients.map((item, index) => ({
          name: str(`ingredient-${index}`),
          quantity: number(`quantity-${index}`),
          unit: str(`unit-${index}`),
          scaling: item.scaling,
        })),
      };
      operation = value?.id ? "update_recipe" : "create_recipe";
    } else if (editor.type === "pantry") {
      input = {
        name: str("name"),
        quantity: number("quantity"),
        unit: str("unit"),
        location: str("location"),
        expiresOn: str("expiresOn") || null,
      };
      operation = value?.id ? "update_pantry_item" : "add_pantry_item";
    } else if (editor.type === "meal") {
      input = {
        date: str("date"),
        slot: str("slot"),
        servings: number("servings"),
        notes: str("notes"),
        status: str("status"),
        ...(str("recipeId")
          ? {
              recipeId: str("recipeId"),
            }
          : {
              name: str("name"),
            }),
      };
      operation = value?.id ? "update_meal" : "plan_meal";
    } else {
      input = {
        name: str("name"),
        quantity: number("quantity"),
        unit: str("unit"),
        notes: str("notes"),
        ...(value?.id
          ? {
              checked: (value as Grocery).checked,
            }
          : {}),
      };
      operation = value?.id ? "update_grocery" : "add_grocery";
    }
    if (value?.id) input.id = value.id;
    setError("");
    try {
      await save(operation, input);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t("Speichern fehlgeschlagen."),
      );
    }
  }
  return (
    <form className="editor-form" onSubmit={submit}>
      {editor.type !== "meal" && (
        <Field
          label={
            editor.type === "recipe"
              ? t("Rezeptname")
              : t("Lebensmittel oder Zutat")
          }
        >
          <input
            name="name"
            required
            maxLength={160}
            placeholder={
              editor.type === "recipe"
                ? t("Pasta mit Tomatensoße")
                : "z. B. Kirschtomaten"
            }
            defaultValue={value?.name}
          />
        </Field>
      )}
      {editor.type === "recipe" && (
        <>
          <CookbookPicker
            cookbooks={data.cookbooks}
            selected={cookbookIds}
            onChange={setCookbookIds}
          />
          <Field label={t("Beschreibung")}>
            <textarea
              name="description"
              rows={2}
              maxLength={3000}
              defaultValue={(value as Recipe)?.description}
              placeholder={t(
                "Ein schnelles Abendessen, fertig in einer halben Stunde.",
              )}
            />
          </Field>
          <div className="form-row">
            <Field label={t("Portionen")}>
              <input
                name="servings"
                type="number"
                min="0.1"
                max="100"
                step="any"
                required
                defaultValue={(value as Recipe)?.servings ?? 2}
              />
            </Field>
            <Field label={t("Zeit in Minuten")}>
              <input
                name="minutes"
                type="number"
                min="0"
                max="2880"
                required
                defaultValue={(value as Recipe)?.minutes ?? 30}
              />
            </Field>
          </div>
          <div className="ingredient-heading">
            <strong>{t("Zutaten")}</strong>
            <small>{t("Für die angegebene Portionszahl")}</small>
          </div>
          {ingredients.map((ingredient, index) => (
            <div className="ingredient-editor" key={index}>
              <div className="ingredient-input">
                <label className="sr-only" htmlFor={`ing-${index}`}>
                  {t("Zutat ")}
                  {index + 1}
                </label>
                <input
                  id={`ing-${index}`}
                  name={`ingredient-${index}`}
                  value={ingredient.name}
                  onChange={(event) =>
                    setIngredients((items) =>
                      items.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              name: event.target.value,
                            }
                          : item,
                      ),
                    )
                  }
                  placeholder={t("Zutat")}
                  required
                  maxLength={160}
                />
                <input
                  name={`quantity-${index}`}
                  aria-label={t("Menge für Zutat {0}", index + 1)}
                  type="number"
                  value={ingredient.quantity}
                  onChange={(event) =>
                    setIngredients((items) =>
                      items.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              quantity: Number(event.target.value),
                            }
                          : item,
                      ),
                    )
                  }
                  min="0.001"
                  max="100000"
                  step="any"
                  required
                />
                <select
                  name={`unit-${index}`}
                  aria-label={t("Einheit für Zutat {0}", index + 1)}
                  value={ingredient.unit}
                  onChange={(event) =>
                    setIngredients((items) =>
                      items.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              unit: event.target.value as Ingredient["unit"],
                            }
                          : item,
                      ),
                    )
                  }
                >
                  {units.map((unit) => (
                    <option key={unit} value={unit}>
                      {t(unitLabels[unit as keyof typeof unitLabels])}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button"
                  disabled={ingredients.length <= 1}
                  aria-label={t("Zutat {0} entfernen", index + 1)}
                  onClick={() =>
                    setIngredients((items) =>
                      items.filter((_, i) => i !== index),
                    )
                  }
                >
                  <X size={15} />
                </button>
              </div>
              <details className="ingredient-scaling-editor">
                <summary>
                  {t("Skalierung")}
                  {ingredient.scaling?.mode === "fixed" ||
                  ingredient.scaling?.roundUpTo ||
                  ingredient.scaling?.note
                    ? " · Sonderregel"
                    : " anpassen"}
                </summary>
                <div className="form-row">
                  <Field label={t("Menge bei anderer Personenzahl")}>
                    <select
                      aria-label={t("Skalierung für Zutat {0}", index + 1)}
                      value={ingredient.scaling?.mode ?? "linear"}
                      onChange={(event) =>
                        setIngredients((items) =>
                          items.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  scaling: {
                                    note: "",
                                    ...item.scaling,
                                    mode: event.target.value as
                                      "linear" | "fixed",
                                  },
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="linear">
                        {t("Mit der Personenzahl anpassen")}
                      </option>
                      <option value="fixed">{t("Menge gleich lassen")}</option>
                    </select>
                  </Field>
                  <Field
                    label={t(
                      "Aufrunden auf ({0}, optional)",
                      t(unitLabels[ingredient.unit]),
                    )}
                  >
                    <input
                      type="number"
                      min="0.001"
                      max="100000"
                      step="any"
                      value={ingredient.scaling?.roundUpTo ?? ""}
                      aria-label={t("Aufrunden für Zutat {0}", index + 1)}
                      onChange={(event) =>
                        setIngredients((items) =>
                          items.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  scaling: {
                                    mode: "linear",
                                    note: "",
                                    ...item.scaling,
                                    roundUpTo:
                                      event.target.value === ""
                                        ? undefined
                                        : Number(event.target.value),
                                  },
                                }
                              : item,
                          ),
                        )
                      }
                      placeholder={t("z. B. 1 für ganze Eier")}
                    />
                  </Field>
                </div>
                <Field label={t("Hinweis zur Zutat (optional)")}>
                  <input
                    maxLength={500}
                    value={ingredient.scaling?.note ?? ""}
                    aria-label={t(
                      "Skalierungshinweis für Zutat {0}",
                      index + 1,
                    )}
                    onChange={(event) =>
                      setIngredients((items) =>
                        items.map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                scaling: {
                                  mode: "linear",
                                  ...item.scaling,
                                  note: event.target.value,
                                },
                              }
                            : item,
                        ),
                      )
                    }
                    placeholder={t("z. B. Gewürze zum Schluss abschmecken")}
                  />
                </Field>
              </details>
            </div>
          ))}
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setIngredients((items) => [
                ...items,
                {
                  name: "",
                  quantity: 1,
                  unit: "piece",
                },
              ])
            }
          >
            <Plus size={16} />
            {t(" Zutat hinzufügen")}
          </button>
          <Field label={t("Zubereitungsschritte, einer pro Zeile")}>
            <textarea
              name="instructions"
              required
              rows={5}
              maxLength={30000}
              defaultValue={(value as Recipe)?.instructions.join("\n")}
              placeholder={t(
                "Gemüse schneiden.\nEtwas Olivenöl in einer Pfanne erhitzen.\nZutaten anbraten und abschmecken.",
              )}
            />
          </Field>
          <Field label={t("Hinweise für andere Personenzahlen (optional)")}>
            <textarea
              name="scalingNotes"
              rows={2}
              maxLength={2000}
              defaultValue={(value as Recipe)?.scalingNotes}
              placeholder={t(
                "z. B. Ab 6 Personen in zwei Pfannen braten. Garzeit bleibt gleich.",
              )}
            />
          </Field>
          <Field label={t("Schlagwörter, durch Kommas getrennt")}>
            <input
              name="tags"
              defaultValue={(value as Recipe)?.tags.join(", ")}
              placeholder={t("Schnell, Vegetarisch, Lieblingsgericht")}
            />
          </Field>
          <Field label={t("Link zum Originalrezept (optional)")}>
            <input
              name="sourceUrl"
              type="url"
              defaultValue={(value as Recipe)?.sourceUrl}
              placeholder="https://…"
            />
          </Field>
        </>
      )}
      {(editor.type === "pantry" || editor.type === "grocery") && (
        <div className="form-row">
          <Field label={t("Menge")}>
            <input
              name="quantity"
              type="number"
              min={editor.type === "pantry" ? 0 : 0.001}
              max="100000"
              step="any"
              required
              defaultValue={(value as PantryItem | Grocery)?.quantity ?? 1}
            />
          </Field>
          <Field label={t("Einheit")}>
            <select
              name="unit"
              defaultValue={(value as PantryItem | Grocery)?.unit ?? "piece"}
            >
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {t(unitLabels[unit as keyof typeof unitLabels])}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {editor.type === "pantry" && (
        <div className="form-row">
          <Field label={t("Lagerort")}>
            <select
              name="location"
              defaultValue={(value as PantryItem)?.location ?? "Pantry"}
            >
              {["Pantry", "Fridge", "Freezer"].map((value) => (
                <option key={value} value={value}>
                  {t(locationLabels[value as keyof typeof locationLabels])}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Haltbar bis (optional)")}>
            <input
              name="expiresOn"
              type="date"
              defaultValue={(value as PantryItem)?.expiresOn ?? ""}
            />
          </Field>
        </div>
      )}
      {editor.type === "meal" && (
        <>
          <Field label={t("Rezept auswählen")}>
            <select
              name="recipeId"
              defaultValue={
                (value as Meal)?.recipeId ?? editor.recipe?.id ?? ""
              }
            >
              <option value="">{t("Mahlzeit ohne Rezept")}</option>
              {data.recipes.map((recipe) => (
                <option value={recipe.id} key={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Mahlzeit (ohne ausgewähltes Rezept)")}>
            <input
              name="name"
              maxLength={160}
              defaultValue={value?.name ?? ""}
              placeholder={t("z. B. Essen gehen, Reste, selbstgemachte Pizza")}
            />
          </Field>
          <div className="form-row">
            <Field label={t("Datum")}>
              <input
                name="date"
                type="date"
                required
                defaultValue={
                  (value as Meal)?.date ?? today(data.home.timeZone)
                }
              />
            </Field>
            <Field label={t("Mahlzeit")}>
              <select
                name="slot"
                defaultValue={(value as Meal)?.slot ?? "dinner"}
              >
                {["breakfast", "lunch", "dinner", "snack"].map((slot) => (
                  <option key={slot} value={slot}>
                    {t(mealSlotLabels[slot as keyof typeof mealSlotLabels])}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-row">
            <Field label={t("Portionen")}>
              <input
                name="servings"
                type="number"
                min="0.1"
                max="100"
                step="any"
                required
                defaultValue={
                  (value as Meal)?.servings ??
                  editor.servings ??
                  editor.recipe?.servings ??
                  2
                }
              />
            </Field>
            <Field label={t("Status")}>
              <select
                name="status"
                defaultValue={(value as Meal)?.status ?? "planned"}
              >
                <option value="planned">{t("Geplant")}</option>
                <option value="eaten">{t("Gegessen")}</option>
              </select>
            </Field>
          </div>
        </>
      )}
      {(editor.type === "meal" || editor.type === "grocery") && (
        <Field label={t("Notizen (optional)")}>
          <textarea
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={(value as Meal | Grocery)?.notes}
            placeholder={t("Weitere Hinweise")}
          />
        </Field>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        {onDelete && (
          <button
            className="text-button danger"
            type="button"
            onClick={onDelete}
          >
            <Trash2 size={16} />
            {t(" Entfernen")}
          </button>
        )}
        <button className="primary" disabled={busy}>
          <Check size={17} />
          {busy ? t("Wird gespeichert…") : t("Speichern")}
        </button>
      </div>
    </form>
  );
}
function RecipeDetail({
  recipe,
  initialServings,
  onSaved,
  cookbooks,
  user,
  onClose,
  onPlan,
  onEdit,
}: {
  recipe: Recipe;
  initialServings: number;
  onSaved: (recipe: Recipe) => void;
  cookbooks: Catalog["cookbooks"];
  user: User;
  onClose: () => void;
  onPlan: (servings: number) => void;
  onEdit: () => void;
}) {
  const { t, language } = useI18n();
  const [people, setPeople] = useState(String(initialServings));
  const servings = personCount(people);
  const ingredients =
    servings === null ? [] : scaleIngredients(recipe, servings);
  const check = useQuery({
    queryKey: ["readiness", recipe.id, recipe.updatedAt, servings],
    enabled: servings !== null,
    queryFn: () =>
      action<{
        canCook: boolean;
        missing: Ingredient[];
      }>("check_ingredients", {
        recipeId: recipe.id,
        servings,
      }),
  });
  return (
    <Modal title={recipe.name} onClose={onClose}>
      <div className="recipe-detail">
        <RecipeGallery recipe={recipe} onSaved={onSaved} />
        <RecipeCookbooks
          recipe={recipe}
          cookbooks={cookbooks}
          onSaved={onSaved}
        />
        <p>{recipe.description}</p>
        <div className="detail-controls">
          <span>
            <Clock size={16} />
            {formatNumber(recipe.minutes, language)}
            {t(" Minuten")}
          </span>
          <ServingsControl
            value={people}
            onChange={setPeople}
            baseServings={recipe.servings}
          />
        </div>
        <div className={check.data?.canCook ? "readiness ready" : "readiness"}>
          <PackageOpen size={19} />
          {servings === null
            ? t("Wähle eine Personenzahl zwischen 0,1 und 100.")
            : check.isPending
              ? t("Vorräte werden geprüft…")
              : check.error
                ? t("Vorräte konnten nicht geprüft werden.")
                : check.data?.canCook
                  ? t("Alle Zutaten sind vorhanden.")
                  : t("{0} Zutaten fehlen.", check.data?.missing.length)}
        </div>
        {recipe.scalingNotes && (
          <aside className="scaling-notes">
            <strong>{t("Hinweise zur Personenzahl")}</strong>
            <p>{recipe.scalingNotes}</p>
          </aside>
        )}
        <h3>{t("Zutaten")}</h3>
        <ul className="ingredients-list">
          {ingredients.map((item, index) => (
            <li key={index}>
              <span>
                {item.name}
                {(item.scaling?.mode === "fixed" ||
                  item.scaling?.roundUpTo ||
                  item.scaling?.note) && (
                  <small className="ingredient-scaling-note">
                    {[
                      item.scaling.mode === "fixed"
                        ? t("Menge bleibt gleich")
                        : "",
                      item.scaling.roundUpTo
                        ? t(
                            "Auf {0} {1} aufgerundet",
                            formatNumber(item.scaling.roundUpTo, language),
                            t(unitLabels[item.unit]),
                          )
                        : "",
                      item.scaling.note,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                )}
              </span>
              <strong>
                {formatNumber(item.quantity, language)}{" "}
                {t(unitLabels[item.unit])}
              </strong>
            </li>
          ))}
        </ul>
        <h3>{t("Zubereitung")}</h3>
        <ol className="steps">
          {recipe.instructions.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        {recipe.sourceUrl && (
          <a
            className="text-button"
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Originalrezept ")}
            <ArrowUpRight size={16} />
          </a>
        )}
        <RecipeComments recipe={recipe} user={user} onSaved={onSaved} />
        <div className="form-footer">
          <button className="secondary" onClick={onEdit}>
            <Pencil size={16} />
            {t(" Rezept bearbeiten")}
          </button>
          <button
            className="primary"
            disabled={servings === null}
            onClick={() => onPlan(servings!)}
          >
            <CalendarDays size={16} />
            {t(" Mahlzeit planen")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
type Run = (
  operation: string,
  input?: unknown,
  message?: string,
) => Promise<unknown>;
function Settings({
  data,
  run,
  notify,
}: {
  data: Data;
  run: Run;
  notify: (message: string) => void;
}) {
  const { t, locale } = useI18n();
  const client = useQueryClient(),
    [busy, setBusy] = useState(false),
    [invitation, setInvitation] = useState("");
  const owner = data.user.role === "owner";
  const members = useQuery({
    queryKey: ["members"],
    queryFn: () =>
      action<{
        members: (User & {
          active: number;
        })[];
      }>("list_members"),
    enabled: owner,
  });
  const keys = useQuery({
    queryKey: ["passkeys"],
    queryFn: () =>
      action<{
        passkeys: {
          id: string;
          name: string;
          created_at: string;
        }[];
      }>("list_passkeys"),
  });
  async function doRun(operation: string, input?: unknown, message?: string) {
    setBusy(true);
    try {
      return await run(operation, input, message);
    } catch {
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  async function addPasskey() {
    setBusy(true);
    try {
      const options = await request<
        Parameters<typeof startRegistration>[0]["optionsJSON"]
      >("/api/auth/register/options", {
        name: data.user.name,
        label: `Passkey ${new Date().toLocaleDateString(locale)}`,
      });
      const response = await startRegistration({
        optionsJSON: options,
      });
      await request("/api/auth/register/verify", response);
      await client.invalidateQueries({
        queryKey: ["passkeys"],
      });
      notify(t("Passkey hinzugefügt."));
    } catch (error) {
      notify(passkeyError(error));
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify(t("In die Zwischenablage kopiert."));
    } catch {
      notify(t("Markiere und kopiere den Link unten."));
    }
  }
  return (
    <div className="settings-grid">
      <section className="settings-card">
        <h2>{t("LunchJu als App")}</h2>
        <InstallApp />
      </section>
      <section className="settings-card">
        <h2>{t("Sprache")}</h2>
        <p>
          {t(
            "Gilt für dein Konto und deinen Agenten. Neue Rezepte und Zutaten werden in dieser Sprache angelegt.",
          )}
        </p>
        <LanguageSelector />
      </section>
      <section className="settings-card agent-settings">
        <span className="soft-icon">
          <Bot size={26} />
        </span>
        <h2>{t("Agentenzugang")}</h2>
        <p>
          {t(
            "Dein Agent kann Rezepte, Vorräte und Mahlzeiten für Stuttgart verwalten. Seine Berechtigungen legst du beim Verbinden fest.",
          )}
        </p>
        <label className="copy-field">
          <span className="sr-only">{t("MCP-Verbindungsadresse")}</span>
          <input
            readOnly
            value={
              typeof window !== "undefined"
                ? `${window.location.origin}/mcp`
                : "/mcp"
            }
          />
          <button
            className="icon-button"
            aria-label={t("MCP-Adresse kopieren")}
            onClick={() => copy(`${window.location.origin}/mcp`)}
          >
            <Copy size={17} />
          </button>
        </label>
        <small>
          {t(
            "Füge diese MCP-Adresse in den Einstellungen deines Agenten hinzu und wähle OAuth. Melde dich mit deinem LunchJu-Passkey an.",
          )}
        </small>
        <a className="secondary" href="/oauth/grants">
          {t("Verbundene Agenten verwalten ")}
          <ArrowUpRight size={16} />
        </a>
        <div className="example-prompt">
          {t(
            "„Plane drei vegetarische Abendessen und ergänze die fehlenden Zutaten auf der Einkaufsliste.“",
          )}
        </div>
      </section>
      <section className="settings-card">
        <span className="soft-icon">
          <KeyRound size={24} />
        </span>
        <h2>{t("Passkeys")}</h2>
        <p>
          {t(
            "Nutze Passkeys auf deinen Geräten oder über einen synchronisierten Passwortmanager. Hinterlege vor einem Gerätewechsel einen weiteren Passkey.",
          )}
        </p>
        {keys.data?.passkeys.map((key) => (
          <div className="settings-list-row" key={key.id}>
            <KeyRound size={16} />
            <span>
              {key.name}
              <small>
                {new Date(key.created_at).toLocaleDateString(locale)}
              </small>
            </span>
            <button
              className="icon-button danger"
              disabled={busy || (keys.data?.passkeys.length ?? 0) < 2}
              aria-label={t("Entfernen: {0}", key.name)}
              onClick={() => {
                if (confirm(t("Diesen Passkey entfernen?")))
                  void doRun(
                    "delete_passkey",
                    {
                      credentialId: key.id,
                    },
                    t("Passkey entfernt."),
                  );
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {keys.error && <p className="error">{keys.error.message}</p>}
        <button className="secondary" disabled={busy} onClick={addPasskey}>
          <Plus size={17} />
          {t(" Passkey hinzufügen")}
        </button>
        <button
          className="text-button"
          onClick={async () => {
            await request("/api/auth/logout", {});
            client.clear();
            location.assign("/");
          }}
        >
          <LogOut size={16} />
          {t(" Abmelden")}
        </button>
      </section>
      <section className="settings-card">
        <span className="bring-mark">b!</span>
        <h2>{t("Bring")}</h2>
        <p>
          {t(
            "Verbunden wird ausschließlich die Bring-Liste Stuttgart. Neue und abgehakte Artikel werden beim Abgleich in beide Richtungen übernommen.",
          )}
        </p>
        {owner ? (
          data.bring.connected ? (
            <>
              <p className="helper-note">
                {t("Verbundene Liste: ")}
                <strong>Stuttgart</strong>
              </p>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy || !data.bring.listId}
                  onClick={() =>
                    void doRun(
                      "bring_sync",
                      {},
                      t("Die Bring-Einkaufsliste ist abgeglichen."),
                    )
                  }
                >
                  <RefreshCw size={16} />
                  {t(" Jetzt abgleichen")}
                </button>
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        t(
                          "Bring trennen und die gespeicherten Zugangstokens löschen?",
                        ),
                      )
                    )
                      void doRun(
                        "bring_disconnect",
                        {},
                        t("Bring wurde getrennt."),
                      );
                  }}
                >
                  {t("Trennen")}
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const element = event.currentTarget,
                  form = new FormData(element);
                const result = await doRun(
                  "bring_connect",
                  {
                    email: form.get("email"),
                    password: form.get("password"),
                  },
                  t("Bring ist mit Stuttgart verbunden."),
                );
                if (result) element.reset();
              }}
            >
              <Field label={t("Bring-E-Mail")}>
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                />
              </Field>
              <Field label={t("Bring-Passwort")}>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <button className="secondary" disabled={busy}>
                {busy
                  ? t("Verbindung wird hergestellt…")
                  : t("Bring verbinden")}
              </button>
              <small>
                {t(
                  "Das Passwort wird nur zur Anmeldung bei Bring verwendet und nicht gespeichert.",
                )}
              </small>
            </form>
          )
        ) : (
          <p className="helper-note">
            {t(
              "Die Bring-Verbindung wird vom Haushaltsinhaber verwaltet. Alle Mitglieder können die Einkaufsliste abgleichen.",
            )}
          </p>
        )}
      </section>
      <section className="settings-card">
        <span className="soft-icon">
          <Leaf size={24} />
        </span>
        <h2>{t("Ernährungswünsche")}</h2>
        <p>
          {t(
            "Dein Agent berücksichtigt diese Wünsche bei der Planung. Prüfe die Zutaten bei Allergien immer selbst.",
          )}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void doRun(
              "set_preferences",
              {
                diet: String(form.get("diet")),
                allergies: String(form.get("allergies"))
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
                notes: String(form.get("notes")),
              },
              t("Ernährungswünsche gespeichert."),
            );
          }}
        >
          <Field label={t("Ernährungsweise")}>
            <input
              name="diet"
              defaultValue={data.preferences.diet}
              placeholder={t("z. B. vegetarisch, flexibel, eiweißreich")}
              maxLength={160}
            />
          </Field>
          <Field label={t("Allergien (durch Kommas getrennt)")}>
            <input
              name="allergies"
              defaultValue={data.preferences.allergies.join(", ")}
              placeholder={t("z. B. Erdnüsse, Sesam")}
            />
          </Field>
          <Field label={t("Notizen")}>
            <textarea
              name="notes"
              rows={3}
              defaultValue={data.preferences.notes}
              maxLength={3000}
              placeholder={t(
                "Unter der Woche schnelle Gerichte. Nicht zu scharf.",
              )}
            />
          </Field>
          <button className="secondary" disabled={busy}>
            <Check size={16} />
            {t(" Ernährungswünsche speichern")}
          </button>
        </form>
      </section>
      {owner && (
        <section className="settings-card">
          <span className="soft-icon">
            <Users size={24} />
          </span>
          <h2>{t("Mitglieder")}</h2>
          <p>
            {t(
              "Ein gemeinsamer Haushalt in Stuttgart. Einladungen sind einmal verwendbar und laufen nach 24 Stunden ab.",
            )}
          </p>
          {members.data?.members.map((member) => (
            <div className="settings-list-row" key={member.id}>
              <span className="avatar small">
                {member.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                {member.name}
                <small>
                  {member.role === "owner"
                    ? t("Haushaltsinhaber")
                    : member.active
                      ? t("Mitglied")
                      : t("Zugang deaktiviert")}
                </small>
              </span>
              {member.role !== "owner" && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void doRun(
                      "set_member_active",
                      {
                        id: member.id,
                        active: !member.active,
                      },
                      t("Mitgliederzugang aktualisiert."),
                    )
                  }
                >
                  {member.active ? t("Deaktivieren") : t("Aktivieren")}
                </button>
              )}
            </div>
          ))}
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              const result = (await doRun("create_invitation")) as
                | {
                    url: string;
                  }
                | undefined;
              if (result) setInvitation(result.url);
            }}
          >
            <Plus size={16} />
            {t(" Person einladen")}
          </button>
          {invitation && (
            <label className="copy-field">
              <input
                readOnly
                aria-label={t("Einladungslink")}
                value={invitation}
              />
              <button
                className="icon-button"
                aria-label={t("Einladung kopieren")}
                onClick={() => copy(invitation)}
              >
                <Copy size={16} />
              </button>
            </label>
          )}
        </section>
      )}
    </div>
  );
}
