"use strict";

const db = require("../db");
const { createMultipleInsertQuery, buildWhereClauses, buildLimitOffsetClause } = require("../helpers/sql-for-update");
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
        SELECT game_type AS "gameType",
               score_type AS "scoreType",
               score,
               TO_CHAR(acheived_on, 'Mon DD, YYYY') AS "date"
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
    Finds the ten best scores for a particular user by game type and score type

    Returns { score }
  */
    static async getTenBest(userId, filters) {
      const tenBestScores = await db.query(
        `
          SELECT score
          FROM best_scores
          WHERE user_id = $1
            AND game_type = $2
            AND score_type = $3
          LIMIT 10
        `,
        [userId, filters.gameType, filters.scoreType]
      );
  
      return tenBestScores.rows;
    }


  /* 
    Posts a best score to the database

    Returns { bestScoreId: <id> }
  */
  static async post(userId, data) {
    // create arrays of data values
    const dataArrays = data.words.map((scoreObj) => {
      return [userId, data.gameType, scoreObj.scoreType, scoreObj.score];
    });
    const dataColumns = ['user_id', 'game_type', 'score_type', 'score'];
    const { sqlStatement, valuesArray } = createMultipleInsertQuery('best_scores', dataArrays, dataColumns, { acheived_on: 'CURRENT_DATE' });
    // Insert query
    await db.query(sqlStatement, valuesArray);
    // Delete excess rows
    const scoreTypesUpdated = data.scores.map(dataObj => dataObj.scoreType);
    // Gather ids of rows to delete
    const idsToDelete = [];
    for (const scoreType of scoreTypesUpdated) {
      const res = await db.query(
        `
          SELECT id
          FROM best_scores
          WHERE user_id = $1
            AND game_type = $2
            AND score_type = $3
          ORDER BY score DESC
          OFFSET 10
        `,
        [userId, data.gameType, scoreType]
      );
      if (res.rows.length) {
        idsToDelete.push(...res.rows.map(row => row.id));
      }
    }
    // Delete query
    if (idsToDelete.length) {
      await db.query(
        `
          DELETE FROM best_scores
          WERE id IN (${idsToDelete.join(', ')})
        `
      );

    return { message: 'best score(s) added' };
  }
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