ALTER TABLE recipes ADD COLUMN steps TEXT NOT NULL DEFAULT '[]';
CREATE TABLE recipe_sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('video','text','image')),
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  platform TEXT CHECK(platform IN ('instagram','tiktok','youtube')),
  notes TEXT NOT NULL DEFAULT '',
  recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','needs_info','done')),
  resolution TEXT NOT NULL DEFAULT '',
  image_key TEXT,
  image_alt TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX recipe_sources_status ON recipe_sources(status,created_at,id);
CREATE INDEX recipe_sources_recipe ON recipe_sources(recipe_id);
