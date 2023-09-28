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
    curr100Wma: "curr_100_wma"
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
  static async patchAtGameStart(userId, gameType) {
    const insertQuery = createInsertQuery('solo_stats', { userId, gameType }, {}, this.filterKey);
    let valuesArray = insertQuery.valuesArray;
    const relativeChanges = {
      num_of_plays: "solo_stats.num_of_plays + 1",
      last_play: "CURRENT_DATE",
      current: "false"
    }
    const updateSetClause = buildUpdateSetClause({}, relativeChanges, this.filterKey, valuesArray);
    valuesArray = updateSetClause.valuesArray;
    // "upsert" statement
    await db.query(
      `
        ${insertQuery.sqlStatement}
        ON CONFLICT (user_id, game_type) DO UPDATE
        ${updateSetClause.sqlStatement}
      `,
      valuesArray
    );
    /* 
      Sample upsert statement:
      `
        INSERT INTO solo_stats
          (user_id, game_type)
        VALUES (1, 'solo3')
        ON CONFLICT (user_id, game_type) DO UPDATE
        SET num_of_plays = solo_stats.num_of_plays + 1, last_play = CURRENT_DATE
      `
    */

    return { soloStat: 'updated' };
  }



  /*
    Updates solo stat information at game end by solo stat id

    Provide the following data obj:
    {
      curr20Wma, (curr20Wma will also be set as peak20Wma if greater)
      curr100Wma (curr100Wma will also be set as peak100Wma if greater)
    }

    Returns { curr20Wma, peak20Wma, curr100Wma, peak100Wma, isPeak20Wma (may not exist), isPeak100Wma (may not exist) }
  */
  static async patchAtGameEnd(userId, gameType, data) {
    /* if there are no wmas because hasn't hit game threshold, only update current 
      (no need to update num_of_plays or last_play because already done at game start) */
    if (!Object.keys(data).length) {
      await db.query(
        `
          UPDATE solo_stats
          SET current = true
          WHERE user_id = $1
            AND game_type = $2
          RETURNING user_id
        `,
        [userId, gameType]
      );
      return {}
    }

    const updateSetClause = buildUpdateSetClause(data, { current: "true" }, this.filterKey);
    const valuesArray = updateSetClause.valuesArray;
    // push solo stat id into values array to be used in where clause
    valuesArray.push(userId, gameType);
    let soloStat = await db.query(
      `
        UPDATE solo_stats
        ${updateSetClause.sqlStatement}
        WHERE user_id = $${valuesArray.length - 1}
          AND game_type = $${valuesArray.length}
        RETURNING ${data.curr100Wma ? `
                    curr_100_wma AS "curr100Wma",
                    peak_100_wma AS "peak100Wma",`
                    : ''}
                  curr_20_wma AS "curr20Wma",
                  peak_20_wma AS "peak20Wma"
      `,
      valuesArray
    );
    // check if returned current wmas are greater than peak wmas, if so, add to peakUpdates
    const peakUpdates = {};
    const peakRelativeChanges = {};
    for (const wma of [20, 100]) {
      if (data[`curr${wma}Wma`] > soloStat.rows[0][`peak${wma}Wma`]) {
        peakUpdates[`peak_${wma}_wma`] = data[`curr${wma}Wma`];
        peakRelativeChanges[`peak_${wma}_wma_date`] = 'CURRENT_DATE';
        // update soloStat which will be returned, update to database happens below
        soloStat.rows[0][`peak${wma}Wma`] = data[`curr${wma}Wma`];
        soloStat.rows[0][`isPeak${wma}Wma`] = true;
      }
    }
    // if there are updates to be made to peak wmas, do so
    if (Object.keys(peakUpdates).length) {
      const updateSetClause2 = buildUpdateSetClause(peakUpdates, peakRelativeChanges, this.filterKey);
      const valuesArray2 = updateSetClause2.valuesArray;
      valuesArray2.push(userId, gameType);
      await db.query(
        `
          UPDATE solo_stats
          ${updateSetClause2.sqlStatement}
          WHERE user_id = $${valuesArray.length - 1}
            AND game_type = $${valuesArray.length}
        `,
        valuesArray2
      );
    }
  
    return soloStat.rows[0];
  }
}

module.exports = SoloStat;