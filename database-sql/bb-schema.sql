CREATE TABLE users
(
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  country TEXT,
  bio VARCHAR(300),
  words_found INT NOT NULL DEFAULT 0,
  date_registered DATE NOT NULL DEFAULT CURRENT_DATE,
  permissions TEXT NOT NULL DEFAULT 'base'
  -- 'base', 'admin'
);

CREATE TABLE best_words
(
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  game_type TEXT,
  -- solo3, solo10, free
  best_type TEXT,
  -- bst, crz, lng
  word TEXT,
  score INT,
  board_state TEXT,
  found_on DATE NOT NULL DEFAULT CURRENT_DATE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE best_scores
(
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  game_type TEXT,
  -- solo3, solo10, free
  score_type TEXT,
  -- ttl, avg
  score FLOAT,
  acheived_on DATE NOT NULL DEFAULT CURRENT_DATE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- keeps only 100 of each type per user to calculate wmas
CREATE TABLE solo_scores
(
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  game_type TEXT,
  -- solo3, solo10
  score INT NOT NULL DEFAULT 0,
  acheived_on DATE NOT NULL DEFAULT CURRENT_DATE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 1 row per user per game type to store stats for solo timed games
CREATE TABLE solo_stats
(
  user_id INT NOT NULL,
  game_type TEXT NOT NULL,
  -- solo3, solo10
  num_of_plays INT NOT NULL DEFAULT 1,
  last_play DATE NOT NULL DEFAULT CURRENT_DATE,
  curr_20_wma FLOAT,
  peak_20_wma FLOAT,
  peak_20_wma_date DATE,
  curr_100_wma FLOAT,
  peak_100_wma FLOAT,
  peak_100_wma_date DATE,
  current BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, game_type),
  FOREIGN KEY (user_id) REFERENCES users(id)
);