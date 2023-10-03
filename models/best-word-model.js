"use strict";

const db = require("../db");
const { buildWhereClauses, buildLimitOffsetClause, createMultipleInsertQuery } = require("../helpers/sql-for-update");
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
    Finds best words (only word and score) for a particular user
    Results also reduced by filter, by limit (if exists) and by offset (if exists)

    Returns 
      [
        { gameType, bestType, word, score, boardState, date },
        ...
      ]
  */
      static async getWordScore(userId, filters, limit, offset) {
        // set initial valuesArray to build on
        let valuesArray = [userId]
        // build where clause based on where filters
        const whereClauseBuild = buildWhereClauses(filters, this.filterKey, valuesArray, false);
        valuesArray = whereClauseBuild.valuesArray;
        // build limit/offset statement
        const limitOffsetBuild = buildLimitOffsetClause(limit, offset, valuesArray);
        valuesArray = limitOffsetBuild.valuesArray;
        const bestWords = await db.query(
          `
            SELECT word,
                   score
            FROM best_words
            WHERE user_id = $1
              ${whereClauseBuild.whereClause}
            ${limitOffsetBuild.sqlStatement}
          `,
          valuesArray
        );
    
        return bestWords.rows;
      }


  /* 
    Finds the tenth best word score for a particular user by game type and best type

    Returns { score }
  */
  static async getTenthBest(userId, filters) {
    const tenthBestScore = await db.query(
      `
        SELECT score
        FROM best_words
        WHERE user_id = $1
          AND game_type = $2
          AND best_type = $3
        LIMIT 1 OFFSET 10
      `,
      [userId, filters.gameType, filters.bestType]
    );

    return tenthBestScore.rows[0];
  }


  /* 
    Posts a best word to the database

    Returns { bestWordId: <id> }
  */
  static async post(userId, data) {
    // create arrays of data values
    const dataArrays = data.words.map((wordObj) => {
      return [userId, data.gameType, wordObj.bestType, wordObj.word, wordObj.score, wordObj.boardState];
    });
    const dataColumns = ['user_id', 'game_type', 'best_type', 'word', 'score', 'board_state'];
    const { sqlStatement, valuesArray } = createMultipleInsertQuery('best_words', dataArrays, dataColumns, { found_on: 'CURRENT_DATE' });
    // Insert query
    await db.query(sqlStatement, valuesArray);
    // Delete excess rows
    const bestTypesUpdated = data.words.reduce((accum, curr) => {
      return accum.add(curr.bestType);
    }, new Set());
    // Gather ids of rows to delete
    const idsToDelete = [];
    for (const bestType of bestTypesUpdated) {
      const res = await db.query(
        `
          SELECT id
          FROM best_words
          WHERE user_id = $1
            AND game_type = $2
            AND best_type = $3
          ORDER BY score DESC
          OFFSET 10
        `,
        [userId, data.gameType, bestType]
      );
      if (res.rows.length) {
        idsToDelete.push(...res.rows.map(row => row.id));
      }
    }
    // Delete query
    if (idsToDelete.length) {
      await db.query(
        `
          DELETE FROM best_words
          WHERE id IN (${idsToDelete.join(', ')})
        `
      );
    }

    return { message: 'best word(s) added' };
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