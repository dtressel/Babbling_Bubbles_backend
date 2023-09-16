"use strict";

const db = require("../db");
const { createInsertQuery, buildWhereClauses, buildLimitOffsetClause } = require("../helpers/sql-for-update");
const { NotFoundError } = require("../expressError");

/** Related functions for plays. */

class BestScore {
  /* 
    Key to translate filters from JS version to SQL version
  */
  static filterKey = {
    userId: "user_id",
    gameType: "game_type",
    scoreType: "score_type"
  }


  /* 
    Finds best scores for a particular user
    Results also reduced by filter, by limit (if exists) and by offset (if exists)

    Returns 
      [
        { gameType, scoreType, score, date },
        ...
      ]
  */
  static async get(userId, filters, limit = null, offset = 0) {
    // set initial valuesArray to build on
    let valuesArray = [userId]
    // build where clause based on where filters
    const whereClauseBuild = buildWhereClauses(filters, this.filterKey, valuesArray, true);
    valuesArray = whereClauseBuild.valuesArray;
    // build limit/offset statement
    const limitOffsetBuild = buildLimitOffsetClause(limit, offset, valuesArray);
    valuesArray = limitOffsetBuild.valuesArray;
    const bestScores = await db.query(
      `
        SELECT game_type AS "gameType"
               score_type AS "scoreType"
               score,
               TO_CHAR(bs.acheived_on, 'Mon DD, YYYY') AS "date"
        FROM best_scores
        WHERE user_id = $1
          ${whereClauseBuild.whereString}
        ${limitOffsetBuild.limitOffsetClause}
      `,
      valuesArray
    );

    return bestScores.rows;
  }


  /* 
    Posts a best score to the database

    Returns { bestScoreId: <id> }
  */
  static async post(userId, data) {
    const bestScore = await db.query(
      `
        ${createInsertQuery('best_scores', { userId, ...data }, filterKey)}
        RETURNING id AS "bestScoreId"
      `
    )
    return bestScore.rows[0];
  }


  /* 
    Deletes a best score by bestScoreId

    Returns { deleted: <bestScoreId> }
  */
  static async delete(bestScoreId) {
    let result = await db.query(
      `
        DELETE
        FROM best_scores
        WHERE id = $1
        RETURNING id
      `,
      [bestScoreId]
    );
    const bestScore = result.rows[0];

    if (!bestScore) throw new NotFoundError(`No bestScore: ${bestScoreId}`);

    return { deleted: bestScoreId };
  }
}

module.exports = BestScore;