"use strict";

const db = require("../db");
const { sqlForPartialUpdate, combineWhereClauses } = require("../helpers/sql-for-update");
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
   * Returns [{ play }, ...]
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
//  **********************************************************use sql for partial update instead of this****************************
  static buildWhereClauses(filters) {
    const whereClauses = [];
    for (const filter in filters) {
      const first3Letters = filter.slice(0, 3);
      if (["min", "old"].includes(first3Letters)) {
        whereClauses.push(`${this.filterKey[filter]} >= ${filters[filter]}`);
      } 
      else if (["max", "new"].includes(first3Letters)) {
        whereClauses.push(`${this.filterKey[filter]} <= ${filters[filter]}`);
      }
      else if (filter === "bestWord") {
        whereClauses.push(`UPPER(${this.filterKey[filter]}) LIKE UPPER('%${filters[filter]}%')`);
      }
      else {
        whereClauses.push(`${this.filterKey[filter]} = ${filters[filter]}`);
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
   * Returns { avgWordScore, curr100Wma, curr10Wma, isPeak100Wma, isPeak10Wma }
   **/

  static async add(dataObj) {
    // calculate avg word score based on score and numOfWords
    dataObj.avgWordScore = (Math.round(dataObj.score / dataObj.numOfWords * 100) / 100);
    const itemsToInsert = [
      "userId",
      "gameType",
      "gameId",
      "score",
      "numOfWords",
      "avgWordScore",
      "bestWord",
      "bestWordScore",
      "bestWordBoardState"
    ];
    // create an array of the values in the order used in query
    const valueArray = itemsToInsert.map(item => {
      return dataObj[item] ? dataObj[item] : null;
    });

    await db.query(
          `INSERT INTO plays (user_id,
                              game_type,
                              game_id,
                              score,
                              num_of_words,
                              avg_word_score,
                              best_word,
                              best_word_score,
                              best_word_board_state)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        valueArray
    );

    // update users table values related to play results
    if (game_type === 0) {
      // update last_play_single
      await db.query(
          `UPDATE users 
           SET last_play_single = CURRENT_DATE
           WHERE id = $1`,
        [dataObj.userId]
      );

      // update wmas
      // wmasToCalc should be ordered largest to smallest
      const wmasToCalc = [100, 10];
      // get recent scores including just inserted for calculation
      const res1 = await db.query(
         `SELECT score
          FROM plays
          WHERE user_id = $1
          ORDER BY id DESC
          LIMIT $2`,
        [dataObj.userId, wmasToCalc[0]]
      );
      const lastSingleScores = res1.rows;

      const stats = {
        avgWordScore: dataObj.avgWordScore
      }

      // if there are enough scores to calculate any of the wmas, continue
      if (lastSingleScores.length >= wmasToCalc.slice(-1)[0]) {
        const calculatedWmas = wmasToCalc.map((wma) => {
          if (lastSingleScores.length >= wma) {
            const wmaNumerator = lastSingleScores.slice(0, wma).reduce((accum, curr, idx) => {
              return accum + curr.score * (wma - idx);
            }, 0);
            const wmaDenominator = (wma * (wma + 1)) / 2;
            const wmaCalculation = wmaNumerator / wmaDenominator;
            const wmaCalculationRounded = Math.round(wmaCalculation * 100) / 100;
            return wmaCalculationRounded;
          } 
          else return null;
        });
        const res2 = await db.query(
           `UPDATE users
            SET curr_100_wma = $1, curr_10_wma = $2
            WHERE id = $3
            RETURNING peak_10_wma AS "peak10Wma",
                      peak_100_wma AS "peak100Wma"`,
          [
            calculatedWmas[0],
            calculatedWmas[1],
            dataObj.userId
          ]
        );
        const formerPeakWmas = res2.rows[0];
        if (formerPeakWmas.peak100Wma < calculatedWmas[0] || formerPeakWmas.peak10Wma < calculatedWmas[1]) {
          await db.query(
             `UPDATE users
              SET peak_100_wma = $1, peak_10_wma = $2
              WHERE id = $3`,
            [
              calculatedWmas[0] === null ? null : Math.max(formerPeakWmas.peak100Wma, calculatedWmas[0]),
              calculatedWmas[1] === null ? null : Math.max(formerPeakWmas.peak10Wma, calculatedWmas[1]),
              dataObj.userId
            ]
          );
        }
        stats.curr100Wma = calculatedWmas[0];
        stats.curr10Wma = calculatedWmas[1];
        stats.isPeak100Wma = calculatedWmas[0] > formerPeakWmas.peak100Wma;
        stats.isPeak10Wma = calculatedWmas[1] > formerPeakWmas.peak10Wma;
      }

      return stats;
    }
    return;
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