"use strict";

const db = require("../db");
const { sqlForPartialUpdate, combineWhereClauses } = require("../helpers/sql");
const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../expressError");

/** Related functions for plays. */

class Play {
  static filterKey = {
    userId: "user_id",
    gameType: "game_type",
    oldestDate: "play_time",
    newestDate: "play_time",
    minScore: "score",
    maxScore: "score",
    minNumOfWords: "num_of_words",
    maxNumOfWords: "num_of_words",
    bestWord: "best_word",
    minBestWordScore: "best_word_score",
    maxBestWordScore: "best_word_score"
  }

  /** Find all plays optionally filtered by various filter parameters
   *
   * Returns [{ id, username, first_name, last_name, email, permissions }, ...]
   **/

  static async getAll(filters) {
    const whereClauses = this.buildWhereClauses(filters);
    const whereString = combineWhereClauses(whereClauses);
    const plays = await db.query(
          `SELECT id,
                  user_id AS "userId",
                  game_type AS "gameType",
                  game_id AS "gameID",
                  play_time AS "playTime",
                  score,
                  num_of_words AS "numOfWords",
                  avg_word_score AS "avgWordsScore",
                  best_word AS "bestWord",
                  best_word_score AS "bestWordScore",
                  best_word_board_state AS "bestWordBoardState"
           FROM plays
           ${whereString}
           ORDER BY id DESC`,
    );
    return plays.rows;
  }


  /* 
  * create an array of WHERE clauses for getAll and getAllAdmin methods
  **/
  static async buildWhereClauses(filters) {
    const whereClauses = [];
    for (const filter in filters) {
      const first3Letters = filter.slice(0, 3);
      if (["min", "old"].includes(first3Letters)) {
        whereClauses.push(`${filter} >= ${filters[filter]}`);
      } 
      else if (["max", "new"].includes(first3Letters)) {
        whereClauses.push(`${filter} <= ${filters[filter]}`);
      }
      else if (filter === "bestWord") {
        whereClauses.push(`UPPER(${filter}) LIKE UPPER('%${filters[filter]}%')`);
      }
      else {
        whereClauses.push(`${filter} = ${filters[filter]}`);
      }
    }
    return whereClauses;
  }



    /** Given an id, return data about play.
   *
   * Throws NotFoundError if play not found.
   **/

  static async get(id) {
    const playRes = await db.query(
          `SELECT id,
                  user_id AS "userId",
                  game_type AS "gameType",
                  game_id AS "gameID",
                  play_time AS "playTime",
                  score,
                  num_of_words AS "numOfWords",
                  avg_word_score AS "avgWordsScore",
                  best_word AS "bestWord",
                  best_word_score AS "bestWordScore",
                  best_word_board_state AS "bestWordBoardState"
            FROM plays
            WHERE id = $1`,
        [id]
    );

    const play = playRes.rows[0];

    if (!play) throw new NotFoundError(`No play: ${id}`);

    return play;
  }


  /** Add play with data.
   *
   * Returns { username, firstName, lastName, email, country, permissions }
   **/

  static async add(dataObj) {
    const itemsToInsert = [
      "userId",
      "gameType",
      "gameId",
      "score",
      "numOfWords",
      "bestWord",
      "bestWordScore",
      "bestWordBoardState",
      "recent100Single",
      "top10Words",
      "top10plays",
      "top10AvgWordScore"
    ];
    const valueArray = itemsToInsert.map(item => {
      return dataObj[item] ? dataObj[item] : null;
    });

    const result = await db.query(
          `INSERT INTO plays (user_id,
                              game_type,
                              game_id,
                              score,
                              num_of_words,
                              best_word,
                              best_word_score,
                              best_word_board_state)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING username,
                    first_name AS "firstName",
                    last_name AS "lastName",
                    email,
                    country,
                    date_registered AS "dateRegistered",
                    permissions`,
        valueArray
    );

    // update last_play_single
    if (game_type === 0) {
      await db.query(
          `UPDATE users 
           SET last_play_single = CURRENT_DATE
           WHERE id = $1`,
        [dataObj.userId]
      )
    }

    const user = result.rows[0];

    return user;
  }


  /** Delete given play from database; returns undefined. */

  static async remove(playId) {
    let result = await db.query(
          `DELETE
           FROM plays
           WHERE id = $1
           RETURNING id`,
        [playId],
    );
    const play = result.rows[0];

    if (!play) throw new NotFoundError(`No play: ${playId}`);
  }
}

module.exports = Play;