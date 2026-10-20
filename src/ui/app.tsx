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
  Heart,
  Trash2,
  Pencil,
  RefreshCw,
  LogOut,
  ArrowUpRight,
  Copy,
  Leaf,
  Utensils,
} from "lucide-react";
import type {
  Catalog,
  Recipe,
  PantryItem,
  Meal,
  Grocery,
  Ingredient,
  User,
} from "../shared";
import { action, request, today, addDays, formatDate } from "./api";

type Data = Catalog & {
  preferences: { diet: string; allergies: string[]; notes: string };
};
type Tab = "today" | "recipes" | "pantry" | "groceries" | "settings";
type Editor = {
  type: "recipe" | "pantry" | "meal" | "grocery";
  value?: Recipe | PantryItem | Meal | Grocery;
  recipe?: Recipe;
};
const tabs = [
  { id: "today", name: "Meal plan", icon: CalendarDays },
  { id: "recipes", name: "Recipes", icon: BookOpen },
  { id: "pantry", name: "Pantry", icon: PackageOpen },
  { id: "groceries", name: "Groceries", icon: ShoppingBasket },
  { id: "settings", name: "Settings", icon: Settings2 },
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
        <p>Loading…</p>
      </div>
    );
  if (session.error)
    return (
      <div className="auth-page">
        <Brand />
        <h1>Unable to load LunchJu</h1>
        <p className="error">{session.error.message}</p>
        <p>Please try again in a moment.</p>
        <button onClick={() => session.refetch()}>Try again</button>
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
        <nav aria-label="Main navigation">
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
            <Bot size={18} /> Agent access <ArrowUpRight size={15} />
          </button>
          <button className="profile" onClick={() => setTab("settings")}>
            <span className="avatar">
              {session.data.user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{session.data.user.name}</strong>
              <small>
                {session.data.user.role === "owner"
                  ? "Home owner"
                  : "Household member"}
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
            aria-label="Your settings"
            onClick={() => setTab("settings")}
          >
            {session.data.user.name.slice(0, 1).toUpperCase()}
          </button>
        </header>
        <KitchenContent tab={tab} setTab={setTab} notify={setNotice} />
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
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
    <a className="brand" href="/" aria-label="LunchJu home">
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
      setError(
        error instanceof Error ? error.message : "Passkey sign-in failed.",
      );
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
        label: "My first passkey",
      });
      const response = await startRegistration({ optionsJSON: options });
      await request("/api/auth/register/verify", response);
      await onLogin();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Passkey setup failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="auth-intro">
          <span className="eyebrow">A SHARED KITCHEN NOTEBOOK</span>
          <h1>
            The kitchen
            <br />
            notebook.
          </h1>
          <p>
            A place for your recipes, the food you have, and the meals ahead.
          </p>
          <ol className="notebook-index">
            <li>
              <span>01</span>
              <strong>Recipes</strong>
              <small>The ones worth keeping</small>
            </li>
            <li>
              <span>02</span>
              <strong>Meal plan</strong>
              <small>What’s on this week</small>
            </li>
            <li>
              <span>03</span>
              <strong>Pantry</strong>
              <small>What you already have</small>
            </li>
            <li>
              <span>04</span>
              <strong>Groceries</strong>
              <small>What to pick up</small>
            </li>
          </ol>
        </div>
        <small>FOR YOUR HOUSEHOLD. OPEN TO YOUR AGENT.</small>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">
            {setup ? "FIRST-TIME SETUP" : "YOUR KITCHEN"}
          </span>
          <h2>
            {setup
              ? "Set up your home"
              : invite
                ? "Join your household"
                : "Sign in"}
          </h2>
          <p>
            {setup
              ? "Create the first account for your shared home."
              : invite
                ? `You're invited to join ${homeName}.`
                : `Sign in to ${homeName} with your passkey.`}
          </p>
          {setup || invite ? (
            <form onSubmit={register}>
              <Field label="Your name">
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Name"
                  required
                  maxLength={80}
                />
              </Field>
              {setup && (
                <Field label="One-time setup token">
                  <input
                    name="token"
                    type="password"
                    autoComplete="off"
                    required
                    placeholder="Setup token"
                  />
                  <small>
                    Use the private token provided when LunchJu was set up.
                  </small>
                </Field>
              )}
              <button className="primary full" disabled={busy}>
                <KeyRound size={18} />
                {busy
                  ? "Creating your passkey…"
                  : "Create account with a passkey"}
              </button>
            </form>
          ) : (
            <button className="primary full" disabled={busy} onClick={login}>
              <KeyRound size={18} />
              {busy ? "Waiting for your passkey…" : "Sign in with a passkey"}
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
                ? "Your fingerprint, face or device PIN creates your passkey."
                : "New here? Ask the home owner for an invitation."}
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
        `Remove “${value.name}”?${type === "recipe" ? " Existing meal history will be kept." : ""}`,
      )
    )
      perform(
        `delete_${type === "pantry" ? "pantry_item" : type}`,
        { id: value.id },
        "Removed from your kitchen.",
      );
  }
  if (query.isPending)
    return (
      <div className="loading-screen">
        <p>Loading your kitchen…</p>
      </div>
    );
  if (query.error)
    return (
      <section className="empty-state">
        <h2>Your kitchen couldn't load.</h2>
        <p className="error">{query.error.message}</p>
        <button onClick={() => query.refetch()}>Try again</button>
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
      ? "Meal plan"
      : tab === "recipes"
        ? "Recipes"
        : tab === "pantry"
          ? "Pantry"
          : tab === "groceries"
            ? "Groceries"
            : "Settings";
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
              ? "Plan the week. Keep track of what you eat."
              : tab === "recipes"
                ? "Your collection, ready to cook."
                : tab === "pantry"
                  ? "Food in stock, quantities, and expiry dates."
                  : tab === "groceries"
                    ? "A shared shopping list for your household."
                    : "Your household, connections, and account."}
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
                ? "Plan a meal"
                : tab === "recipes"
                  ? "Add recipe"
                  : tab === "pantry"
                    ? "Add food"
                    : "Add item"}
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
                  <small> meals</small>
                </strong>
                <span>planned for this week</span>
              </div>
            </div>
            <button className="overview-card" onClick={() => setTab("pantry")}>
              <div>
                <strong>
                  {expired.length}
                  <small> items</small>
                </strong>
                <span>to use soon</span>
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
                  <small> items</small>
                </strong>
                <span>to buy</span>
              </div>
              <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="section-heading">
            <div>
              <h2>Weekly plan</h2>
            </div>
            <div className="week-controls">
              <button
                className="icon-button"
                aria-label="Previous week"
                onClick={() => setDay(addDays(day, -7))}
              >
                <ChevronLeft size={18} />
              </button>
              <strong>
                {formatDate(monday)} — {formatDate(week[6])}
              </strong>
              <button
                className="icon-button"
                aria-label="Next week"
                onClick={() => setDay(addDays(day, 7))}
              >
                <ChevronRight size={18} />
              </button>
              <button className="quiet" onClick={() => setDay(baseToday)}>
                Today
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
                ? "Today"
                : formatDate(day, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
              <span>
                {data.meals.filter((item) => item.date === day).length} meals
              </span>
            </h3>
            <button
              className="text-button"
              onClick={() =>
                setEditor({ type: "meal", value: { date: day } as Meal })
              }
            >
              <Plus size={16} /> Add a meal
            </button>
          </div>
          <div className="meal-list">
            {data.meals
              .filter((item) => item.date === day)
              .map((meal) => (
                <article className="meal-card" key={meal.id}>
                  <div className="meal-main">
                    <span className="eyebrow">
                      {meal.slot} {meal.status === "eaten" ? "· EATEN" : ""}
                    </span>
                    <h3>{meal.name}</h3>
                    <p>
                      <Users size={14} />
                      {meal.servings} servings
                      {meal.notes && <> · {meal.notes}</>}
                    </p>
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
                            "Added to your food history.",
                          )
                        }
                      >
                        <Check size={15} />
                        <span>Mark eaten</span>
                      </button>
                    ) : (
                      <span className="pill">
                        <Check size={14} /> Eaten
                      </span>
                    )}
                    <button
                      className="icon-button"
                      aria-label={`Edit ${meal.name}`}
                      onClick={() => setEditor({ type: "meal", value: meal })}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`Remove ${meal.name}`}
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
              title="No meals planned"
              text="Choose a recipe or add a meal for this day."
              action="Plan a meal"
              onClick={() =>
                setEditor({ type: "meal", value: { date: day } as Meal })
              }
            />
          )}
          <div className="plan-footer">
            <div>
              <ShoppingBasket size={23} />
              <div>
                <strong>Shop for this week</strong>
                <p>Add missing ingredients from your planned meals.</p>
              </div>
            </div>
            <button
              className="secondary"
              disabled={mutation.isPending || !planned.length}
              onClick={() =>
                perform(
                  "generate_groceries",
                  { from: monday, to: week[6] },
                  "Missing ingredients added to groceries.",
                )
              }
            >
              Generate groceries <ArrowUpRight size={16} />
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
                aria-label="Search recipes"
                placeholder="Search recipes or ingredients"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <span className="muted">{data.recipes.length} recipes</span>
          </div>
          <div className="recipe-list">
            {data.recipes
              .filter((recipe) =>
                `${recipe.name} ${recipe.tags.join(" ")} ${recipe.ingredients.map((i) => i.name).join(" ")}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((recipe, index) => (
                <article className="recipe-row" key={recipe.id}>
                  <span className="recipe-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <button
                    className={`favorite ${recipe.favorite ? "is-favorite" : ""}`}
                    aria-label={
                      recipe.favorite ? "Remove favorite" : "Favorite recipe"
                    }
                    aria-pressed={recipe.favorite}
                    onClick={() =>
                      perform("update_recipe", {
                        ...recipe,
                        favorite: !recipe.favorite,
                      })
                    }
                  >
                    <Heart
                      size={18}
                      fill={recipe.favorite ? "currentColor" : "none"}
                    />
                  </button>
                  <div className="recipe-summary">
                    <div className="tag-row">
                      {recipe.tags.slice(0, 2).map((tag) => (
                        <span className="pill" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <button
                      className="recipe-title"
                      onClick={() => setDetail(recipe)}
                    >
                      {recipe.name}
                    </button>
                    <p>{recipe.description}</p>
                    <div className="recipe-meta">
                      <span>
                        <Clock size={14} />
                        {recipe.minutes} min
                      </span>
                      <span>
                        <Users size={14} />
                        {recipe.servings} servings
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`Edit ${recipe.name}`}
                        onClick={() =>
                          setEditor({ type: "recipe", value: recipe })
                        }
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
          </div>
          {!data.recipes.length && (
            <Empty
              icon={<BookOpen size={30} />}
              title="No recipes yet"
              text="Add a recipe here, or ask your connected agent to add one."
              action="Add a recipe"
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
                  {value}
                </button>
              ))}
            </div>
            <span className="muted">{data.pantry.length} items in stock</span>
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
                      {item.location}
                      {item.expiresOn &&
                        ` · Best before ${formatDate(item.expiresOn)}`}
                    </small>
                  </div>
                  <span className="stock-quantity">
                    {item.quantity} <small>{item.unit}</small>
                  </span>
                  {item.expiresOn && item.expiresOn < baseToday ? (
                    <span className="pill warning">Past date</span>
                  ) : (
                    item.expiresOn &&
                    item.expiresOn <= addDays(baseToday, 3) && (
                      <span className="pill amber">Use soon</span>
                    )
                  )}
                  <button
                    className="icon-button"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => setEditor({ type: "pantry", value: item })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Remove ${item.name}`}
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
              title="Your pantry is empty"
              text="Add what you have so meal planning and shopping can account for it."
              action="Add food"
              onClick={() => setEditor({ type: "pantry" })}
            />
          )}
          <p className="helper-note">
            <Leaf size={16} /> Expiry dates help planning. Recording a meal
            keeps its history; update stock quantities separately.
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
                To buy{" "}
                <span>
                  {data.groceries.filter((item) => !item.checked).length}
                </span>
              </button>
              <button
                className={showChecked ? "selected" : ""}
                aria-pressed={showChecked}
                onClick={() => setShowChecked(true)}
              >
                Purchased{" "}
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
                      "Your Bring list and LunchJu are in sync.",
                    )
                  : setTab("settings")
              }
            >
              <RefreshCw size={16} />
              {data.bring.connected ? "Sync with Bring" : "Connect Bring"}
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
                    aria-label={`${item.checked ? "Uncheck" : "Check off"} ${item.name}`}
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
                    {item.quantity} <small>{item.unit}</small>
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => setEditor({ type: "grocery", value: item })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Remove ${item.name}`}
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
              title={showChecked ? "No purchased items" : "Nothing to buy"}
              text={
                showChecked
                  ? "Purchased items will show up here."
                  : "Add a few essentials, or generate a shopping list from your meal plan."
              }
              action="Add an item"
              onClick={() => setEditor({ type: "grocery" })}
            />
          )}
          <div className="shopping-note">
            <span className="bring-mark">b!</span>
            <div>
              <strong>Bring shopping list</strong>
              <p>
                {data.bring.connected
                  ? "Your shared Bring list is connected. Sync whenever you’re ready."
                  : "Connect your Bring list in Settings to sync groceries."}
              </p>
            </div>
          </div>
        </>
      )}
      {tab === "settings" && <Settings data={data} run={run} notify={notify} />}
      {editor && (
        <Modal
          title={`${editor.value?.id ? "Edit" : "Add"} ${editor.type === "pantry" ? "food" : editor.type === "grocery" ? "grocery item" : editor.type}`}
          onClose={() => setEditor(null)}
        >
          <EditorForm
            editor={editor}
            data={data}
            busy={mutation.isPending}
            save={async (operation, input) => {
              await run(operation, input, "Saved to your kitchen.");
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
          recipe={detail}
          onClose={() => setDetail(null)}
          onPlan={() => {
            setEditor({ type: "meal", recipe: detail });
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
            aria-label="Close dialog"
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
        ingredients: ingredients.map((_, index) => ({
          name: str(`ingredient-${index}`),
          quantity: number(`quantity-${index}`),
          unit: str(`unit-${index}`),
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
      setError(error instanceof Error ? error.message : "Could not save.");
    }
  }
  return (
    <form className="editor-form" onSubmit={submit}>
      {editor.type !== "meal" && (
        <Field
          label={
            editor.type === "recipe" ? "Recipe name" : "Food or ingredient"
          }
        >
          <input
            name="name"
            required
            maxLength={160}
            placeholder={
              editor.type === "recipe"
                ? "The pasta everyone asks for"
                : "e.g. Cherry tomatoes"
            }
            defaultValue={value?.name}
          />
        </Field>
      )}
      {editor.type === "recipe" && (
        <>
          <Field label="Description">
            <textarea
              name="description"
              rows={2}
              maxLength={3000}
              defaultValue={(value as Recipe)?.description}
              placeholder="A weeknight favorite, ready in half an hour."
            />
          </Field>
          <div className="form-row">
            <Field label="Servings">
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
            <Field label="Time, in minutes">
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
            <strong>Ingredients</strong>
            <small>For the servings above</small>
          </div>
          {ingredients.map((ingredient, index) => (
            <div className="ingredient-input" key={index}>
              <label className="sr-only" htmlFor={`ing-${index}`}>
                Ingredient {index + 1}
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
                placeholder="Ingredient"
                required
                maxLength={160}
              />
              <input
                name={`quantity-${index}`}
                aria-label={`Quantity for ingredient ${index + 1}`}
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
                aria-label={`Unit for ingredient ${index + 1}`}
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
                  <option key={unit}>{unit}</option>
                ))}
              </select>
              <button
                type="button"
                className="icon-button"
                disabled={ingredients.length <= 1}
                aria-label={`Remove ingredient ${index + 1}`}
                onClick={() =>
                  setIngredients((items) => items.filter((_, i) => i !== index))
                }
              >
                <X size={15} />
              </button>
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
            <Plus size={16} /> Add ingredient
          </button>
          <Field label="Cooking steps, one per line">
            <textarea
              name="instructions"
              required
              rows={5}
              maxLength={30000}
              defaultValue={(value as Recipe)?.instructions.join("\n")}
              placeholder={
                "Chop the vegetables.\nWarm the pan and add a little olive oil.\nBring everything together and enjoy."
              }
            />
          </Field>
          <Field label="Tags, separated by commas">
            <input
              name="tags"
              defaultValue={(value as Recipe)?.tags.join(", ")}
              placeholder="Weeknight, Vegetarian, Family favorite"
            />
          </Field>
          <Field label="Original recipe link (optional)">
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
          <Field label="Quantity">
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
          <Field label="Unit">
            <select
              name="unit"
              defaultValue={(value as PantryItem | Grocery)?.unit ?? "piece"}
            >
              {units.map((unit) => (
                <option key={unit}>{unit}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {editor.type === "pantry" && (
        <div className="form-row">
          <Field label="Where is it?">
            <select
              name="location"
              defaultValue={(value as PantryItem)?.location ?? "Pantry"}
            >
              {["Pantry", "Fridge", "Freezer"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Best before (optional)">
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
          <Field label="Choose a recipe">
            <select
              name="recipeId"
              defaultValue={
                (value as Meal)?.recipeId ?? editor.recipe?.id ?? ""
              }
            >
              <option value="">A meal outside the recipe book</option>
              {data.recipes.map((recipe) => (
                <option value={recipe.id} key={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Meal name (used when no recipe is selected)">
            <input
              name="name"
              maxLength={160}
              defaultValue={value?.name ?? ""}
              placeholder="e.g. Dinner out, leftovers, homemade pizza"
            />
          </Field>
          <div className="form-row">
            <Field label="Date">
              <input
                name="date"
                type="date"
                required
                defaultValue={
                  (value as Meal)?.date ?? today(data.home.timeZone)
                }
              />
            </Field>
            <Field label="Meal">
              <select
                name="slot"
                defaultValue={(value as Meal)?.slot ?? "dinner"}
              >
                {["breakfast", "lunch", "dinner", "snack"].map((slot) => (
                  <option key={slot}>{slot}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-row">
            <Field label="Servings">
              <input
                name="servings"
                type="number"
                min="0.1"
                max="100"
                step="any"
                required
                defaultValue={
                  (value as Meal)?.servings ?? editor.recipe?.servings ?? 2
                }
              />
            </Field>
            <Field label="Status">
              <select
                name="status"
                defaultValue={(value as Meal)?.status ?? "planned"}
              >
                <option value="planned">Planned</option>
                <option value="eaten">Eaten</option>
              </select>
            </Field>
          </div>
        </>
      )}
      {(editor.type === "meal" || editor.type === "grocery") && (
        <Field label="Notes (optional)">
          <textarea
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={(value as Meal | Grocery)?.notes}
            placeholder="Anything worth remembering?"
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
            <Trash2 size={16} /> Remove
          </button>
        )}
        <button className="primary" disabled={busy}>
          <Check size={17} />
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
function RecipeDetail({
  recipe,
  onClose,
  onPlan,
  onEdit,
}: {
  recipe: Recipe;
  onClose: () => void;
  onPlan: () => void;
  onEdit: () => void;
}) {
  const [servings, setServings] = useState(recipe.servings);
  const check = useQuery({
    queryKey: ["readiness", recipe.id, servings],
    queryFn: () =>
      action<{ canCook: boolean; missing: Ingredient[] }>("check_ingredients", {
        recipeId: recipe.id,
        servings,
      }),
  });
  return (
    <Modal title={recipe.name} onClose={onClose}>
      <div className="recipe-detail">
        <p>{recipe.description}</p>
        <div className="detail-controls">
          <span>
            <Clock size={16} />
            {recipe.minutes} minutes
          </span>
          <label>
            Servings{" "}
            <input
              type="number"
              min="0.1"
              max="100"
              step="any"
              value={servings}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value > 0 && value <= 100) setServings(value);
              }}
            />
          </label>
        </div>
        <div className={check.data?.canCook ? "readiness ready" : "readiness"}>
          <PackageOpen size={19} />
          {check.isPending
            ? "Checking your pantry…"
            : check.error
              ? "Pantry check unavailable."
              : check.data?.canCook
                ? "You have everything you need."
                : `${check.data?.missing.length} ingredients to pick up.`}
        </div>
        <h3>Ingredients</h3>
        <ul className="ingredients-list">
          {recipe.ingredients.map((item, index) => (
            <li key={index}>
              <span>{item.name}</span>
              <strong>
                {Math.round(
                  ((item.quantity * servings) / recipe.servings) * 100,
                ) / 100}{" "}
                {item.unit}
              </strong>
            </li>
          ))}
        </ul>
        <h3>Method</h3>
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
            Original recipe <ArrowUpRight size={16} />
          </a>
        )}
        <div className="form-footer">
          <button className="secondary" onClick={onEdit}>
            <Pencil size={16} /> Edit recipe
          </button>
          <button className="primary" onClick={onPlan}>
            <CalendarDays size={16} /> Plan this meal
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
  const lists = useQuery({
    queryKey: ["bringLists"],
    queryFn: () =>
      action<{ lists: { listUuid: string; name: string }[] }>("bring_lists"),
    enabled: owner && data.bring.connected,
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
        label: `Passkey ${new Date().toLocaleDateString()}`,
      });
      const response = await startRegistration({ optionsJSON: options });
      await request("/api/auth/register/verify", response);
      await client.invalidateQueries({ queryKey: ["passkeys"] });
      notify("Passkey added.");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Passkey could not be added.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("Copied to clipboard.");
    } catch {
      notify("Select and copy the link below.");
    }
  }
  return (
    <div className="settings-grid">
      <section className="settings-card agent-settings">
        <span className="soft-icon">
          <Bot size={26} />
        </span>
        <h2>Agent access</h2>
        <p>
          Your agent can browse the whole kitchen, add recipes, plan meals and
          check what you need. You choose its permissions when connecting.
        </p>
        <label className="copy-field">
          <span className="sr-only">MCP connection URL</span>
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
            aria-label="Copy MCP URL"
            onClick={() => copy(`${window.location.origin}/mcp`)}
          >
            <Copy size={17} />
          </button>
        </label>
        <small>
          Add this MCP URL in your agent’s settings and choose OAuth. Sign in
          using your LunchJu passkey.
        </small>
        <a className="secondary" href="/oauth/grants">
          Manage connected agents <ArrowUpRight size={16} />
        </a>
        <div className="example-prompt">
          “Plan three vegetarian dinners and add the missing ingredients to
          groceries.”
        </div>
      </section>
      <section className="settings-card">
        <span className="soft-icon">
          <KeyRound size={24} />
        </span>
        <h2>Passkeys</h2>
        <p>
          Use a passkey on each device or a synced password manager. Keep a
          spare before replacing a device.
        </p>
        {keys.data?.passkeys.map((key) => (
          <div className="settings-list-row" key={key.id}>
            <KeyRound size={16} />
            <span>
              {key.name}
              <small>{new Date(key.created_at).toLocaleDateString()}</small>
            </span>
            <button
              className="icon-button danger"
              disabled={busy || (keys.data?.passkeys.length ?? 0) < 2}
              aria-label={`Remove ${key.name}`}
              onClick={() => {
                if (confirm("Remove this passkey?"))
                  void doRun(
                    "delete_passkey",
                    { credentialId: key.id },
                    "Passkey removed.",
                  );
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {keys.error && <p className="error">{keys.error.message}</p>}
        <button className="secondary" disabled={busy} onClick={addPasskey}>
          <Plus size={17} /> Add a passkey
        </button>
        <button
          className="text-button"
          onClick={async () => {
            await request("/api/auth/logout", {});
            client.clear();
            location.assign("/");
          }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </section>
      <section className="settings-card">
        <span className="bring-mark">b!</span>
        <h2>Bring</h2>
        <p>
          Connect one shared Bring shopping list. New items and checked-off
          groceries sync both ways when you press Sync.
        </p>
        {owner ? (
          data.bring.connected ? (
            <>
              <Field label="Your Bring shopping list">
                <select
                  value={data.bring.listId ?? ""}
                  disabled={busy}
                  onChange={(event) => {
                    if (event.target.value)
                      void doRun(
                        "bring_choose_list",
                        { listId: event.target.value },
                        "Bring list selected.",
                      );
                  }}
                >
                  <option value="">Choose a list</option>
                  {lists.data?.lists.map((list) => (
                    <option key={list.listUuid} value={list.listUuid}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </Field>
              {lists.error && <p className="error">{lists.error.message}</p>}
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy || !data.bring.listId}
                  onClick={() =>
                    void doRun(
                      "bring_sync",
                      {},
                      "Your Bring groceries are in sync.",
                    )
                  }
                >
                  <RefreshCw size={16} /> Sync now
                </button>
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Disconnect Bring and erase its saved tokens?"))
                      void doRun("bring_disconnect", {}, "Bring disconnected.");
                  }}
                >
                  Disconnect
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
                  "Bring connected. Choose your shopping list.",
                );
                if (result) element.reset();
              }}
            >
              <Field label="Bring email">
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                />
              </Field>
              <Field label="Bring password">
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <button className="secondary" disabled={busy}>
                {busy ? "Connecting…" : "Connect Bring"}
              </button>
              <small>
                Only used to connect to Bring. Your password is never saved.
              </small>
            </form>
          )
        ) : (
          <p className="helper-note">
            The home owner manages the Bring connection. Everyone can sync
            groceries.
          </p>
        )}
      </section>
      <section className="settings-card">
        <span className="soft-icon">
          <Leaf size={24} />
        </span>
        <h2>Food preferences</h2>
        <p>
          Your agent reads these preferences before planning. Always check
          ingredients against your allergies.
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
              "Your kitchen preferences are saved.",
            );
          }}
        >
          <Field label="Diet">
            <input
              name="diet"
              defaultValue={data.preferences.diet}
              placeholder="e.g. Vegetarian, flexible, high-protein"
              maxLength={160}
            />
          </Field>
          <Field label="Allergies (separated by commas)">
            <input
              name="allergies"
              defaultValue={data.preferences.allergies.join(", ")}
              placeholder="e.g. Peanuts, sesame"
            />
          </Field>
          <Field label="Notes">
            <textarea
              name="notes"
              rows={3}
              defaultValue={data.preferences.notes}
              maxLength={3000}
              placeholder="Quick dinners on weekdays. Not too spicy."
            />
          </Field>
          <button className="secondary" disabled={busy}>
            <Check size={16} /> Save preferences
          </button>
        </form>
      </section>
      {owner && (
        <section className="settings-card">
          <span className="soft-icon">
            <Users size={24} />
          </span>
          <h2>Members</h2>
          <p>
            One home, shared by your people. Invitations can be used once and
            expire after 24 hours.
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
                    ? "Home owner"
                    : member.active
                      ? "Member"
                      : "Access disabled"}
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
                      "Member access updated.",
                    )
                  }
                >
                  {member.active ? "Disable" : "Enable"}
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
            <Plus size={16} /> Invite someone
          </button>
          {invitation && (
            <label className="copy-field">
              <input readOnly aria-label="Invitation link" value={invitation} />
              <button
                className="icon-button"
                aria-label="Copy invitation"
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
