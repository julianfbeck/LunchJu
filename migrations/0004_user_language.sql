-- NULL preserves each existing browser's selection until the next signed-in
-- visit saves it to the account. New accounts save their selected language.
ALTER TABLE users ADD COLUMN language TEXT CHECK(language IN ('de', 'en'));
