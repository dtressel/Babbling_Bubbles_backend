"use strict";

const SoloScore = require("../models/solo-score-model");
const SoloStat = require("../models/solo-stat-model");
const BestScore = require("../models/best-score-model");
const BestWord = require("../models/best-word-model");
const User = require("../models/user-model");

/** Related functions for plays. */

class SoloPlay {
  static bestTypes = ['bst', 'lng', 'crz'];

  static async atGameStart(userId, gameType) {
    if (gameType = 'free') return await this.atGameStartFree(userId);

    const soloScorePromise = SoloScore.postAtGameStart(userId, gameType);
    const soloStatPromise = SoloStat.patchAtGameStart(userId, gameType);
    const bestWordPromises = this.bestTypes.map((bestType) => {
      // returned is { score } or undefined (if no scores yet)
      return BestWord.getTenthBest(userId, { gameType, bestType });
    });

    const results = await Promise.all([soloScorePromise, soloStatPromise, ...bestWordPromises]);

    const gameData = { playId: results[0].soloScoreId };

    for (let i = 0; i < this.bestTypes.length; i++) {
      const bestType = this.bestTypes[i];
      gameData[`${bestType}WordScoreBar`] = results[i + 2]?.score || 0;
    }
    
    return gameData;
  }

  /*
    Provide the following data object:
    {
      score,
      numOfWords,
      bestWords: [{ bestType, word, score, boardState }, ...]
    }

    Returns:
    {
      avgWordScore,
      curr20Wma (may not be present if below game threshold),
      peak20Wma (may not be present if below game threshold),
      curr100Wma (may not be present if below game threshold),
      peak100Wma (may not be present if below game threshold),
      isPeak20Wma (may not be present),
      isPeak100Wma (may not be present),
      ttlScorePlace (may not be present),
      avgScorePlace (may not be present)
    } 
  */

  static async atGameEnd(playId, data, loggedInUserId) {
    if (playId == 0) return await this.atGameStartFree(data, loggedInUserId);

    const userInfoAndWmas = await SoloScore.patchAtGameEnd(playId, data.score, loggedInUserId);
    const { userId, gameType, ...currWmas } = userInfoAndWmas;
    /* if there is no userId, that means that nothing was updated and that the logged
       in user does not match the user associated with this particular playId */ 
    if (!userId) {
      throw new UnauthorizedError();
    }
    const newPromises2 = [];
    const promiseNames2 = [];

    promiseNames2.push('soloStats');
    newPromises2.push(SoloStat.patchAtGameEnd(userId, gameType, currWmas));

    if (data.numOfWords) {
      promiseNames2.push('user');
      newPromises2.push(User.updateWordsFound(userId, data.numOfWords)); /* returns nothing */
    } 

    if (data.score) {
      promiseNames2.push('bestTtlScores');
      newPromises2.push(BestScore.getTenBest(userId, { gameType, scoreType: 'ttl' }));
    }

    if (data.numOfWords >= 15) {
      promiseNames2.push('bestAvgScores');
      newPromises2.push(BestScore.getTenBest(userId, { gameType, scoreType: 'avg' }));
    }

    if (data.bestWords.length) {
      promiseNames2.push('bestWords');
      newPromises2.push(BestWord.post(userId, { gameType, words: data.bestWords })); /* returns nothing */
    }

    const results2Arr = await Promise.all(newPromises2);
    // change results 2 from an array of values to object of key/value pairs
    const results2 = results2Arr.reduce((accum, curr, idx) => {
      return { ...accum, [promiseNames2[idx]]: curr };
    }, {});

    const returnObj = { ...(results2.soloStats || {}) }; /* adds curr, peak, and isPeak */

    // array to contain any best score updates, may remain empty
    const bestScoresUpdates = [];
    // If total score is in top ten or if there are not yet any top scores
    // (results2.bestTtlScores may be undefined or an empty array)
    if (
      data.score > results2.bestTtlScores?.at(-1)?.score
      || results2.bestTtlScores?.length < 10
    ) {
      let i = results2.bestTtlScores.length - 1;
      while (i >= 0 && data.score > results2.bestTtlScores[i].score) {
        i--;
      }
      const ttlPlace = i + 2;
      returnObj.ttlScorePlace = ttlPlace;
      bestScoresUpdates.push({ scoreType: 'ttl', score: data.score });
    }
    // Find average word score and add to return object
    if (data.score) {
      const avgWordScore = Math.round(data.score / data.numOfWords * 100) / 100;
      returnObj.avgWordScore = avgWordScore;
      // See if average word score is in top ten
      if (
        avgWordScore > results2.bestAvgScores?.at(-1)?.score
        || results2.bestAvgScores?.length < 10
      ) {
        let i = results2.bestAvgScores.length - 1;
        while (i >= 0 && avgWordScore > results2.bestAvgScores[i].score) {
          i--;
        }
        const avgPlace = i + 2;
        returnObj.avgScorePlace = avgPlace;
        bestScoresUpdates.push({ scoreType: 'avg', score: avgWordScore });
      }
    }
    // if either type of score is in top ten, update best scores table
    if (bestScoresUpdates.length) {
      await BestScore.post(userId, { gameType, scores: bestScoresUpdates });
    }

    return returnObj;
  }

