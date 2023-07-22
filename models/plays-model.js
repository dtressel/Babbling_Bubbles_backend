"use strict";

const db = require("../db");
const { sqlForPartialUpdate, combineWhereClauses } = require("../helpers/sql");
const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../expressError");

/** Related functions for plays. */

class Plays {
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

  static filterKeyAdmin = {
    ...this.filterKey,
    recent100Single: "recent_100_single",
    top10Words: "top_10_words",
    top10Plays: "top_10_plays",
    top10AvgWordScore: "top_10_avg_word_score"
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


    /** Find all users. Returns all columns for admins
   *
   * Returns [{ id, username, first_name, last_name, email, permissions }, ...]
   **/
  static async getAllAdmin(filters) {
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
              best_word_board_state AS "bestWordBoardState",
              recent_100_single AS "recent100Single",
              top_10_words AS "top10Words",
              top_10_plays AS "top10Plays",
              top_10_avg_word_score AS "top10AvgWordScore"
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
                  best_word_board_state AS "bestWordBoardState",
                  recent_100_single AS "recent100Single",
                  top_10_words AS "top10Words",
                  top_10_plays AS "top10Plays",
                  top_10_avg_word_score AS "top10AvgWordScore"
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
                              best_word_board_state,
                              recent_100_single,
                              top_10_words,
                              top_10_plays,
                              top_10_avg_word_score)
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

    const user = result.rows[0];

    return user;
  }



  /** Update user data with `data`.
  *
  * This is a "partial update" --- it's fine if data doesn't contain
  * all the fields; this only changes provided ones.
  *
  * Data can include:
  *   { recent100Single, top10Words, top10Plays, top10AvgWordScore }
  *
  * Returns { id, userId, recent100Single, top10Words, top10Plays, top10AvgWordScore }
  *
  * Throws NotFoundError if not found.
  *
  */

  static async update(playId, data) {
    const { setCols, values } = sqlForPartialUpdate(
        data,
        {
          recent100Single: "recent_100_single",
          top10Words: "top_10_words",
          top10Plays: "top_10_plays",
          top10AvgWordScore: "top_10_avg_word_score"
        });
    const idVarIdx = "$" + (values.length + 1);

    const querySql = `UPDATE users 
                      SET ${setCols} 
                      WHERE id = ${idVarIdx} 
                      RETURNING id,
                                user_id AS "userId",
                                recent_100_single AS "recent100Single",
                                top_10_words AS "top10Words",
                                top_10_plays AS "top10Plays",
                                top_10_avg_word_score AS "top10AvgWordScore"`;
    const result = await db.query(querySql, [...values, playId]);
    const play = result.rows[0];

    if (!play) throw new NotFoundError(`No play: ${playId}`);

    return play;
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

module.exports = Plays;