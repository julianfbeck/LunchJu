CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE recipe_categories (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY(recipe_id,category_id)
);
CREATE INDEX recipe_categories_category ON recipe_categories(category_id,recipe_id);
INSERT INTO categories(id,name,normalized_name,created_at,updated_at) VALUES
  ('10000000-0000-4000-8000-000000000001','Frühstück','frühstück',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('10000000-0000-4000-8000-000000000002','Hauptgerichte','hauptgerichte',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('10000000-0000-4000-8000-000000000003','Suppen & Eintöpfe','suppen & eintöpfe',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('10000000-0000-4000-8000-000000000004','Salate','salate',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('10000000-0000-4000-8000-000000000005','Snacks','snacks',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('10000000-0000-4000-8000-000000000006','Desserts & Backen','desserts & backen',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
