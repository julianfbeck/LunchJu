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
  ImagePlus,
} from "lucide-react";
import { scaleIngredients } from "../scaling";
import { RecipeList, ServingsControl, personCount } from "./recipe-list";
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
  preferences: { diet: string; allergies: string[]; notes: string };
};
type Tab = "today" | "recipes" | "pantry" | "groceries" | "settings";
type Editor = {
  type: "recipe" | "pantry" | "meal" | "grocery";
  value?: Recipe | PantryItem | Meal | Grocery;
  recipe?: Recipe;
  servings?: number;
};
const tabs = [
  { id: "today", name: "Wochenplan", icon: CalendarDays },
  { id: "recipes", name: "Rezepte", icon: BookOpen },
  { id: "pantry", name: "Vorräte", icon: PackageOpen },
  { id: "groceries", name: "Einkaufsliste", icon: ShoppingBasket },
  { id: "settings", name: "Einstellungen", icon: Settings2 },
] as const;
const units = ["g", "kg", "ml", "l", "piece", "tsp", "tbsp", "cup"];

export function KitchenApp() {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () =>
      request<{ user: User | null; setup: boolean; homeName: string }>(
        "/api/auth/session",
      ),
  });
  const [tab, setTab] = useState<Tab>("today"),
    [notice, setNotice] = useState("");
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
        <p>Wird geladen…</p>
      </div>
    );
  if (session.error)
    return (
      <div className="auth-page">
        <Brand />
        <h1>LunchJu konnte nicht geladen werden</h1>
        <p className="error">{session.error.message}</p>
        <p>Bitte versuche es gleich noch einmal.</p>
        <button onClick={() => session.refetch()}>Erneut versuchen</button>
      </div>
    );
  if (!session.data.user)
    return (
      <AuthScreen
        setup={session.data.setup}
        homeName={session.data.homeName}
        onLogin={async () => {
          await client.invalidateQueries({ queryKey: ["session"] });
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
        <nav aria-label="Hauptnavigation">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "nav-item active" : "nav-item"}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={20} />
              {item.name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="agent-link" onClick={() => setTab("settings")}>
            <Bot size={18} /> Agentenzugang <ArrowUpRight size={15} />
          </button>
          <button className="profile" onClick={() => setTab("settings")}>
            <span className="avatar">
              {session.data.user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{session.data.user.name}</strong>
              <small>
                {session.data.user.role === "owner"
                  ? "Haushaltsinhaber"
                  : "Haushaltsmitglied"}
              </small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="mobile-header">
          <Brand />
          <button
            className="avatar"
            aria-label="Deine Einstellungen"
            onClick={() => setTab("settings")}
          >
            {session.data.user.name.slice(0, 1).toUpperCase()}
          </button>
        </header>
        <KitchenContent tab={tab} setTab={setTab} notify={setNotice} />
      </main>
      <nav className="bottom-nav" aria-label="Mobile Navigation">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={22} />
            <span>{item.id === "today" ? "Plan" : item.name}</span>
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
  return (
    <a className="brand" href="/" aria-label="LunchJu Startseite">
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
      const response = await startAuthentication({ optionsJSON: options });
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
        label: "Mein erster Passkey",
      });
      const response = await startRegistration({ optionsJSON: options });
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
          <span className="eyebrow">DEIN GEMEINSAMES KÜCHENBUCH</span>
          <h1>
            Dein Küchenbuch
            <br />
            für Stuttgart.
          </h1>
          <p>Rezepte, Vorräte und dein Plan für die nächsten Mahlzeiten.</p>
          <ol className="notebook-index">
            <li>
              <span>01</span>
              <strong>Rezepte</strong>
              <small>Zum Nachkochen und Aufheben</small>
            </li>
            <li>
              <span>02</span>
              <strong>Wochenplan</strong>
              <small>Was diese Woche auf den Tisch kommt</small>
            </li>
            <li>
              <span>03</span>
              <strong>Vorräte</strong>
              <small>Was du schon zu Hause hast</small>
            </li>
            <li>
              <span>04</span>
              <strong>Einkaufsliste</strong>
              <small>Was noch fehlt</small>
            </li>
          </ol>
        </div>
        <small>FÜR DEINEN HAUSHALT IN STUTTGART.</small>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">
            {setup ? "ERSTE EINRICHTUNG" : "DEIN HAUSHALT"}
          </span>
          <h2>
            {setup
              ? "Haushalt einrichten"
              : invite
                ? "Dem Haushalt beitreten"
                : "Anmelden"}
          </h2>
          <p>
            {setup
              ? "Erstelle das erste Konto für deinen Haushalt in Stuttgart."
              : invite
                ? `Du bist zum Haushalt ${homeName} eingeladen.`
                : `Melde dich mit deinem Passkey für ${homeName} an.`}
          </p>
          {setup || invite ? (
            <form onSubmit={register}>
              <Field label="Dein Name">
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Name"
                  required
                  maxLength={80}
                />
              </Field>
              {setup && (
                <Field label="Einmaliger Einrichtungscode">
                  <input
                    name="token"
                    type="password"
                    autoComplete="off"
                    required
                    placeholder="Einrichtungscode"
                  />
                  <small>
                    Nutze den privaten Code aus der Einrichtung von LunchJu.
                  </small>
                </Field>
              )}
              <button className="primary full" disabled={busy}>
                <KeyRound size={18} />
                {busy
                  ? "Passkey wird erstellt…"
                  : "Konto mit Passkey erstellen"}
              </button>
            </form>
          ) : (
            <button className="primary full" disabled={busy} onClick={login}>
              <KeyRound size={18} />
              {busy ? "Warten auf deinen Passkey…" : "Mit Passkey anmelden"}
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
                ? "Erstelle deinen Passkey mit Fingerabdruck, Gesichtserkennung oder Geräte-PIN."
                : "Noch kein Zugang? Bitte den Haushaltsinhaber um eine Einladung."}
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
  const client = useQueryClient(),
    query = useQuery({
      queryKey: ["catalog"],
      queryFn: () => action<Data>("get_catalog"),
    });
  const [editor, setEditor] = useState<Editor | null>(null),
    [detail, setDetail] = useState<Recipe | null>(null),
    [detailServings, setDetailServings] = useState(2),
    [search, setSearch] = useState(""),
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
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
    onError: (error) => notify(error.message),
  });
  const run = async (operation: string, input?: unknown, message?: string) => {
    const result = await mutation.mutateAsync({ operation, input });
    if (message) notify(message);
    return result;
  };
  const perform = (operation: string, input?: unknown, message?: string) => {
    void run(operation, input, message).catch(() => {});
  };
  function remove(type: Editor["type"], value: { id: string; name: string }) {
    if (
      window.confirm(
        `„${value.name}“ entfernen?${type === "recipe" ? " Der bisherige Essensverlauf bleibt erhalten." : ""}`,
      )
    )
      perform(
        `delete_${type === "pantry" ? "pantry_item" : type}`,
        { id: value.id },
        "Entfernt.",
      );
  }
  if (query.isPending)
    return (
      <div className="loading-screen">
        <p>Dein Haushalt wird geladen…</p>
      </div>
    );
  if (query.error)
    return (
      <section className="empty-state">
        <h2>Dein Haushalt konnte nicht geladen werden.</h2>
        <p className="error">{query.error.message}</p>
        <button onClick={() => query.refetch()}>Erneut versuchen</button>
      </section>
    );
  const data = query.data,
    baseToday = today(data.home.timeZone);
  const monday = addDays(
      day,
      -((new Date(`${day}T12:00Z`).getUTCDay() + 6) % 7),
    ),
    week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const expired = data.pantry.filter(
    (item) => item.expiresOn && item.expiresOn <= addDays(baseToday, 3),
  );
  const planned = data.meals.filter(
    (item) =>
      item.date >= monday && item.date <= week[6] && item.status === "planned",
  );
  const title =
    tab === "today"
      ? "Wochenplan"
      : tab === "recipes"
        ? "Rezepte"
        : tab === "pantry"
          ? "Pantry"
          : tab === "groceries"
            ? "Einkaufsliste"
            : "Einstellungen";
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">
            {tab === "today"
              ? `${formatDate(baseToday, { weekday: "long", month: "long", day: "numeric" })} · ${data.home.name}`
              : data.home.name}
          </span>
          <h1>{title}</h1>
          <p>
            {tab === "today"
              ? "Plane deine Woche und halte fest, was du isst."
              : tab === "recipes"
                ? "Deine Rezeptsammlung zum Nachkochen."
                : tab === "pantry"
                  ? "Deine Vorräte, Mengen und Haltbarkeitsdaten."
                  : tab === "groceries"
                    ? "Die gemeinsame Einkaufsliste für deinen Haushalt."
                    : "Dein Haushalt, deine Verbindungen und dein Konto."}
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
                ? "Mahlzeit planen"
                : tab === "recipes"
                  ? "Rezept hinzufügen"
                  : tab === "pantry"
                    ? "Lebensmittel hinzufügen"
                    : "Artikel hinzufügen"}
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
                  <small> Mahlzeiten</small>
                </strong>
                <span>für diese Woche geplant</span>
              </div>
            </div>
            <button className="overview-card" onClick={() => setTab("pantry")}>
              <div>
                <strong>
                  {expired.length}
                  <small> Artikel</small>
                </strong>
                <span>bald verbrauchen</span>
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
                  <small> Artikel</small>
                </strong>
                <span>noch zu kaufen</span>
              </div>
              <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="section-heading">
            <div>
              <h2>Wochenplan</h2>
            </div>
            <div className="week-controls">
              <button
                className="icon-button"
                aria-label="Vorherige Woche"
                onClick={() => setDay(addDays(day, -7))}
              >
                <ChevronLeft size={18} />
              </button>
              <strong>
                {formatDate(monday)} — {formatDate(week[6])}
              </strong>
              <button
                className="icon-button"
                aria-label="Nächste Woche"
                onClick={() => setDay(addDays(day, 7))}
              >
                <ChevronRight size={18} />
              </button>
              <button className="quiet" onClick={() => setDay(baseToday)}>
                Heute
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
                <span>{formatDate(date, { weekday: "short" })}</span>
                <strong>{formatDate(date, { day: "numeric" })}</strong>
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
                ? "Heute"
                : formatDate(day, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
              <span>
                {data.meals.filter((item) => item.date === day).length}{" "}
                Mahlzeiten
              </span>
            </h3>
            <button
              className="text-button"
              onClick={() =>
                setEditor({ type: "meal", value: { date: day } as Meal })
              }
            >
              <Plus size={16} /> Mahlzeit hinzufügen
            </button>
          </div>
          <div className="meal-list">
            {data.meals
              .filter((item) => item.date === day)
              .map((meal) => (
                <article className="meal-card" key={meal.id}>
                  <div className="meal-main">
                    <span className="eyebrow">
                      {mealSlotLabels[meal.slot]}{" "}
                      {meal.status === "eaten" ? "· GEGESSEN" : ""}
                    </span>
                    <h3>{meal.name}</h3>
                    <p>
                      <Users size={14} />
                      {formatNumber(meal.servings)} Portionen
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
                            { id: meal.id },
                            "Im Essensverlauf gespeichert.",
                          )
                        }
                      >
                        <Check size={15} />
                        <span>Als gegessen markieren</span>
                      </button>
                    ) : (
                      <span className="pill">
                        <Check size={14} /> Gegessen
                      </span>
                    )}
                    <button
                      className="icon-button"
                      aria-label={`Bearbeiten: ${meal.name}`}
                      onClick={() => setEditor({ type: "meal", value: meal })}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`Entfernen: ${meal.name}`}
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
              title="Keine Mahlzeiten geplant"
              text="Wähle ein Rezept oder trage eine Mahlzeit für diesen Tag ein."
              action="Mahlzeit planen"
              onClick={() =>
                setEditor({ type: "meal", value: { date: day } as Meal })
              }
            />
          )}
          <div className="plan-footer">
            <div>
              <ShoppingBasket size={23} />
              <div>
                <strong>Einkauf für diese Woche</strong>
                <p>Ergänze die fehlenden Zutaten aus deinem Wochenplan.</p>
              </div>
            </div>
            <button
              className="secondary"
              disabled={mutation.isPending || !planned.length}
              onClick={() =>
                perform(
                  "generate_groceries",
                  { from: monday, to: week[6] },
                  "Fehlende Zutaten zur Einkaufsliste hinzugefügt.",
                )
              }
            >
              Einkaufsliste erstellen <ArrowUpRight size={16} />
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
                aria-label="Rezepte durchsuchen"
                placeholder="Rezepte oder Zutaten suchen"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <span className="muted">{data.recipes.length} Rezepte</span>
          </div>
          <RecipeList
            recipes={data.recipes.filter((recipe) =>
              `${recipe.name} ${recipe.tags.join(" ")} ${recipe.ingredients.map((i) => i.name).join(" ")}`
                .toLocaleLowerCase("de")
                .includes(search.toLocaleLowerCase("de")),
            )}
            busy={mutation.isPending}
            onOpen={(recipe, servings) => {
              setDetailServings(servings);
              setDetail(recipe);
            }}
            onPlan={(recipe, servings) =>
              setEditor({ type: "meal", recipe, servings })
            }
            onEdit={(recipe) => setEditor({ type: "recipe", value: recipe })}
            onFavorite={(recipe) =>
              perform("update_recipe", {
                ...recipe,
                favorite: !recipe.favorite,
              })
            }
          />
          {!data.recipes.length && (
            <Empty
              icon={<BookOpen size={30} />}
              title="Noch keine Rezepte"
              text="Füge hier ein Rezept hinzu oder bitte deinen verbundenen Agenten darum."
              action="Rezept hinzufügen"
              onClick={() => setEditor({ type: "recipe" })}
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
                  {locationLabels[value as keyof typeof locationLabels]}
                </button>
              ))}
            </div>
            <span className="muted">{data.pantry.length} Artikel vorrätig</span>
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
                      {locationLabels[item.location]}
                      {item.expiresOn &&
                        ` · Haltbar bis ${formatDate(item.expiresOn)}`}
                    </small>
                  </div>
                  <span className="stock-quantity">
                    {formatNumber(item.quantity)}{" "}
                    <small>{unitLabels[item.unit]}</small>
                  </span>
                  {item.expiresOn && item.expiresOn < baseToday ? (
                    <span className="pill warning">Datum überschritten</span>
                  ) : (
                    item.expiresOn &&
                    item.expiresOn <= addDays(baseToday, 3) && (
                      <span className="pill amber">Bald verbrauchen</span>
                    )
                  )}
                  <button
                    className="icon-button"
                    aria-label={`Bearbeiten: ${item.name}`}
                    onClick={() => setEditor({ type: "pantry", value: item })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Entfernen: ${item.name}`}
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
              title="Noch keine Vorräte"
              text="Trage deine Vorräte ein, damit sie bei Planung und Einkauf berücksichtigt werden."
              action="Lebensmittel hinzufügen"
              onClick={() => setEditor({ type: "pantry" })}
            />
          )}
          <p className="helper-note">
            <Leaf size={16} /> Haltbarkeitsdaten helfen bei der Planung.
            Gegessene Mahlzeiten werden im Verlauf gespeichert; Vorratsmengen
            änderst du separat.
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
                Offen{" "}
                <span>
                  {data.groceries.filter((item) => !item.checked).length}
                </span>
              </button>
              <button
                className={showChecked ? "selected" : ""}
                aria-pressed={showChecked}
                onClick={() => setShowChecked(true)}
              >
                Gekauft{" "}
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
                      "Bring und LunchJu sind abgeglichen.",
                    )
                  : setTab("settings")
              }
            >
              <RefreshCw size={16} />
              {data.bring.connected
                ? "Mit Bring abgleichen"
                : "Bring verbinden"}
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
                    aria-label={`${item.checked ? "Wieder öffnen" : "Abhaken"} ${item.name}`}
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
                    {formatNumber(item.quantity)}{" "}
                    <small>{unitLabels[item.unit]}</small>
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Bearbeiten: ${item.name}`}
                    onClick={() => setEditor({ type: "grocery", value: item })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Entfernen: ${item.name}`}
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
                  ? "Noch nichts gekauft"
                  : "Die Einkaufsliste ist leer"
              }
              text={
                showChecked
                  ? "Gekaufte Artikel erscheinen hier."
                  : "Füge Artikel hinzu oder erstelle die Einkaufsliste aus deinem Wochenplan."
              }
              action="Artikel hinzufügen"
              onClick={() => setEditor({ type: "grocery" })}
            />
          )}
          <div className="shopping-note">
            <span className="bring-mark">b!</span>
            <div>
              <strong>Bring-Einkaufsliste Stuttgart</strong>
              <p>
                {data.bring.connected
                  ? "Die Bring-Liste Stuttgart ist verbunden. Du kannst sie jederzeit abgleichen."
                  : "Verbinde die Bring-Liste Stuttgart in den Einstellungen."}
              </p>
            </div>
          </div>
        </>
      )}
      {tab === "settings" && <Settings data={data} run={run} notify={notify} />}
      {editor && (
        <Modal
          title={`${{ recipe: "Rezept", meal: "Mahlzeit", pantry: "Lebensmittel", grocery: "Einkaufsartikel" }[editor.type]} ${editor.value?.id ? "bearbeiten" : "hinzufügen"}`}
          onClose={() => setEditor(null)}
        >
          <EditorForm
            editor={editor}
            data={data}
            busy={mutation.isPending}
            save={async (operation, input) => {
              await run(operation, input, "Gespeichert.");
              setEditor(null);
            }}
            onDelete={
              editor.value?.id
                ? () => {
                    remove(
                      editor.type,
                      editor.value as { id: string; name: string },
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
          recipe={detail}
          initialServings={detailServings}
          onImageSaved={(recipe) => {
            setDetail((current) =>
              current?.id === recipe.id ? recipe : current,
            );
            void client.invalidateQueries({ queryKey: ["catalog"] });
            notify("Rezeptbild gespeichert.");
          }}
          onClose={() => setDetail(null)}
          onPlan={(servings) => {
            setEditor({ type: "meal", recipe: detail, servings });
            setDetail(null);
          }}
          onEdit={() => {
            setEditor({ type: "recipe", value: detail });
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
            aria-label="Dialog schließen"
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
  const value = editor.value,
    [ingredients, setIngredients] = useState<Ingredient[]>(
      editor.type === "recipe"
        ? ((value as Recipe)?.ingredients ?? [
            { name: "", quantity: 1, unit: "piece" },
          ])
        : [],
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
          ? { recipeId: str("recipeId") }
          : { name: str("name") }),
      };
      operation = value?.id ? "update_meal" : "plan_meal";
    } else {
      input = {
        name: str("name"),
        quantity: number("quantity"),
        unit: str("unit"),
        notes: str("notes"),
        ...(value?.id ? { checked: (value as Grocery).checked } : {}),
      };
      operation = value?.id ? "update_grocery" : "add_grocery";
    }
    if (value?.id) input.id = value.id;
    setError("");
    try {
      await save(operation, input);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      );
    }
  }
  return (
    <form className="editor-form" onSubmit={submit}>
      {editor.type !== "meal" && (
        <Field
          label={
            editor.type === "recipe" ? "Rezeptname" : "Lebensmittel oder Zutat"
          }
        >
          <input
            name="name"
            required
            maxLength={160}
            placeholder={
              editor.type === "recipe"
                ? "Pasta mit Tomatensoße"
                : "z. B. Kirschtomaten"
            }
            defaultValue={value?.name}
          />
        </Field>
      )}
      {editor.type === "recipe" && (
        <>
          <Field label="Beschreibung">
            <textarea
              name="description"
              rows={2}
              maxLength={3000}
              defaultValue={(value as Recipe)?.description}
              placeholder="Ein schnelles Abendessen, fertig in einer halben Stunde."
            />
          </Field>
          <div className="form-row">
            <Field label="Portionen">
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
            <Field label="Zeit in Minuten">
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
            <strong>Zutaten</strong>
            <small>Für die angegebene Portionszahl</small>
          </div>
          {ingredients.map((ingredient, index) => (
            <div className="ingredient-editor" key={index}>
              <div className="ingredient-input">
                <label className="sr-only" htmlFor={`ing-${index}`}>
                  Zutat {index + 1}
                </label>
                <input
                  id={`ing-${index}`}
                  name={`ingredient-${index}`}
                  value={ingredient.name}
                  onChange={(event) =>
                    setIngredients((items) =>
                      items.map((item, i) =>
                        i === index
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    )
                  }
                  placeholder="Zutat"
                  required
                  maxLength={160}
                />
                <input
                  name={`quantity-${index}`}
                  aria-label={`Menge für Zutat ${index + 1}`}
                  type="number"
                  value={ingredient.quantity}
                  onChange={(event) =>
                    setIngredients((items) =>
                      items.map((item, i) =>
                        i === index
                          ? { ...item, quantity: Number(event.target.value) }
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
                  aria-label={`Einheit für Zutat ${index + 1}`}
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
                      {unitLabels[unit as keyof typeof unitLabels]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button"
                  disabled={ingredients.length <= 1}
                  aria-label={`Zutat ${index + 1} entfernen`}
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
                  Skalierung
                  {ingredient.scaling?.mode === "fixed" ||
                  ingredient.scaling?.roundUpTo ||
                  ingredient.scaling?.note
                    ? " · Sonderregel"
                    : " anpassen"}
                </summary>
                <div className="form-row">
                  <Field label="Menge bei anderer Personenzahl">
                    <select
                      aria-label={`Skalierung für Zutat ${index + 1}`}
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
                        Mit der Personenzahl anpassen
                      </option>
                      <option value="fixed">Menge gleich lassen</option>
                    </select>
                  </Field>
                  <Field
                    label={`Aufrunden auf (${unitLabels[ingredient.unit]}, optional)`}
                  >
                    <input
                      type="number"
                      min="0.001"
                      max="100000"
                      step="any"
                      value={ingredient.scaling?.roundUpTo ?? ""}
                      aria-label={`Aufrunden für Zutat ${index + 1}`}
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
                      placeholder="z. B. 1 für ganze Eier"
                    />
                  </Field>
                </div>
                <Field label="Hinweis zur Zutat (optional)">
                  <input
                    maxLength={500}
                    value={ingredient.scaling?.note ?? ""}
                    aria-label={`Skalierungshinweis für Zutat ${index + 1}`}
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
                    placeholder="z. B. Gewürze zum Schluss abschmecken"
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
                { name: "", quantity: 1, unit: "piece" },
              ])
            }
          >
            <Plus size={16} /> Zutat hinzufügen
          </button>
          <Field label="Zubereitungsschritte, einer pro Zeile">
            <textarea
              name="instructions"
              required
              rows={5}
              maxLength={30000}
              defaultValue={(value as Recipe)?.instructions.join("\n")}
              placeholder={
                "Gemüse schneiden.\nEtwas Olivenöl in einer Pfanne erhitzen.\nZutaten anbraten und abschmecken."
              }
            />
          </Field>
          <Field label="Hinweise für andere Personenzahlen (optional)">
            <textarea
              name="scalingNotes"
              rows={2}
              maxLength={2000}
              defaultValue={(value as Recipe)?.scalingNotes}
              placeholder="z. B. Ab 6 Personen in zwei Pfannen braten. Garzeit bleibt gleich."
            />
          </Field>
          <Field label="Schlagwörter, durch Kommas getrennt">
            <input
              name="tags"
              defaultValue={(value as Recipe)?.tags.join(", ")}
              placeholder="Schnell, Vegetarisch, Lieblingsgericht"
            />
          </Field>
          <Field label="Link zum Originalrezept (optional)">
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
          <Field label="Menge">
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
          <Field label="Einheit">
            <select
              name="unit"
              defaultValue={(value as PantryItem | Grocery)?.unit ?? "piece"}
            >
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {unitLabels[unit as keyof typeof unitLabels]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {editor.type === "pantry" && (
        <div className="form-row">
          <Field label="Lagerort">
            <select
              name="location"
              defaultValue={(value as PantryItem)?.location ?? "Pantry"}
            >
              {["Pantry", "Fridge", "Freezer"].map((value) => (
                <option key={value} value={value}>
                  {locationLabels[value as keyof typeof locationLabels]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Haltbar bis (optional)">
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
          <Field label="Rezept auswählen">
            <select
              name="recipeId"
              defaultValue={
                (value as Meal)?.recipeId ?? editor.recipe?.id ?? ""
              }
            >
              <option value="">Mahlzeit ohne Rezept</option>
              {data.recipes.map((recipe) => (
                <option value={recipe.id} key={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mahlzeit (ohne ausgewähltes Rezept)">
            <input
              name="name"
              maxLength={160}
              defaultValue={value?.name ?? ""}
              placeholder="z. B. Essen gehen, Reste, selbstgemachte Pizza"
            />
          </Field>
          <div className="form-row">
            <Field label="Datum">
              <input
                name="date"
                type="date"
                required
                defaultValue={
                  (value as Meal)?.date ?? today(data.home.timeZone)
                }
              />
            </Field>
            <Field label="Mahlzeit">
              <select
                name="slot"
                defaultValue={(value as Meal)?.slot ?? "dinner"}
              >
                {["breakfast", "lunch", "dinner", "snack"].map((slot) => (
                  <option key={slot} value={slot}>
                    {mealSlotLabels[slot as keyof typeof mealSlotLabels]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-row">
            <Field label="Portionen">
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
            <Field label="Status">
              <select
                name="status"
                defaultValue={(value as Meal)?.status ?? "planned"}
              >
                <option value="planned">Geplant</option>
                <option value="eaten">Gegessen</option>
              </select>
            </Field>
          </div>
        </>
      )}
      {(editor.type === "meal" || editor.type === "grocery") && (
        <Field label="Notizen (optional)">
          <textarea
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={(value as Meal | Grocery)?.notes}
            placeholder="Weitere Hinweise"
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
            <Trash2 size={16} /> Entfernen
          </button>
        )}
        <button className="primary" disabled={busy}>
          <Check size={17} />
          {busy ? "Wird gespeichert…" : "Speichern"}
        </button>
      </div>
    </form>
  );
}
function RecipeDetail({
  recipe,
  initialServings,
  onImageSaved,
  onClose,
  onPlan,
  onEdit,
}: {
  recipe: Recipe;
  initialServings: number;
  onImageSaved: (recipe: Recipe) => void;
  onClose: () => void;
  onPlan: (servings: number) => void;
  onEdit: () => void;
}) {
  const [people, setPeople] = useState(String(initialServings));
  const servings = personCount(people);
  const ingredients =
    servings === null ? [] : scaleIngredients(recipe, servings);
  const check = useQuery({
    queryKey: ["readiness", recipe.id, recipe.updatedAt, servings],
    enabled: servings !== null,
    queryFn: () =>
      action<{ canCook: boolean; missing: Ingredient[] }>("check_ingredients", {
        recipeId: recipe.id,
        servings,
      }),
  });
  return (
    <Modal title={recipe.name} onClose={onClose}>
      <div className="recipe-detail">
        <RecipeImageEditor recipe={recipe} onSaved={onImageSaved} />
        <p>{recipe.description}</p>
        <div className="detail-controls">
          <span>
            <Clock size={16} />
            {formatNumber(recipe.minutes)} Minuten
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
            ? "Wähle eine Personenzahl zwischen 0,1 und 100."
            : check.isPending
              ? "Vorräte werden geprüft…"
              : check.error
                ? "Vorräte konnten nicht geprüft werden."
                : check.data?.canCook
                  ? "Alle Zutaten sind vorhanden."
                  : `${check.data?.missing.length} Zutaten fehlen.`}
        </div>
        {recipe.scalingNotes && (
          <aside className="scaling-notes">
            <strong>Hinweise zur Personenzahl</strong>
            <p>{recipe.scalingNotes}</p>
          </aside>
        )}
        <h3>Zutaten</h3>
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
                        ? "Menge bleibt gleich"
                        : "",
                      item.scaling.roundUpTo
                        ? `Auf ${formatNumber(item.scaling.roundUpTo)} ${unitLabels[item.unit]} aufgerundet`
                        : "",
                      item.scaling.note,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                )}
              </span>
              <strong>
                {formatNumber(item.quantity)} {unitLabels[item.unit]}
              </strong>
            </li>
          ))}
        </ul>
        <h3>Zubereitung</h3>
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
            Originalrezept <ArrowUpRight size={16} />
          </a>
        )}
        <div className="form-footer">
          <button className="secondary" onClick={onEdit}>
            <Pencil size={16} /> Rezept bearbeiten
          </button>
          <button
            className="primary"
            disabled={servings === null}
            onClick={() => onPlan(servings!)}
          >
            <CalendarDays size={16} /> Mahlzeit planen
          </button>
        </div>
      </div>
    </Modal>
  );
}
function RecipeImageEditor({
  recipe,
  onSaved,
}: {
  recipe: Recipe;
  onSaved: (recipe: Recipe) => void;
}) {
  const [editing, setEditing] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const form = new FormData(event.currentTarget);
    form.set("image", file);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/recipes/${recipe.id}/image`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const result = (await response.json()) as Recipe & { error?: string };
      if (!response.ok)
        throw new ApiError(
          result.error || "Das Bild konnte nicht gespeichert werden.",
        );
      onSaved(result);
      setFile(null);
      setEditing(false);
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error.message
          : "Das Bild konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="recipe-image-editor" aria-label="Rezeptbild">
      {(preview || recipe.imageUrl) && (
        <img
          className="recipe-cover"
          src={preview || recipe.imageUrl!}
          alt={recipe.imageAlt || recipe.name}
          width={560}
          height={350}
        />
      )}
      {!editing ? (
        <div className="image-actions">
          <button
            className="text-button"
            onClick={() => {
              setEditing(true);
              setError("");
            }}
          >
            <ImagePlus size={17} />
            {recipe.imageUrl ? "Bild ersetzen" : "Bild hinzufügen"}
          </button>
          {recipe.imageUrl && (
            <button
              className="text-button danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Dieses Rezeptbild entfernen?")) return;
                setBusy(true);
                setError("");
                try {
                  onSaved(
                    await action<Recipe>("delete_recipe_image", {
                      recipeId: recipe.id,
                    }),
                  );
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Das Bild konnte nicht entfernt werden.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={15} />
              Bild entfernen
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={upload}>
          <Field label="Rezeptbild (JPG, PNG oder WebP, bis 5 MB)">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              disabled={busy}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                setError("");
                if (selected && selected.size > 5 * 1024 * 1024) {
                  setError("Bilder dürfen höchstens 5 MB groß sein.");
                  event.target.value = "";
                  setFile(null);
                } else setFile(selected ?? null);
              }}
            />
          </Field>
          <Field label="Bildbeschreibung">
            <input
              name="altText"
              maxLength={500}
              defaultValue={recipe.imageAlt || recipe.name}
              placeholder="Beschreibe das Gericht auf dem Bild"
              disabled={busy}
            />
          </Field>
          <div className="button-row">
            <button className="secondary" disabled={busy || !file}>
              {busy ? "Wird hochgeladen…" : "Bild speichern"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setFile(null);
                setError("");
              }}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
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
  const client = useQueryClient(),
    [busy, setBusy] = useState(false),
    [invitation, setInvitation] = useState("");
  const owner = data.user.role === "owner";
  const members = useQuery({
    queryKey: ["members"],
    queryFn: () =>
      action<{ members: (User & { active: number })[] }>("list_members"),
    enabled: owner,
  });
  const keys = useQuery({
    queryKey: ["passkeys"],
    queryFn: () =>
      action<{ passkeys: { id: string; name: string; created_at: string }[] }>(
        "list_passkeys",
      ),
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
        label: `Passkey ${new Date().toLocaleDateString("de-DE")}`,
      });
      const response = await startRegistration({ optionsJSON: options });
      await request("/api/auth/register/verify", response);
      await client.invalidateQueries({ queryKey: ["passkeys"] });
      notify("Passkey hinzugefügt.");
    } catch (error) {
      notify(passkeyError(error));
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("In die Zwischenablage kopiert.");
    } catch {
      notify("Markiere und kopiere den Link unten.");
    }
  }
  return (
    <div className="settings-grid">
      <section className="settings-card agent-settings">
        <span className="soft-icon">
          <Bot size={26} />
        </span>
        <h2>Agentenzugang</h2>
        <p>
          Dein Agent kann Rezepte, Vorräte und Mahlzeiten für Stuttgart
          verwalten. Seine Berechtigungen legst du beim Verbinden fest.
        </p>
        <label className="copy-field">
          <span className="sr-only">MCP-Verbindungsadresse</span>
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
            aria-label="MCP-Adresse kopieren"
            onClick={() => copy(`${window.location.origin}/mcp`)}
          >
            <Copy size={17} />
          </button>
        </label>
        <small>
          Füge diese MCP-Adresse in den Einstellungen deines Agenten hinzu und
          wähle OAuth. Melde dich mit deinem LunchJu-Passkey an.
        </small>
        <a className="secondary" href="/oauth/grants">
          Verbundene Agenten verwalten <ArrowUpRight size={16} />
        </a>
        <div className="example-prompt">
          „Plane drei vegetarische Abendessen und ergänze die fehlenden Zutaten
          auf der Einkaufsliste.“
        </div>
      </section>
      <section className="settings-card">
        <span className="soft-icon">
          <KeyRound size={24} />
        </span>
        <h2>Passkeys</h2>
        <p>
          Nutze Passkeys auf deinen Geräten oder über einen synchronisierten
          Passwortmanager. Hinterlege vor einem Gerätewechsel einen weiteren
          Passkey.
        </p>
        {keys.data?.passkeys.map((key) => (
          <div className="settings-list-row" key={key.id}>
            <KeyRound size={16} />
            <span>
              {key.name}
              <small>
                {new Date(key.created_at).toLocaleDateString("de-DE")}
              </small>
            </span>
            <button
              className="icon-button danger"
              disabled={busy || (keys.data?.passkeys.length ?? 0) < 2}
              aria-label={`Entfernen: ${key.name}`}
              onClick={() => {
                if (confirm("Diesen Passkey entfernen?"))
                  void doRun(
                    "delete_passkey",
                    { credentialId: key.id },
                    "Passkey entfernt.",
                  );
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {keys.error && <p className="error">{keys.error.message}</p>}
        <button className="secondary" disabled={busy} onClick={addPasskey}>
          <Plus size={17} /> Passkey hinzufügen
        </button>
        <button
          className="text-button"
          onClick={async () => {
            await request("/api/auth/logout", {});
            client.clear();
            location.assign("/");
          }}
        >
          <LogOut size={16} /> Abmelden
        </button>
      </section>
      <section className="settings-card">
        <span className="bring-mark">b!</span>
        <h2>Bring</h2>
        <p>
          Verbunden wird ausschließlich die Bring-Liste Stuttgart. Neue und
          abgehakte Artikel werden beim Abgleich in beide Richtungen übernommen.
        </p>
        {owner ? (
          data.bring.connected ? (
            <>
              <p className="helper-note">
                Verbundene Liste: <strong>Stuttgart</strong>
              </p>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy || !data.bring.listId}
                  onClick={() =>
                    void doRun(
                      "bring_sync",
                      {},
                      "Die Bring-Einkaufsliste ist abgeglichen.",
                    )
                  }
                >
                  <RefreshCw size={16} /> Jetzt abgleichen
                </button>
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Bring trennen und die gespeicherten Zugangstokens löschen?",
                      )
                    )
                      void doRun(
                        "bring_disconnect",
                        {},
                        "Bring wurde getrennt.",
                      );
                  }}
                >
                  Trennen
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
                  { email: form.get("email"), password: form.get("password") },
                  "Bring ist mit Stuttgart verbunden.",
                );
                if (result) element.reset();
              }}
            >
              <Field label="Bring-E-Mail">
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                />
              </Field>
              <Field label="Bring-Passwort">
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <button className="secondary" disabled={busy}>
                {busy ? "Verbindung wird hergestellt…" : "Bring verbinden"}
              </button>
              <small>
                Das Passwort wird nur zur Anmeldung bei Bring verwendet und
                nicht gespeichert.
              </small>
            </form>
          )
        ) : (
          <p className="helper-note">
            Die Bring-Verbindung wird vom Haushaltsinhaber verwaltet. Alle
            Mitglieder können die Einkaufsliste abgleichen.
          </p>
        )}
      </section>
      <section className="settings-card">
        <span className="soft-icon">
          <Leaf size={24} />
        </span>
        <h2>Ernährungswünsche</h2>
        <p>
          Dein Agent berücksichtigt diese Wünsche bei der Planung. Prüfe die
          Zutaten bei Allergien immer selbst.
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
              "Ernährungswünsche gespeichert.",
            );
          }}
        >
          <Field label="Ernährungsweise">
            <input
              name="diet"
              defaultValue={data.preferences.diet}
              placeholder="z. B. vegetarisch, flexibel, eiweißreich"
              maxLength={160}
            />
          </Field>
          <Field label="Allergien (durch Kommas getrennt)">
            <input
              name="allergies"
              defaultValue={data.preferences.allergies.join(", ")}
              placeholder="z. B. Erdnüsse, Sesam"
            />
          </Field>
          <Field label="Notizen">
            <textarea
              name="notes"
              rows={3}
              defaultValue={data.preferences.notes}
              maxLength={3000}
              placeholder="Unter der Woche schnelle Gerichte. Nicht zu scharf."
            />
          </Field>
          <button className="secondary" disabled={busy}>
            <Check size={16} /> Ernährungswünsche speichern
          </button>
        </form>
      </section>
      {owner && (
        <section className="settings-card">
          <span className="soft-icon">
            <Users size={24} />
          </span>
          <h2>Mitglieder</h2>
          <p>
            Ein gemeinsamer Haushalt in Stuttgart. Einladungen sind einmal
            verwendbar und laufen nach 24 Stunden ab.
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
                    ? "Haushaltsinhaber"
                    : member.active
                      ? "Mitglied"
                      : "Zugang deaktiviert"}
                </small>
              </span>
              {member.role !== "owner" && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void doRun(
                      "set_member_active",
                      { id: member.id, active: !member.active },
                      "Mitgliederzugang aktualisiert.",
                    )
                  }
                >
                  {member.active ? "Deaktivieren" : "Aktivieren"}
                </button>
              )}
            </div>
          ))}
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              const result = (await doRun("create_invitation")) as
                { url: string } | undefined;
              if (result) setInvitation(result.url);
            }}
          >
            <Plus size={16} /> Person einladen
          </button>
          {invitation && (
            <label className="copy-field">
              <input readOnly aria-label="Einladungslink" value={invitation} />
              <button
                className="icon-button"
                aria-label="Einladung kopieren"
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