  static async atGameStartFree(userId) {
    const filters = { gameType: "free", bestType: "bst" };
    const tenBestWordsPromise = BestWord.getWordScore(userId, filters, 10);

    const tenthBestWordPromises = this.bestTypes.map((bestType) => {
      // returned is { score } or undefined (if no scores yet)
      return BestWord.getTenthBest(userId, { gameType: "free", bestType });
    });

    const results = await Promise.all([tenBestWordsPromise, ...tenthBestWordPromises]);

    const gameData = { playId: 0, tenBestWords: results[0] };

    for (let i = 0; i < this.bestTypes.length; i++) {
      const bestType = this.bestTypes[i];
      gameData[`${bestType}WordScoreBar`] = results[i + 1]?.score || 0;
    }
    
    return gameData;
  }


  static async atGameEndFree(data, userId) {
    const newPromises2 = [];
    const promiseNames2 = [];

    if (data.numOfWords) {
      promiseNames2.push('user');
      newPromises2.push(User.updateWordsFound(userId, data.numOfWords)); /* returns nothing */
    } 

    if (data.numOfWords >= 15) {
      promiseNames2.push('bestAvgScores');
      newPromises2.push(BestScore.getTenBest(userId, { gameType, scoreType: 'avg' }));
    }

    if (data.bestWords.length) {
      promiseNames2.push('bestWords');
      newPromises2.push(BestWord.post(userId, { gameType, words: data.bestWords })); /* returns nothing */
    }

    // await all promises in newPromises2
    const results2Arr = await Promise.all(newPromises2);
    // change results 2 from an array of values to object of key/value pairs
    const results2 = results2Arr.reduce((accum, curr, idx) => {
      return { ...accum, [promiseNames2[idx]]: curr };
    }, {});

    const returnObj = {};

    // array to contain any best score updates, may remain empty
    const bestScoresUpdates = [];
    // If total score is in top ten or if there are not yet any top scores
    // (results2.bestTtlScores may be undefined or an empty array)
    if (
      data.score > results2.bestTtlScores?.at(-1)?.score
      || results2.bestTtlScores?.length < 10
    ) {
      let i = results2.bestTtlScores.length - 1;
      while (i >= 0 && data.score > results2.bestTtlScores[i].score) {
        i--;
      }
      const ttlPlace = i + 2;
      returnObj.ttlScorePlace = ttlPlace;
      bestScoresUpdates.push({ scoreType: 'ttl', score: data.score });
    }
    // Find average word score and add to return object
    if (data.score) {
      const avgWordScore = Math.round(data.score / data.numOfWords * 100) / 100;
      returnObj.avgWordScore = avgWordScore;
      // See if average word score is in top ten
      if (
        avgWordScore > results2.bestAvgScores?.at(-1)?.score
        || results2.bestAvgScores?.length < 10
      ) {
        let i = results2.bestAvgScores.length - 1;
        while (i >= 0 && avgWordScore > results2.bestAvgScores[i].score) {
          i--;
        }
        const avgPlace = i + 2;
        returnObj.avgScorePlace = avgPlace;
        bestScoresUpdates.push({ scoreType: 'avg', score: avgWordScore });
      }
    }
    // if either type of score is in top ten, update best scores table
    if (bestScoresUpdates.length) {
      await BestScore.post(userId, { gameType, scores: bestScoresUpdates });
    }

    return returnObj;
  }
}

module.exports = SoloPlay;