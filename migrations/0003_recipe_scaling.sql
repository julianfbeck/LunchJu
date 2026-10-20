ALTER TABLE recipes ADD COLUMN scaling_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE meals ADD COLUMN recipe_snapshot TEXT;
