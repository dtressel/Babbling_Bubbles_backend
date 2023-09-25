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
    const soloScorePromise = SoloScore.postAtGameStart(userId, gameType);
    const soloStatPromise = SoloStat.patchAtGameStart(userId, gameType);
    const bestTypePromises = this.bestTypes.map((bestType) => {
      return BestWord.getTenthBest(userId, { bestType: bestType });
    })
    const results = await Promise.all([soloScorePromise, soloStatPromise, ...bestTypePromises]);

    const gameData = { ...results[0], ...results[1] };

    for (let i = 0; i < this.bestTypes.length; i++) {
      const bestType = this.bestTypes[i];
      gameData[`${bestType}WordScoreBar`] = results[i + 2].score;
    }
    
    return gameData;
  }

  static async atGameEnd(playId, data, loggedInUserId) {
    const userInfoAndWmas = await SoloScore.patchAtGameEnd(playId, data.score, loggedInUserId);
    const { userId, gameType, ...currWmas } = userInfoAndWmas;
    /* if there is no userId, that means that nothing was updated and that the logged
       in user does not match the user associated with this particular playId */ 
    if (!userId) {
      throw new UnauthorizedError();
    }
    const soloStatPromise = SoloStat.patchAtGameEnd(data.soloStatId, currWmas);
    const userPromise = User.updateWordsFound(userId, data.numOfWords); /* returns nothing */
    const bestTtlScoresPromise = BestScore.getTenBest(userId, { gameType, scoreType: 'bst' });
    const bestAvgScoresPromise = BestScore.getTenBest(userId, { gameType, scoreType: 'avg' });
    const bestWordsPromise = BestWord.post(userId, { gameType, words: data.bestWords }); /* returns nothing */
    const results = await Promise.all([
      soloStatPromise,
      userPromise,
      bestTtlScoresPromise,
      bestAvgScoresPromise,
      bestWordsPromise
    ]);
    const returnObj = { ...results[0] }; /* adds curr, peak, and isPeak */
    const bestScoresUpdates = [];
    // See if total score is in top ten
    if (data.score > results[2][9].score) {
      let i = 8;
      while (data.score > results[2][i].score) {
        i--;
      }
      const ttlPlace = i + 2;
      returnObj.ttlScorePlace = ttlPlace;
      bestScoresUpdates.push({ scoreType: 'ttl', score: data.score });
    }
    // See if average score is in top ten
    const avgWordScore = Math.round(data.score / data.numOfWords * 100) / 100;
    returnObj.avgWordScore = avgWordScore;
    if (avgWordScore > results[3][9].score) {
      let i = 8;
      while (avgWordScore > results[3][i].score) {
        i--;
      }
      const avgPlace = i + 2;
      returnObj.avgScorePlace = avgPlace;
      bestScoresUpdates.push({ scoreType: 'avg', score: avgWordScore });
    }
    // if either type of score is in top ten, update best scores table
    if (bestScoresUpdates.length) {
      await BestScore.post(userId, { gameType, scores: bestScoresUpdates });
    }

    return returnObj;
  }
}

module.exports = SoloPlay;