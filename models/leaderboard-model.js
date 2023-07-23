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
   * Returns [{ id, username, first_name, last_name, email, permissions }, ...]
   **/

  static async getAll() {
    const bestPlayScoresSingle = await db.query(
      `SELECT p.id AS "playId",
              u.username,
              p.play_time AS "playTime",
              p.score
       FROM plays AS "p"
       INNER JOIN users AS "u" 
           ON p.user_id = u.id
       ORDER BY score DESC
       LIMIT 10`
    ).rows;

    const bestWordScores = await db.query(
      `SELECT p.id AS "playId",
              u.username,
              p.play_time AS "playTime",
              p.best_word AS "bestWord",
              p.best_word_score AS "bestWordScore"
       FROM plays AS "p"
       INNER JOIN users AS "u" 
           ON p.user_id = u.id
       ORDER BY best_word_score DESC
       LIMIT 10`
    ).rows;

    const bestCurrent10Wma = await db.query(
      `SELECT id,
              username,
              curr_10_wma AS "curr10Wma"
       FROM users
       WHERE last_play_single >= NOW() - INTERVAL '60 days'
       ORDER BY curr_10_wma DESC
       LIMIT 10`
    ).rows;

    const bestCurrent100Wma = await db.query(
      `SELECT id,
              username,
              curr_100_wma AS "curr100Wma"
       FROM users
       WHERE last_play_single >= NOW() - INTERVAL '60 days'
       ORDER BY curr_100_wma DESC
       LIMIT 10`
    ).rows;

    const bestPeak10Wma = await db.query(
      `SELECT id,
              username,
              peak_10_wma AS "peak10Wma"
       FROM users
       ORDER BY peak_10_wma DESC
       LIMIT 10`
    ).rows;

    const bestPeak100Wma = await db.query(
      `SELECT id,
              username,
              peak_100_wma AS "peak100Wma"
       FROM users
       ORDER BY peak_100_wma DESC
       LIMIT 10`
    ).rows;

    const bestAvgWordScoreMin15 = await db.query(
      `SELECT p.id AS "playId",
              u.username,
              p.play_time AS "playTime",
              p.avg_word_score AS "avgWordScore",
       FROM plays AS "p"
       INNER JOIN users AS "u" 
           ON p.user_id = u.id
       WHERE num_of_words > 14
       ORDER BY avg_word_score DESC
       LIMIT 10`  
    ).rows;

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