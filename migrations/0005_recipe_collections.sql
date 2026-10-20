-- Keep existing cover URLs and image objects intact while adding galleries.
ALTER TABLE recipes ADD COLUMN images_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE recipe_images (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  image_key TEXT NOT NULL UNIQUE,
  alt_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX recipe_images_recipe ON recipe_images(recipe_id,created_at,id);
INSERT INTO recipe_images(id,recipe_id,image_key,alt_text,created_at)
  SELECT id,id,image_key,image_alt,created_at FROM recipes WHERE image_key IS NOT NULL;
CREATE TABLE cookbooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE recipe_cookbooks (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  cookbook_id TEXT NOT NULL REFERENCES cookbooks(id) ON DELETE CASCADE,
  PRIMARY KEY(recipe_id,cookbook_id)
);
CREATE INDEX recipe_cookbooks_book ON recipe_cookbooks(cookbook_id,recipe_id);
CREATE TABLE recipe_comments (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  agent INTEGER NOT NULL DEFAULT 0 CHECK(agent IN (0,1)),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX recipe_comments_recipe ON recipe_comments(recipe_id,created_at,id);
