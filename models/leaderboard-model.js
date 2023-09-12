"use strict";

const db = require("../db");
const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../expressError");

/** Related functions for leaderboards. */

class Leaderboard {
  /*
    Get leaderboards by game type

    example Return
    {
      wmaStats: { curr_20_wma: [res1, res2, ...], peak_20_wma: [...], ... },
      bestScores: { ttl: [res1, res2, ...], avg: [...] },
      bestWords: { bst: [res1, res2, ...], ... }
    }
  */

  static async getByType(filters) {
    const gameType = filters.gameType;
    const wmas = ['20', '100'];
    const wmaStatTypes = ['curr', 'peak'];
    const bestScoreTypes = ['ttl', 'avg'];
    const bestWordTypes = ['bst', 'crz', 'lng'];

    // initialize promise object to gather promises to await later
    const promises = {
      wmaStats: {},
      bestScores: {},
      bestWords: {}
    }

    // initialize leaderboard object for return
    const leaderboards = {};

    /* 
      make queries to database for each stat category
      and add query promises to promise object by stat type

      when finished, promises object should look like this example:
      {
        wmaStats: { curr_20_wma: <promise>, peak_20_wma: <promise>, ... },
        bestScores: { ttl: <promise>, avg: <promise> },
        bestWords: { bst: <promise>, ... }
      }
    */
    for (const wma of wmas) {
      for (const statType of wmaStatTypes) {
        promises.wmaStats[`${statType}${wma}Wma`] = db.query(
          `
            SELECT username,
                   game_type AS "gameType",
                   ${statType}_${wma}_wma AS "${statType}${wma}Wma",
                   ${statType === 'peak' ? `TO_CHAR(peak_${wma}_wma_date, 'Mon DD, YYYY') AS "peak${wma}WmaDate",` : ''}
            FROM solo_stats
            WHERE game_type = $1
            ORDER BY ${statType}_${wma}_wma DESC
            LIMIT 10
          `,
          [gameType]
        );
      }
    }
    for (const type of bestScoreTypes) {
      promises.bestScores[type] = db.query(
        `
          SELECT u.username
                 bs.game_type AS "gameType",
                 bs.score_type AS "scoreType",
                 bs.score,
                 TO_CHAR(bs.acheived_on, 'Mon DD, YYYY') AS "date"
          FROM best_scores AS "bs"
          INNER JOIN users AS "u"
            ON bs.user_id = u.id
          WHERE bs.game_type = $1
            AND bs.score_type = ${type}
          ORDER BY bs.score DESC
          LIMIT 10
        `,
        [gameType] 
      );
    }
    for (const type of bestWordTypes) {
      promises.bestWords[type] = db.query(
        `
          SELECT u.username
                 bw.game_type AS "gameType",
                 bw.best_type AS "bestType",
                 bw.word,
                 bw.score,
                 bw.board_state AS "boardState",
                 TO_CHAR(bw.found_on, 'Mon DD, YYYY') AS "date"
          FROM best_words AS "bw"
          INNER JOIN users AS "u"
            ON bw.user_id = u.id
          WHERE bw.game_type = $1
            AND bw.best_type = ${type}
          ORDER BY bw.score DESC
          LIMIT 10
        `,
        [gameType] 
      );
    }

    /* 
      build leaderboard object and add result rows after awaiting
      leaderboard object will be structured like the return object example above this method
    */
    for (const category in promises) {
      leaderboards[category] = {};
      for (const statType in promises[category]) {
        const results = await promises[category][statType];
        leaderboards[category][statType] = results.rows;
      }
    }

    return leaderboards;
  }
}

module.exports = Leaderboard;