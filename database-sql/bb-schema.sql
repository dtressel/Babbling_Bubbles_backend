CREATE TABLE User
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
  best_10_sma FLOAT NOT NULL DEFAULT 0,
  best_100_sma FLOAT NOT NULL DEFAULT 0,
  curr_10_sma FLOAT NOT NULL DEFAULT 0,
  curr_100_sma FLOAT NOT NULL DEFAULT 0,
  num_of_plays_single INT NOT NULL DEFAULT 0,
);

CREATE TABLE Plays
(
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  game_type INT NOT NULL DEFAULT 0,
  game_id INT,
  played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP(0),
  score INT NOT NULL,
  num_of_words INT NOT NULL,
  avg_word_score INT,
  best_word VARCHAR,
  best_word_score INT,
  best_word_board_state VARCHAR,
  recent_100_single BOOLEAN NOT NULL DEFAULT TRUE,
  top_10_words BOOLEAN NOT NULL DEFAULT FALSE,
  top_10_plays BOOLEAN DEFAULT FALSE,
  top_10_avg_word_score BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES User(id)
);