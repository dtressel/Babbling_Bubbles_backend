"use strict";

const db = require("../db");
const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../expressError");

/** Related functions for leaderboards. */

class Leaderboard {
  static gameTypes = ['solo3', 'solo10', 'free'];
  static wmaPeriods = ['20', '100'];
  static wmaStatTypes = ['curr', 'peak'];
  static bestScoreTypes = ['ttl', 'avg'];
  static bestWordTypes = ['bst', 'crz', 'lng'];
  static userFiltersKey = { userIds: 'user_id', usernames: 'username' }


  /*
    Method to build where clause additions in case of user filters

    Builds a where clause such as "AND (user_id = $2 OR username = $3)"

    Adds values to the valuesArray for new arguments
  */
  static buildUserWhereAddition(filters, valuesArray) {
    let whereString = '';
    let firstClause = true;

    const userFilters = {};
    if (filters.userIds) userFilters.userIds = filters.userIds;
    if (filters.usernames) userFilters.usernames = filters.usernames;

    // build whereString and valuesArray for each filter
    for (const filter in userFilters) {
      // userFilters value must always be an array
      for (const value of userFilters[filter]) {
        if (firstClause) {
          whereString = `AND (${this.userFiltersKey[filter]} = $${valuesArray.length + 1}`
          firstClause = false;
        } else {
          if (whereString) whereString += ' ';
          whereString += `OR ${this.userFiltersKey[filter]} = $${valuesArray.length + 1}`
        }
        valuesArray.push(value);
      }
    }
    // close parenthesis
    if (whereString) whereString += ')';
    return { whereClause: whereString, valuesArray }
  }


  /*
    Get leaderboards

    Can filter by:
    - gameTypes
    - statNames
    - userIds
    - usernames

    example Return
    {
      wmaStats: { curr_20_wma: [res1, res2, ...], peak_20_wma: [...], ... },
      bestScores: { ttl: [res1, res2, ...], avg: [...] },
      bestWords: { bst: [res1, res2, ...], ... }
    }
  */


