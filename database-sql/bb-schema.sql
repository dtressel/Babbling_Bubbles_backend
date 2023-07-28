CREATE TABLE users
(
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  email TEXT NOT NULL,
  country TEXT,
  first_name TEXT,
  last_name TEXT,
  date_registered DATE NOT NULL DEFAULT CURRENT_DATE,
  permissions TEXT NOT NULL DEFAULT 'base',
  curr_10_wma FLOAT,
  curr_100_wma FLOAT,
  peak_10_wma FLOAT,
  peak_100_wma FLOAT,
  num_of_plays_single INT NOT NULL DEFAULT 0,
  last_play_single DATE,
  longest_word TEXT,
  longest_word_score SMALLINT,
  craziest_word TEXT,
  craziest_word_score SMALLINT,
  tenth_best_score INT,
  tenth_best_avg_word_score FLOAT,
  tenth_best_best_word_score INT
);

CREATE TABLE plays
(
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  game_type SMALLINT NOT NULL DEFAULT 0,
  game_id INT,
  play_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP(0),
  score INT NOT NULL,
  num_of_words SMALLINT NOT NULL,
  avg_word_score FLOAT,
  best_word TEXT,
  best_word_score INT,
  best_word_board_state TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);