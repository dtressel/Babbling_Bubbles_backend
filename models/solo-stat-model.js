"use strict";

const db = require("../db");
const { combineWhereClauses, createInsertQuery, createUpdateQuery } = require("../helpers/sql-for-update");
const { NotFoundError } = require("../expressError");

/** Related functions for plays. */

class SoloStat {
  static filterKey = {
    userId: "user_id",
    gameType: "game_type",
    oldestDate: "play_time",
    newestDate: "play_time",
    minScore: "score",
    maxScore: "score",
    minNumOfWords: "num_of_words",
    maxNumOfWords: "num_of_words",
    bestWord: "best_word",
    minBestWordScore: "best_word_score",
    maxBestWordScore: "best_word_score"
  }

  static columnsJsToSqlKey = {
    userId: 'user_id',
    gameType: 'game_type',
    gameId: 'game_id',
    numOfWords: 'num_of_words',
    avgWordScore: 'avg_word_score',
    bestWord: 'best_word',
    bestWordScore: 'best_word_score',
    bestWordBoardState: 'best_word_board_state'
  }

  /** Find all plays optionally filtered by various filter parameters
   *
   * Returns [{ play }, ...]
   **/

  static async getAll(filters) {
    const whereClauses = this.buildWhereClauses(filters);
    const whereString = combineWhereClauses(whereClauses);
    const plays = await db.query(
          `SELECT id,
                  user_id AS "userId",
                  game_type AS "gameType",
                  game_id AS "gameID",
                  play_time AS "playTime",
                  score,
                  num_of_words AS "numOfWords",
                  avg_word_score AS "avgWordsScore",
                  best_word AS "bestWord",
                  best_word_score AS "bestWordScore",
                  best_word_board_state AS "bestWordBoardState"
           FROM plays
           ${whereString}
           ORDER BY id DESC`,
    );
    return plays.rows;
  }


  /* 
  * create an array of WHERE clauses for getAll and getAllAdmin methods
  **/
  //  **********************************************************use sql for partial update instead of this****************************
  static buildWhereClauses(filters) {
    const whereClauses = [];
    for (const filter in filters) {
      const first3Letters = filter.slice(0, 3);
      if (["min", "old"].includes(first3Letters)) {
        whereClauses.push(`${this.filterKey[filter]} >= ${filters[filter]}`);
      } 
      else if (["max", "new"].includes(first3Letters)) {
        whereClauses.push(`${this.filterKey[filter]} <= ${filters[filter]}`);
      }
      else if (filter === "bestWord") {
        whereClauses.push(`UPPER(${this.filterKey[filter]}) LIKE UPPER('%${filters[filter]}%')`);
      }
      else {
        whereClauses.push(`${this.filterKey[filter]} = ${filters[filter]}`);
      }
    }
    return whereClauses;
  }



    /** Given an id, return data about play.
   *
   * Throws NotFoundError if play not found.
   **/
  static async get(id) {
    const playRes = await db.query(
          `SELECT id,
                  user_id AS "userId",
                  game_type AS "gameType",
                  game_id AS "gameID",
                  play_time AS "playTime",
                  score,
                  num_of_words AS "numOfWords",
                  avg_word_score AS "avgWordsScore",
                  best_word AS "bestWord",
                  best_word_score AS "bestWordScore",
                  best_word_board_state AS "bestWordBoardState"
            FROM plays
            WHERE id = $1`,
        [id]
    );

    const play = playRes.rows[0];

    if (!play) throw new NotFoundError(`No play: ${id}`);

    return play;
  }


  /** Add new play at the start of a new single game without stats
  *
  * Returns playId
  **/
  static async addAtStartGame(data) {
    // insert new play into database
    const playInsertQuery = createInsertQuery('plays', data, this.columnsJsToSqlKey);
    const playInsertRes = await db.query(
      `${playInsertQuery.sqlStatement} RETURNING id`,
      playInsertQuery.valuesArray
    );
    const playId = playInsertRes.rows[0].id;

    // update database with info relevant to single plays
    if (data.gameType === 0 || data.gameType === undefined) {
      await db.query(
          `UPDATE users
           SET last_play_single = CURRENT_DATE,
               num_of_plays_single = num_of_plays_single + 1
           WHERE id = $1`,
        [data.userId]
      );
    }

    return playId;
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
    const playUpdateQuery = createUpdateQuery('plays', baseInfo, [["id", "=", playId]], this.columnsJsToSqlKey);
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