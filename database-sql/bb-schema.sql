CREATE TABLE User
(
  id INT NOT NULL,
  username VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  first_name VARCHAR NOT NULL,
  last_name VARCHAR NOT NULL,
  country VARCHAR NOT NULL,
  date_registered DATE NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE Games_Single_Random
(
  id INT NOT NULL,
  score INT NOT NULL,
  date DATE NOT NULL,
  best_word VARCHAR NOT NULL,
  best_word_score INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES User(id)
);