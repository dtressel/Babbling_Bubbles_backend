"use strict";

const db = require("../db");
const { createInsertQuery, buildUpdateSetClause } = require("../helpers/sql-for-update");
const { NotFoundError } = require("../expressError");

/** Related functions for plays. */

class SoloStat {
  /* 
    Key to translate filters from JS version to SQL version
  */
  static filterKey = {
    userId: "user_id",
    gameType: "game_type",
    curr20Wma: "curr_20_wma",
    peak20Wma: "peak_20_wma",
    curr100Wma: "curr_100_wma",
    peak100Wma: "peak_100_wma"
  }


  /* 
    Finds solo stats for a particular user optionally by gameType

    Returns 
      [
        { gameType, numOfPlays, lastPlay, curr20Wma, peak20Wma, peak20WmaDate, curr100Wma, peak100Wma, peak100WmaDate },
        ...
      ]
  */
  static async get(userId, gameType) {
    // set initial valuesArray to build on
    const valuesArray = [userId]
    let whereClause = 'WHERE user_id = $1';
    // build where and clause based on where filters
    if (gameType) {
      whereClause += ' AND game_type = $2';
      valuesArray.push(gameType);
    }
    const soloStats = await db.query(
      `
        SELECT game_type AS "gameType",
               num_of_plays AS "numOfPlays",
               TO_CHAR(last_play, 'Mon DD, YYYY') AS "lastPlay",
               curr_20_wma AS "curr20Wma",
               peak_20_wma AS "peak20Wma",
               TO_CHAR(peak_20_wma_date, 'Mon DD, YYYY') AS "peak20WmaDate",
               curr_100_wma AS "curr100Wma",
               peak_100_wma AS "peak100Wma",
               TO_CHAR(peak_100_wma_date, 'Mon DD, YYYY') AS "peak100WmaDate"
        FROM solo_stats
        ${whereClause}
      `,
      valuesArray
    );

    return soloStats.rows;
  }

  /*
    Updates or creates (upserts) solo stat information for a particular solo game type by userId

    Updates on game start

    Returns solo stat id
  */
  static async patchAtGameStart(userId, gameType, data) {
    const insertQuery = createInsertQuery('solo_stats', { userId, gameType, ...data }, {}, this.filterKey);
    let valuesArray = insertQuery.valuesArray;
    const updateSetClause = buildUpdateSetClause(data, { num_of_plays: "num_of_plays + 1" }, this.filterKey, valuesArray);
    valuesArray = buildUpdateSetClause.valuesArray;
    // "upsert" statement
    const soloStat = await db.query(
      `
        ${insertQuery.sqlStatement}
        ON CONFLICT (user_id, game_type) DO UPDATE
        ${updateSetClause.sqlStatement}
        RETURNING id AS "soloStatId"
      `,
      valuesArray
    );
  
    return soloStat.rows[0];
  }


  /*
    Updates solo stat information at game end by solo stat id

    Returns { curr20Wma, peak20Wma, curr100Wma, peak100Wma }
  */
  static async patchAtGameStart(soloStatId, data) {
    // create new entries in data to replace peak wmas with current wmas if greater
    // these new entries being arrays will be handled differently by buildUpdateSetClause
    for (const key in data) {
      data[key.replace('curr', 'peak')] = ['GREATEST(peak_20_wma, <$_>)', data[key]];
    }
    const updateSetClause = buildUpdateSetClause(data, {}, this.filterKey);
    valuesArray = buildUpdateSetClause.valuesArray;
    // push solo stat id into values array do be used in where clause
    valuesArray.push(soloStatId);
    const soloStat = await db.query(
      `
        UPDATE solo_stats
        ${updateSetClause.sqlStatement}
        WHERE id = $${valuesArray.length}
        RETURNING curr_20_wma AS "curr20Wma",
                  peak_20_wma AS "peak20Wma",
                  curr_100_wma AS "curr100Wma",
                  peak_100_wma AS "peak100Wma",
      `,
      valuesArray
    );
  
    return soloStat.rows[0];
  }


  /* 
    Deletes a best word by soloStatId

    Returns { deleted: <soloStatId> }
  */
  static async delete(soloStatId) {
    let result = await db.query(
      `
        DELETE
        FROM solo_stats
        WHERE id = $1
        RETURNING id
      `,
      [soloStatId]
    );
    const soloStat = result.rows[0];

    if (!soloStat) throw new NotFoundError(`No soloStat: ${soloStatId}`);

    return { deleted: soloStatId };
  }
}

module.exports = SoloStat;