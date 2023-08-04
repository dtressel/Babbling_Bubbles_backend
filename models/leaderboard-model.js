"use strict";

const db = require("../db");
const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../expressError");

/** Related functions for leaderboards. */

class Leaderboard {
  /** Get all Leaderboards
   *
   * Returns {
   *   bestAvgWordScoreMin15: [{playId, username, date, avgWordScore}, {...}, ...],
   *   bestCurrent100Wma: [{playId, username, curr100Wma}, {...}, ...],
   *   bestCurrent10Wma: [{playId, username, curr10Wma}, {...}, ...],
   *   bestPeak100Wma: [{playId, username, peak100Wma, date}, {...}, ...],
   *   bestPeak10Wma: [{playId, username, peak10Wma, date}, {...}, ...],
   *   bestPlayScoresSingle: [{playId, username, date, score}, {...}, ...],
   *   bestWordScores: [{playId, username, date, bestWord, bestWordScore}, {...}, ...]
   * }
   **/

  static async getAll() {
    const res1 = await db.query(
      `SELECT u.username,
              p.score,
              TO_CHAR(p.play_time, 'Mon DD, YYYY') AS "date"
       FROM plays AS "p"
       INNER JOIN users AS "u" 
           ON p.user_id = u.id
       WHERE p.score > 0
       ORDER BY p.score DESC
       LIMIT 10`
    );
    const bestPlayScoresSingle = res1.rows;

    const res2 = await db.query(
      `SELECT u.username,
              p.best_word AS "bestWord",
              p.best_word_score AS "bestWordScore",
              TO_CHAR(p.play_time, 'Mon DD, YYYY') AS "date"
       FROM plays AS "p"
       INNER JOIN users AS "u" 
           ON p.user_id = u.id
       WHERE p.best_word_score > 0
       ORDER BY p.best_word_score DESC
       LIMIT 10`
    );
    const bestWordScores = res2.rows;

    const res3 = await db.query(
      `SELECT username,
              curr_10_wma AS "curr10Wma"
       FROM users
       WHERE last_play_single >= NOW() - INTERVAL '60 days'
         AND curr_10_wma > 0
       ORDER BY curr_10_wma DESC
       LIMIT 10`
    );
    const bestCurrent10Wma = res3.rows;

    const res4 = await db.query(
      `SELECT username,
              curr_100_wma AS "curr100Wma"
       FROM users
       WHERE last_play_single >= NOW() - INTERVAL '60 days'
         AND curr_100_wma > 0
       ORDER BY curr_100_wma DESC
       LIMIT 10`
    );
    const bestCurrent100Wma = res4.rows;

    const res5 = await db.query(
      `SELECT username,
              peak_10_wma AS "peak10Wma",
              TO_CHAR(peak_10_wma_date, 'Mon DD, YYYY') AS "date"
       FROM users
       WHERE peak_10_wma > 0
       ORDER BY peak_10_wma DESC
       LIMIT 10`
    );
    const bestPeak10Wma = res5.rows

    const res6 = await db.query(
      `SELECT username,
              peak_100_wma AS "peak100Wma",
              TO_CHAR(peak_100_wma_date, 'Mon DD, YYYY') AS "date"
       FROM users
       WHERE peak_100_wma > 0
       ORDER BY peak_100_wma DESC
       LIMIT 10`
    );
    const bestPeak100Wma = res6.rows;

    const res7 = await db.query(
      `SELECT u.username,
              p.avg_word_score AS "avgWordScore",
              TO_CHAR(p.play_time, 'Mon DD, YYYY') AS "date"
       FROM plays AS "p"
       INNER JOIN users AS "u" 
           ON p.user_id = u.id
       WHERE num_of_words > 14
           AND p.avg_word_score > 0
       ORDER BY p.avg_word_score DESC
       LIMIT 10`  
    );
    const bestAvgWordScoreMin15 = res7.rows;

    const leaderboards = {
      bestAvgWordScoreMin15,
      bestCurrent100Wma,
      bestCurrent10Wma,
      bestPeak100Wma,
      bestPeak10Wma,
      bestPlayScoresSingle,
      bestWordScores
    }

    return leaderboards;
  }
}



module.exports = Leaderboard;