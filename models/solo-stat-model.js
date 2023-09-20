"use strict";

const db = require("../db");
const { combineWhereClauses, createInsertQuery, createUpdateQuery, buildUpdateSetClause } = require("../helpers/sql-for-update");
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
  static async patchAtGameStart(userId, gameType, data) {
    const insertQuery = createInsertQuery('solo_stats', { userId, gameType, ...data }, this.filterKey);
    let valuesArray = insertQuery.valuesArray;
    const insertSetClause = buildUpdateSetClause(data, this.filterKey, valuesArray);
    const soloStat = await db.query(
      `
        ${insertQuery.sqlStatement}
        ON CONFLICT (user_id) DO UPDATE
        ${insertSetClause.sqlStatement}
      `
    );
  }



  /** Updates play that was created at start of game
  *
  * Returns { avgWordScore, curr100Wma, curr10Wma, isPeak100Wma, isPeak10Wma }
  **/
  static async updateAtGameOver({ playId, baseInfo, extraStats }) {
    // calculate avg word score based on score and numOfWords
    baseInfo.avgWordScore = (Math.round(baseInfo.score / baseInfo.numOfWords * 100) / 100);

    // Important Variables:
    // create userInfo variable to store relevant user info for calculating updates
    let userInfo;
    // create userUpdates obj to store updates for final update query
    const userUpdates = {};
    // create an array to store play ids that need to be deleted
    const playIdsToDelete = [];
    // create stats object to return to frontend for game over popup
    const statsToReturn = {
      avgWordScore: baseInfo.avgWordScore
    }

    // update play in database
    const playUpdateQuery = createUpdateQuery('plays', baseInfo, {}, [["id", "=", playId]], this.columnsJsToSqlKey);
    const previouslySetInfo = await db.query(
      `${playUpdateQuery.sqlStatement}
       RETURNING user_id AS "userId",
                 game_type AS "gameType",
                 game_id AS "gameId"`,
      playUpdateQuery.valuesArray
    );

    // add previously set info to baseInfo
    baseInfo = { ...baseInfo, ...previouslySetInfo.rows[0] };

    // update database with info relevant to single plays
    if (baseInfo.gameType === 0) {
      // wmas to be calculated ordered largest to smallest
      const wmasToCalc = [100, 10];
      const peakWmasToSelect = wmasToCalc.slice(1).reduce((accum, curr) => {
        return accum + `, peak_${curr}_wma`;
      }, `peak_${wmasToCalc[0]}_wma`);

      // get relevant user info
      const userInfoRes = await db.query(
          `SELECT ${peakWmasToSelect},
                  num_of_plays_single,
                  longest_word_score,
                  craziest_word_score,
                  tenth_best_score,
                  tenth_best_avg_word_score,
                  tenth_best_best_word_score
           FROM users
           WHERE id = $1`,
        [baseInfo.userId]
      );
      userInfo = userInfoRes.rows[0];

      // get recent single scores for calculating wmas
      const recentScoresRes = await db.query(
          `SELECT id, score
           FROM plays
           WHERE user_id = $1
           ORDER BY id DESC
           LIMIT $2`,
        [baseInfo.userId, wmasToCalc[0] + 1]
      );
      const recentScores = recentScoresRes.rows;

      // if there are enough scores to calculate any of the wmas, continue
      if (recentScores.length >= wmasToCalc.slice(-1)[0]) {
        // calculate all wmas with enough records and add to userUpdates
        for (const wma of wmasToCalc) {
          if (recentScores.length < wma) continue;
          const wmaNumerator = recentScores.slice(0, wma).reduce((accum, curr, idx) => {
            return accum + curr.score * (wma - idx);
          }, 0);
          const wmaDenominator = (wma * (wma + 1)) / 2;
          const wmaCalculation = wmaNumerator / wmaDenominator;
          const wmaCalculationRounded = Math.round(wmaCalculation * 100) / 100;
          userUpdates[`curr_${wma}_wma`] = wmaCalculationRounded;
          statsToReturn[`curr${wma}Wma`] = wmaCalculationRounded;
        }

        // check for new peak wmas and add peak wmas to userUpdates if needs updating
        for (const wma of wmasToCalc) {
          if (userUpdates[`curr_${wma}_wma`] > userInfo[`peak_${wma}_wma`]) {
            userUpdates[`peak_${wma}_wma`] = userUpdates[`curr_${wma}_wma`];
            userUpdates[`peak_${wma}_wma_date`] = "CURRENT_DATE";
            statsToReturn[`isPeak${wma}Wma`] = true;
          }
        }

        // check tenth bests, update tenth best in plays,
        // and add new elevenths to playIdsToDelete if not needed anymore
        if (recentScores.length >= 10) {
          const statsForCheck10th = ['score', 'avg_word_score', 'best_word_score'];
          const selectRowsStr = statsForCheck10th.reduce((accum, curr) => {
            return accum + `, ${curr}`;
          });

          // for each stat
          for (const stat of statsForCheck10th) {
            // check if play result is better than user's tenth best
            if (baseInfo.score > userInfo[`tenth_best_${stat}`]) {
              // if so, get tenth and eleventh best
              const tenthAndEleventhRes = await db.query(
                  `SELECT id, ${selectRowsStr}
                   FROM plays
                   WHERE user_id = $1
                   ORDER BY ${stat} DESC
                   LIMIT 2
                   OFFSET 9`,
                [baseInfo.userId]
              );
              const tenthAndEleventh = tenthAndEleventhRes.rows;

              // replace user's old tenth best score with new tenth best 
              userUpdates[`tenth_best_${stat}`] = tenthAndEleventh[0][stat];

              // check if 11th is no longer needed, if so, delete
              let deleteEleventh = true;
              // if you find this eleventh play in recent 101 games, then don't delete
              if (recentScores.find(row => row.id === tenthAndEleventh[1].id)) {
                deleteEleventh = false;
              }
              // otherwise check if needed for other best stats
              else {
                for (const stat of statsForCheck10th) {
                  if (tenthAndEleventh[1][stat] > userInfo[`tenth_best_${stat}`]) {
                    deleteEleventh = false;
                    break;
                  }
                }
              }

              // if we can delete it, push id into delete array
              if (deleteEleventh) {
                playIdsToDelete.push(tenthAndEleventh[1].id);
              }
            }
          }

          // check if 101st play is needed, if not, delete
          // get play information for 101st play
          if (recentScores.length >= 101) {
            const _101stPlayRes = await db.query(
                 `SELECT ${selectRowsStr}
                  FROM plays
                  WHERE id = $1`,
              [recentScores[100].id] 
            );
            const _101stPlay = _101stPlayRes.rows[0];

            // check if 101st is one of the tenth best of other stats
            let delete101st = true;
            for (const stat of statsForCheck10th) {
              if (_101stPlay[stat] > userInfo[`tenth_best_${stat}`]) {
                delete101st = false;
                break;
              }
            }
            // if we can delete it, push id into delete array
            if (delete101st) {
              playIdsToDelete.push(recentScores[100].id);
            }
          }
        }
      }
    }

    // process extra stats
    const extraStatsToProcess = {longestWord: "longest_word", craziestWord: 'craziest_word'};
    for (const stat in extraStatsToProcess) {
      // if the just played stat is better than the stored stat
      if (extraStats[`${stat}Score`] > userInfo[`${extraStatsToProcess[stat]}_score`]) {
        // store the superior newly played stat values in user updates
        userUpdates[extraStatsToProcess[stat]] = extraStats[stat];
        userUpdates[`${extraStatsToProcess[stat]}_score`] = extraStats[`${stat}Score`];
      }
    }

    // apply updates to user
    if (Object.keys(userUpdates).length) {
      const updateQuery = createUpdateQuery('users', userUpdates, [["id", "=", baseInfo.userId]]);
      await db.query(updateQuery.sqlStatement, updateQuery.valuesArray);
    }

    // remove any duplicates from playIdsToDelete
    const uniquePlayIdsToDelete = [...new Set(playIdsToDelete)];
    // delete plays from playIdsToDelete
    const numofIdsToDelete = uniquePlayIdsToDelete.length;
    if (numofIdsToDelete) {
      let inList = '$1';
      for (let i = 2; i <= numofIdsToDelete; i++) {
        inList += `, $${i}`;
      }
      await db.query(
           `DELETE FROM plays
            WHERE id IN (${inList})`,
        uniquePlayIdsToDelete
      );
    }
    return statsToReturn;
  }




  /** Add full play with data.
   *
   * Returns { avgWordScore, curr100Wma, curr10Wma, isPeak100Wma, isPeak10Wma }
   **/

  static async addFull({ baseInfo, extraStats }) {
    // calculate avg word score based on score and numOfWords
    baseInfo.avgWordScore = (Math.round(baseInfo.score / baseInfo.numOfWords * 100) / 100);

    // Important Variables:
    // create userInfo variable to store relevant user info for calculating updates
    let userInfo;
    // create userUpdates obj to store updates for final update query
    const userUpdates = {};
    // create an array to store play ids that need to be deleted
    const playIdsToDelete = [];
    // create stats object to return to frontend for game over popup
    const statsToReturn = {
      avgWordScore: baseInfo.avgWordScore
    }

    // insert new play into database
    const playInsertQuery = createInsertQuery('plays', baseInfo, this.columnsJsToSqlKey);
    await db.query(playInsertQuery.sqlStatement, playInsertQuery.valuesArray);

    // update database with info relevant to single plays
    if (baseInfo.gameType === 0 || baseInfo.gameType === undefined) {
      // add update to last play single
      userUpdates.last_play_single = 'CURRENT_DATE';
      // increment numOfPlaysSingle and add to userUpdates
      userUpdates.num_of_plays_single = 'num_of_plays_single + 1';
      // wmas to be calculated ordered largest to smallest
      const wmasToCalc = [100, 10];
      const peakWmasToSelect = wmasToCalc.slice(1).reduce((accum, curr) => {
        return accum + `, peak_${curr}_wma`;
      }, `peak_${wmasToCalc[0]}_wma`);

      // get relevant user info
      const userInfoRes = await db.query(
          `SELECT ${peakWmasToSelect},
                  num_of_plays_single,
                  longest_word_score,
                  craziest_word_score,
                  tenth_best_score,
                  tenth_best_avg_word_score,
                  tenth_best_best_word_score
           FROM users
           WHERE id = $1`,
        [baseInfo.userId]
      );
      userInfo = userInfoRes.rows[0];

      // get recent single scores for calculating wmas
      const recentScoresRes = await db.query(
          `SELECT id, score
           FROM plays
           WHERE user_id = $1
           ORDER BY id DESC
           LIMIT $2`,
        [baseInfo.userId, wmasToCalc[0] + 1]
      );
      const recentScores = recentScoresRes.rows;

      // if there are enough scores to calculate any of the wmas, continue
      if (recentScores.length >= wmasToCalc.slice(-1)[0]) {
        // calculate all wmas with enough records and add to userUpdates
        for (const wma of wmasToCalc) {
          if (recentScores.length < wma) continue;
          const wmaNumerator = recentScores.slice(0, wma).reduce((accum, curr, idx) => {
            return accum + curr.score * (wma - idx);
          }, 0);
          const wmaDenominator = (wma * (wma + 1)) / 2;
          const wmaCalculation = wmaNumerator / wmaDenominator;
          const wmaCalculationRounded = Math.round(wmaCalculation * 100) / 100;
          userUpdates[`curr_${wma}_wma`] = wmaCalculationRounded;
          statsToReturn[`curr${wma}Wma`] = wmaCalculationRounded;
        }

        // check for new peak wmas and add peak wmas to userUpdates if needs updating
        for (const wma of wmasToCalc) {
          if (userUpdates[`curr_${wma}_wma`] > userInfo[`peak_${wma}_wma`]) {
            userUpdates[`peak_${wma}_wma`] = userUpdates[`curr_${wma}_wma`];
            statsToReturn[`isPeak${wma}Wma`] = true;
          }
        }

        // check tenth bests, update tenth best in plays,
        // and add new elevenths to playIdsToDelete if not needed anymore
        if (recentScores.length >= 10) {
          const statsForCheck10th = ['score', 'avg_word_score', 'best_word_score'];
          const selectRowsStr = statsForCheck10th.reduce((accum, curr) => {
            return accum + `, ${curr}`;
          });

          // for each stat
          for (const stat of statsForCheck10th) {
            // check if play result is better than user's tenth best
            if (baseInfo.score > userInfo[`tenth_best_${stat}`]) {
              // if so, get tenth and eleventh best
              const tenthAndEleventhRes = await db.query(
                  `SELECT id, ${selectRowsStr}
                   FROM plays
                   WHERE user_id = $1
                   ORDER BY ${stat} DESC
                   LIMIT 2
                   OFFSET 9`,
                [baseInfo.userId]
              );
              const tenthAndEleventh = tenthAndEleventhRes.rows;

              // replace user's old tenth best score with new tenth best 
              userUpdates[`tenth_best_${stat}`] = tenthAndEleventh[0][stat];

              // check if 11th is no longer needed, if so, delete
              let deleteEleventh = true;
              // if you find this eleventh play in recent 101 games, then don't delete
              if (recentScores.find(row => row.id === tenthAndEleventh[1].id)) {
                deleteEleventh = false;
              }
              // otherwise check if needed for other best stats
              else {
                for (const stat of statsForCheck10th) {
                  if (tenthAndEleventh[1][stat] > userInfo[`tenth_best_${stat}`]) {
                    deleteEleventh = false;
                    break;
                  }
                }
              }

              // if we can delete it, push id into delete array
              if (deleteEleventh) {
                playIdsToDelete.push(tenthAndEleventh[1].id);
              }
            }
          }

          // check if 101st play is needed, if not, delete
          // get play information for 101st play
          if (recentScores.length >= 101) {
            const _101stPlayRes = await db.query(
                 `SELECT ${selectRowsStr}
                  FROM plays
                  WHERE id = $1`,
              [recentScores[100].id] 
            );
            const _101stPlay = _101stPlayRes.rows[0];

            // check if 101st is one of the tenth best of other stats
            let delete101st = true;
            for (const stat of statsForCheck10th) {
              if (_101stPlay[stat] > userInfo[`tenth_best_${stat}`]) {
                delete101st = false;
                break;
              }
            }
            // if we can delete it, push id into delete array
            if (delete101st) {
              playIdsToDelete.push(recentScores[100].id);
            }
          }
        }
      }
    }

    // process extra stats
    const extraStatsToProcess = {longestWord: "longest_word", craziestWord: 'craziest_word'};
    for (const stat in extraStatsToProcess) {
      // if the just played stat is better than the stored stat
      if (extraStats[`${stat}Score`] > userInfo[`${extraStatsToProcess[stat]}_score`]) {
        // store the superior newly played stat values in user updates
        userUpdates[extraStatsToProcess[stat]] = extraStats[stat];
        userUpdates[`${extraStatsToProcess[stat]}_score`] = extraStats[`${stat}Score`];
      }
    }

    // apply updates to user
    if (Object.keys(userUpdates).length) {
      const updateQuery = createUpdateQuery('users', userUpdates, [["id", "=", baseInfo.userId]]);
      await db.query(updateQuery.sqlStatement, updateQuery.valuesArray);
    }

    // remove any duplicates from playIdsToDelete
    const uniquePlayIdsToDelete = [...new Set(playIdsToDelete)];
    // delete plays from playIdsToDelete
    const numofIdsToDelete = uniquePlayIdsToDelete.length;
    if (numofIdsToDelete) {
      let inList = '$1';
      for (let i = 2; i <= numofIdsToDelete; i++) {
        inList += `, $${i}`;
      }
      await db.query(
           `DELETE FROM plays
            WHERE id IN (${inList})`,
        uniquePlayIdsToDelete
      );
    }
    return statsToReturn;
  }

  /** Delete given play from database; returns undefined. */

  static async remove(playId) {
    let result = await db.query(
          `DELETE
           FROM plays
           WHERE id = $1
           RETURNING id`,
        [playId],
    );
    const play = result.rows[0];

    if (!play) throw new NotFoundError(`No play: ${playId}`);
  }
}

module.exports = SoloStat;