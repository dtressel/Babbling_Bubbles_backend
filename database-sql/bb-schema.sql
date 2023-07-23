CREATE TABLE users
(
  id SERIAL PRIMARY KEY,
  username VARCHAR NOT NULL,
  password VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  country VARCHAR NOT NULL,
  first_name VARCHAR NOT NULL,
  last_name VARCHAR NOT NULL,
  date_registered DATE NOT NULL DEFAULT CURRENT_DATE,
  permissions VARCHAR NOT NULL DEFAULT "base",
  peak_10_wma FLOAT NOT NULL DEFAULT 0,
  peak_100_wma FLOAT NOT NULL DEFAULT 0,
  curr_10_wma FLOAT NOT NULL DEFAULT 0,
  curr_100_wma FLOAT NOT NULL DEFAULT 0,
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
  avg_word_score INT,
  best_word VARCHAR,
  best_word_score INT,
  best_word_board_state VARCHAR,
  FOREIGN KEY (user_id) REFERENCES User(id)
);