CREATE TABLE users
(
  id SERIAL PRIMARY KEY,
  username VARCHAR NOT NULL,
  password VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  country VARCHAR,
  first_name VARCHAR,
  last_name VARCHAR,
  date_registered DATE NOT NULL DEFAULT CURRENT_DATE,
  permissions VARCHAR NOT NULL DEFAULT 'base',
  peak_10_wma FLOAT,
  peak_100_wma FLOAT,
  curr_10_wma FLOAT,
  curr_100_wma FLOAT,
  num_of_plays_single INT NOT NULL DEFAULT 0,
  last_play_single DATE
);

CREATE TABLE plays
(
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  game_type INT NOT NULL DEFAULT 0,
  game_id INT,
  play_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP(0),
  score INT NOT NULL,
  num_of_words INT NOT NULL,
  avg_word_score FLOAT,
  best_word VARCHAR,
  best_word_score INT,
  best_word_board_state VARCHAR,
  FOREIGN KEY (user_id) REFERENCES users(id)
);