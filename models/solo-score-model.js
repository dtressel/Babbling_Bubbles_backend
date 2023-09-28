"use strict";

const db = require("../db");
const { buildUpdateSetClause, buildLimitOffsetClause } = require("../helpers/sql-for-update");
const { calculateWma } = require("../helpers/wmaCalculator");
const { NotFoundError } = require("../expressError");

/** Related functions for plays. */

class SoloScore {
  /* 
    Key to translate filters from JS version to SQL version
  */
  static filterKey = {
    userId: "user_id",
    gameType: "game_type"
  }

  static wmaPeriods = [20, 100];


  /* 
    Finds solo scores for a particular user optionally by gameType

    Returns 
      [
        { gameType, numOfPlays, lastPlay, curr20Wma, peak20Wma, peak20WmaDate, curr100Wma, peak100Wma, peak100WmaDate },
        ...
      ]
  */
  static async get(userId, gameType, limit, offset) {
    // set initial valuesArray to build on
    let valuesArray = [userId]
    let whereClause = 'WHERE user_id = $1';
    // build where and clause based on where filters
    if (gameType) {
      whereClause += ' AND game_type = $2';
      valuesArray.push(gameType);
    }
    // build limit/offset statement
    const limitOffsetBuild = buildLimitOffsetClause(limit, offset, valuesArray);
    valuesArray = limitOffsetBuild.valuesArray;
    const soloScores = await db.query(
      `
        SELECT score,
               game_type AS "gameType",
               TO_CHAR(acheived_on, 'Mon DD, YYYY') AS "date"
        FROM solo_scores
        ${whereClause}
        ${limitOffsetBuild.sqlStatement}
      `,
      valuesArray
    );

    return soloScores.rows;
  }

  /*
    Creates solo score information for a particular solo game type by userId

    Updates on game start

    Returns solo score id
  */
  static async postAtGameStart(userId, gameType) {
    const soloScore = await db.query(
      `
        INSERT INTO solo_scores (user_id, game_type, score, acheived_on)
        VALUES ($1, $2, 0, CURRENT_DATE)
        RETURNING id AS "soloScoreId"
      `,
      [userId, gameType]
    );
    // delete 101st score
    await db.query(
      `
        DELETE FROM solo_scores
        WHERE id IN (
          SELECT id
          FROM solo_scores
          WHERE user_id = $1
            AND game_type = $2
          ORDER BY id DESC
          OFFSET 100
        )
      `,
      [userId, gameType]
    );

    return soloScore.rows[0];
  }


  /*
    Updates solo score information at game end by solo score id

    Provide 
      - soloScoreId
      - score
      - loggedInUserId (to confirm that play information to update matches logged in user)

    Returns { userId, gameType, curr20Wma, curr100Wma }
  */
  static async patchAtGameEnd(soloScoreId, score, loggedInUserId) {
    const updateSetClause = buildUpdateSetClause({ score }, { acheived_on: 'CURRENT_DATE' });
    const valuesArray = updateSetClause.valuesArray;
    // push solo score id into values array to be used in where clause
    valuesArray.push(soloScoreId, loggedInUserId);

    // update solo scores with the new score
    const playInfoRes = await db.query(
      `
        UPDATE solo_scores
        ${updateSetClause.sqlStatement}
        WHERE id = $${valuesArray.length - 1}
          AND user_id = $${valuesArray.length}
        RETURNING user_id AS "userId",
                  game_type AS "gameType"
      `,
      valuesArray
    );
    const playInfo = playInfoRes.rows[0];

    // get last 100 scores to calculate wmas
    let stats = {};
    if (playInfo) {
      const scores = await db.query(
        `
          SELECT score
          FROM solo_scores
          WHERE user_id = $1
            AND game_type = $2
          ORDER BY id DESC
          LIMIT 100
        `,
        [loggedInUserId, playInfo.gameType]
      );
      // get wmas
      stats = this.wmaPeriods.reduce((accum, curr) => {
        const wmaCalc = calculateWma(scores.rows, curr);
        if (wmaCalc) {
          return { ...accum, [`curr${curr}Wma`]: wmaCalc };
        }
        return accum;
      }, {});
    }
  
    return { ...playInfo, ...stats };
  }


  /* 
    Deletes a best word by soloScoreId

    Returns { deleted: <soloScoreId> }
  */
  static async delete(soloScoreId) {
    let result = await db.query(
      `
        DELETE
        FROM solo_scores
        WHERE id = $1
        RETURNING id
      `,
      [soloScoreId]
    );
    const soloScore = result.rows[0];

    if (!soloScore) throw new NotFoundError(`No soloScore: ${soloScoreId}`);

    return { deleted: soloScoreId };
  }
}

module.exports = SoloScore;