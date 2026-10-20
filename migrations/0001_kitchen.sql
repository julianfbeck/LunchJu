PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','member')),
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX one_owner ON users(role) WHERE role = 'owner';
CREATE TABLE passkeys (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0, transports TEXT NOT NULL DEFAULT '[]',
  name TEXT NOT NULL DEFAULT 'Passkey', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE challenges (id TEXT PRIMARY KEY, challenge TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE invitations (token_hash TEXT PRIMARY KEY, created_by TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, used_at INTEGER);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE recipes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', servings REAL NOT NULL CHECK(servings > 0),
  minutes INTEGER NOT NULL DEFAULT 30 CHECK(minutes >= 0), ingredients TEXT NOT NULL, instructions TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]', source_url TEXT NOT NULL DEFAULT '', favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE pantry (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, quantity REAL NOT NULL CHECK(quantity >= 0),
  unit TEXT NOT NULL, location TEXT NOT NULL DEFAULT 'Pantry', expires_on TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX pantry_ingredient ON pantry(normalized_name, unit);
CREATE TABLE meals (
  id TEXT PRIMARY KEY, recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL, name TEXT NOT NULL,
  date TEXT NOT NULL, slot TEXT NOT NULL CHECK(slot IN ('breakfast','lunch','dinner','snack')),
  servings REAL NOT NULL CHECK(servings > 0), ingredients TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','eaten')), notes TEXT NOT NULL DEFAULT '',
  eaten_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX meals_date ON meals(date, slot);
CREATE TABLE groceries (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, quantity REAL NOT NULL CHECK(quantity >= 0),
  unit TEXT NOT NULL, checked INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '',
  bring_uuid TEXT, bring_synced_at TEXT, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX grocery_open_ingredient ON groceries(normalized_name,unit) WHERE checked = 0;
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE bring_removals (uuid TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE audit_log (id TEXT PRIMARY KEY, actor TEXT NOT NULL, operation TEXT NOT NULL, target TEXT, created_at TEXT NOT NULL);