  static async get(filters) {
    // use alternative method if there is a statName filter
    if (filters.statNames) {
      const promises = [];
      let leaderboards = {};
      // get leaderboard results for each stat name
      for (const statName of filters.statNames) {
        promises.push(this.getByStatName(statName, filters));
      }
      const results = await Promise.all(promises);
      // add all leaderboard results to leaderboard object
      for (const result of results) {
        leaderboards = { ...leaderboards, ...result };
      }

      return leaderboards;
    }

    // set game types
    const gameTypes = [];
    if (filters.gameTypes) gameTypes.push(...filters.gameTypes);
    else gameTypes.push(...this.gameTypes);

    // initialize promise object to gather promises to await later
    const promises = {};

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

    for (const type of this.bestScoreTypes) {
      promises[`${type}Score`] = {};
      for (const gameType of gameTypes) {
        // build where clause addition in case of userId or username filters
        const { whereClause, valuesArray } = this.buildUserWhereAddition(filters, [gameType, type]);

        promises[`${type}Score`][gameType] = db.query(
          `
            SELECT u.username,
                   bs.score,
                   TO_CHAR(bs.acheived_on, 'Mon DD, YYYY') AS "date"
            FROM best_scores AS "bs"
            INNER JOIN users AS "u"
              ON bs.user_id = u.id
            WHERE bs.game_type = $1
              AND bs.score_type = $2
              ${whereClause}
            ORDER BY bs.score DESC
            LIMIT 10
          `,
          valuesArray 
        );
      }
    }
    for (const type of this.bestWordTypes) {
      promises[`${type}Word`] = {};
      for (const gameType of gameTypes) {
        // build where clause addition in case of userId or username filters
        const { whereClause, valuesArray } = this.buildUserWhereAddition(filters, [gameType, type]);
        promises[`${type}Word`][gameType] = db.query(
          `
            SELECT u.username,
                   bw.word,
                   bw.score,
                   bw.board_state AS "boardState",
                   TO_CHAR(bw.found_on, 'Mon DD, YYYY') AS "date"
            FROM best_words AS "bw"
            INNER JOIN users AS "u"
              ON bw.user_id = u.id
            WHERE bw.game_type = $1
              AND bw.best_type = $2
              ${whereClause}
            ORDER BY bw.score DESC
            LIMIT 10
          `,
          valuesArray 
        );
      }
    }
    // only get wmas if not filtering by user
    if (!filters.userIds && !filters.usernames) {
      for (const wma of this.wmaPeriods) {
        for (const statType of this.wmaStatTypes) {
          promises[`${statType}${wma}Wma`] = {};
          for (const gameType of gameTypes) {
            promises[`${statType}${wma}Wma`][gameType] = db.query(
              `
                SELECT u.username,
                       ss.${statType}_${wma}_wma AS "${statType}${wma}Wma"
                       ${statType === 'peak' ? `, TO_CHAR(ss.peak_${wma}_wma_date, 'Mon DD, YYYY') AS "date"` : ''}
                FROM solo_stats AS "ss"
                INNER JOIN users AS "u"
                  ON ss.user_id = u.id
                WHERE ss.game_type = $1
                  AND ss.${statType}_${wma}_wma > 0
                ORDER BY ss.${statType}_${wma}_wma DESC
                LIMIT 10
              `,
              [gameType]
            );
          }
        }
      }
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
  

  static async getByStatName(statName, filters) {
    // set game types
    const gameTypes = [];
    if (filters.gameTypes) gameTypes.push(...filters.gameTypes);
    else gameTypes.push(...this.gameTypes);

    // initialize promise object to gather promises to await later
    const promises = {};

    // initialize leaderboard object for return
    const leaderboards = {};

    if (statName.includes("Wma")) {
      if (filters.userIds || filters.usernames) {
        throw new BadRequestError("Wma stats should not be retrieved when filtering by userIds or usernames. Please remove any wma stats from the statName list.");
      }
      promises[statName] = {};
      for (const gameType of gameTypes) {
        const peakOrCurr = statName.slice(0, 4);
        const wmaPeriod = statName.slice(4, -3);
        promises[statName][gameType] = db.query(
          `
            SELECT u.username,
                   ss.${peakOrCurr}_${wmaPeriod}_wma AS "${statName}"
                   ${peakOrCurr === 'peak' ? `, TO_CHAR(ss.peak_${wmaPeriod}_wma_date, 'Mon DD, YYYY') AS "peak${wmaPeriod}WmaDate"` : ''}
            FROM solo_stats AS "ss"
            INNER JOIN users AS "u"
              ON ss.user_id = u.id
            WHERE ss.game_type = $1
              AND ss.${peakOrCurr}_${wmaPeriod}_wma > 0
            ORDER BY ss.${peakOrCurr}_${wmaPeriod}_wma DESC
            LIMIT 10
          `,
          [gameType]
        );
      }
    }
    else if (statName.includes("Score")) {
      promises[statName] = {};
      const scoreType = statName.slice(4, 7).toLowerCase();
      for (const gameType of gameTypes) {
        // build where clause addition in case of userId or username filters
        const { whereClause, valuesArray } = this.buildUserWhereAddition(filters, [gameType, scoreType]);
        promises[statName][gameType] = db.query(
          `
            SELECT u.username,
                   bs.score,
                   TO_CHAR(bs.acheived_on, 'Mon DD, YYYY') AS "date"
            FROM best_scores AS "bs"
            INNER JOIN users AS "u"
              ON bs.user_id = u.id
            WHERE bs.game_type = $1
              AND bs.score_type = $2
              ${whereClause}
            ORDER BY bs.score DESC
            LIMIT 10
          `,
          valuesArray 
        );
      }
    }
    else if (statName.includes("Word")) {
      promises[statName] = {};
      const bestType = statName.slice(0, 3);
      for (const gameType of gameTypes) {
        // build where clause addition in case of userId or username filters
        const { whereClause, valuesArray } = this.buildUserWhereAddition(filters, [gameType, bestType]);
        promises[statName][gameType] = db.query(
          `
            SELECT u.username,
                   bw.word,
                   bw.score,
                   bw.board_state AS "boardState",
                   TO_CHAR(bw.found_on, 'Mon DD, YYYY') AS "date"
            FROM best_words AS "bw"
            INNER JOIN users AS "u"
              ON bw.user_id = u.id
            WHERE bw.game_type = $1
              AND bw.best_type = $2
              ${whereClause}
            ORDER BY bw.score DESC
            LIMIT 10
          `,
          valuesArray 
        );
      }
    }
    else {
      throw BadRequestError(`${statType} is not a valid stat type`);
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



  /* Alternate methods, not currently used */
  
  static async get2(filters) {
    // use alternative method if there is a statName filter
    if (filters.statNames) {
      const promises = [];
      let leaderboards = {};
      // get leaderboard results for each stat name
      for (const statName of filters.statNames) {
        promises.push(this.getByStatName2(statName, filters));
      }
      const results = await Promise.all(promises);
      // add all leaderboard results to leaderboard object
      for (const result of results) {
        leaderboards = { ...leaderboards, ...result };
      }

      return leaderboards;
    }

    // set game types
    const gameTypes = [];
    if (filters.gameTypes) gameTypes.push(...filters.gameTypes);
    else gameTypes.push(...this.gameTypes);

    // initialize promise object to gather promises to await later
    const promises = [];

    const objStructures = [];

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

    for (const type of this.bestScoreTypes) {
      for (const gameType of gameTypes) {
        objStructures.push({ path: [type, gameType], multipleResults: true });

        // build where clause addition in case of userId or username filters
        const { whereClause, valuesArray } = this.buildUserWhereAddition(filters, [gameType, type]);

        promises.push(db.query(
          `
            SELECT u.username,
                   bs.score,
                   TO_CHAR(bs.acheived_on, 'Mon DD, YYYY') AS "date"
            FROM best_scores AS "bs"
            INNER JOIN users AS "u"
              ON bs.user_id = u.id
            WHERE bs.game_type = $1
              AND bs.score_type = $2
              ${whereClause}
            ORDER BY bs.score DESC
            LIMIT 10
          `,
          valuesArray 
        ));
      }
    }
    for (const type of this.bestWordTypes) {
      for (const gameType of gameTypes) {
        objStructures.push({ path: [type, gameType], multipleResults: true });

        // build where clause addition in case of userId or username filters
        const { whereClause, valuesArray } = this.buildUserWhereAddition(filters, [gameType, type]);
        promises.push(db.query(
          `
            SELECT u.username,
                   bw.word,
                   bw.score,
                   bw.board_state AS "boardState",
                   TO_CHAR(bw.found_on, 'Mon DD, YYYY') AS "date"
            FROM best_words AS "bw"
            INNER JOIN users AS "u"
              ON bw.user_id = u.id
            WHERE bw.game_type = $1
              AND bw.best_type = $2
              ${whereClause}
            ORDER BY bw.score DESC
            LIMIT 10
          `,
          valuesArray 
        ));
      }
    }
    // only get wmas if not filtering by user
    if (!filters.userIds && !filters.usernames) {
      for (const wma of this.wmaPeriods) {
        for (const statType of this.wmaStatTypes) {
          for (const gameType of gameTypes) {
            objStructures.push({ path: [`${statType}${wma}Wma`, gameType], multipleResults: true });

            promises.push(db.query(
              `
                SELECT u.username,
                       ss.${statType}_${wma}_wma AS "${statType}${wma}Wma"
                       ${statType === 'peak' ? `, TO_CHAR(ss.peak_${wma}_wma_date, 'Mon DD, YYYY') AS "peak${wma}WmaDate"` : ''}
                FROM solo_stats AS "ss"
                INNER JOIN users AS "u"
                  ON ss.user_id = u.id
                WHERE ss.game_type = $1
                  AND ss.${statType}_${wma}_wma > 0
                ORDER BY ss.${statType}_${wma}_wma DESC
                LIMIT 10
              `,
              [gameType]
            ));
          }
        }
      }
    }

  // turn this into helper file
  // using results array and objStructure array, builds an object
  /* 
    Given a promise array and objStructure array, it builds an object of results
  */
    const results = await Promise.all(promises);
    const returnObj = {};
    // loop through results along with objStructure array
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const objStructure = objStructures[i];
      let returnObjRef = returnObj;
      // loop through the objStructure path to build the reference to store the results
      for (let i = 0; i < objStructure.path.length - 1; i++) {
        const key = objStructure.path[i]
        if (returnObjRef[key] === undefined) {
          returnObjRef[key] = {};
        }
        returnObjRef = returnObjRef[key];
      }
      // store the results as an array if multiple results are directly if a single result
      if (objStructure.multipleResults) {
        returnObjRef[objStructure.path.slice(-1)[0]] = result.rows;
      }
      else {
        returnObjRef[objStructure.path.slice(-1)[0]] = result.rows[0];
      }
    }

    return returnObj;
  }
  

  static async getByStatName2(statName, filters) {
    // set game types
    const gameTypes = [];
    if (filters.gameTypes) gameTypes.push(...filters.gameTypes);
    else gameTypes.push(...this.gameTypes);

    // initialize promise object to gather promises to await later
    const promises = {};

    // initialize leaderboard object for return
    const leaderboards = {};

    if (statName.includes("Wma")) {
      if (filters.userIds || filters.usernames) {
        throw new BadRequestError("Wma stats should not be retrieved when filtering by userIds or usernames. Please remove any wma stats from the statName list.");
      }
      promises[statName] = {};
      for (const gameType of gameTypes) {
        const peakOrCurr = statName.slice(0, 4);
        const wmaPeriod = statName.slice(4, -3);
        promises[statName][gameType] = db.query(
          `
            SELECT u.username,
                   ss.${peakOrCurr}_${wmaPeriod}_wma AS "${statName}"
                   ${peakOrCurr === 'peak' ? `, TO_CHAR(ss.peak_${wmaPeriod}_wma_date, 'Mon DD, YYYY') AS "peak${wmaPeriod}WmaDate"` : ''}
            FROM solo_stats AS "ss"
            INNER JOIN users AS "u"
              ON ss.user_id = u.id
            WHERE ss.game_type = $1
              AND ss.${peakOrCurr}_${wmaPeriod}_wma > 0
            ORDER BY ss.${peakOrCurr}_${wmaPeriod}_wma DESC
            LIMIT 10
          `,
          [gameType]
        );
      }
    }
    else if (statName.includes("Score")) {
      promises[statName] = {};
      const scoreType = statName.slice(4, 7).toLowerCase();
      for (const gameType of gameTypes) {
        // build where clause addition in case of userId or username filters
        const { whereClause, valuesArray } = this.buildUserWhereAddition(filters, [gameType, scoreType]);
        promises[statName][gameType] = db.query(
          `
            SELECT u.username,
                   bs.score,
                   TO_CHAR(bs.acheived_on, 'Mon DD, YYYY') AS "date"
            FROM best_scores AS "bs"
            INNER JOIN users AS "u"
              ON bs.user_id = u.id
            WHERE bs.game_type = $1
              AND bs.score_type = $2
              ${whereClause}
            ORDER BY bs.score DESC
            LIMIT 10
          `,
          valuesArray 
        );
      }
    }
    else if (statName.includes("Word")) {
      promises[statName] = {};
      const bestType = statName.slice(0, 3);
      for (const gameType of gameTypes) {
        // build where clause addition in case of userId or username filters
        const { whereClause, valuesArray } = this.buildUserWhereAddition(filters, [gameType, bestType]);
        promises[statName][gameType] = db.query(
          `
            SELECT u.username,
                   bw.word,
                   bw.score,
                   bw.board_state AS "boardState",
                   TO_CHAR(bw.found_on, 'Mon DD, YYYY') AS "date"
            FROM best_words AS "bw"
            INNER JOIN users AS "u"
              ON bw.user_id = u.id
            WHERE bw.game_type = $1
              AND bw.best_type = $2
              ${whereClause}
            ORDER BY bw.score DESC
            LIMIT 10
          `,
          valuesArray 
        );
      }
    }
    else {
      throw BadRequestError(`${statType} is not a valid stat type`);
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