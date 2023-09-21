"use strict";

const db = require("../db");
const { createInsertQuery, buildWhereClauses, buildLimitOffsetClause } = require("../helpers/sql-for-update");
const { NotFoundError } = require("../expressError");

/** Related functions for plays. */

class BestWord {
  /* 
    Key to translate filters from JS version to SQL version
  */
  static filterKey = {
    userId: "user_id",
    gameType: "game_type",
    bestType: "best_type"
  }


  /* 
    Finds best words for a particular user
    Results also reduced by filter, by limit (if exists) and by offset (if exists)

    Returns 
      [
        { gameType, bestType, word, score, boardState, date },
        ...
      ]
  */
  static async get(userId, filters, limit, offset) {
    // set initial valuesArray to build on
    let valuesArray = [userId]
    // build where clause based on where filters
    const whereClauseBuild = buildWhereClauses(filters, this.filterKey, valuesArray, true);
    valuesArray = whereClauseBuild.valuesArray;
    // build limit/offset statement
    const limitOffsetBuild = buildLimitOffsetClause(limit, offset, valuesArray);
    valuesArray = limitOffsetBuild.valuesArray;
    const bestWords = await db.query(
      `
        SELECT game_type AS "gameType",
               best_type AS "bestType",
               word,
               score,
               board_state AS "boardState",
               TO_CHAR(found_on, 'Mon DD, YYYY') AS "date"
        FROM best_words
        WHERE user_id = $1
          ${whereClauseBuild.whereString}
        ${limitOffsetBuild.sqlStatement}
      `,
      valuesArray
    );

    return bestWords.rows;
  }


  /* 
    Posts a best word to the database

    Returns { bestWordId: <id> }
  */
  static async post(userId, data) {
    const { sqlStatement, valuesArray } = createInsertQuery('best_words', { userId, ...data }, filterKey);
    const bestWord = await db.query(
      `
        ${sqlStatement}
        RETURNING id AS "bestWordId"
      `,
      valuesArray
    )
    return bestWord.rows[0];
  }


  /* 
    Deletes a best word by bestWordId

    Returns { deleted: <bestWordId> }
  */
  static async delete(bestWordId) {
    let result = await db.query(
      `
        DELETE
        FROM best_words
        WHERE id = $1
        RETURNING id
      `,
      [bestWordId]
    );
    const bestWord = result.rows[0];

    if (!bestWord) throw new NotFoundError(`No bestWord: ${bestWordId}`);

    return { deleted: bestWordId };
  }
}

module.exports = BestWord;