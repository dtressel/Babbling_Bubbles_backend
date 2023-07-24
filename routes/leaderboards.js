"use strict";

/** Routes for leaderboards. */

const express = require("express");
const Leaderboard = require("../models/leaderboard-model");

const router = express.Router();

/** GET / => 
 *  { 
 *    leaderboards: {
 *      bestAvgWordScoreMin15: [{playId, username, playTime, avgWordScore}, {...}, ...],
 *      bestCurrent100Wma: [{playId, username, curr100Wma}, {...}, ...],
 *      bestCurrent10Wma: [{playId, username, curr10Wma}, {...}, ...],
 *      bestPeak100Wma: [{playId, username, Peak100Wma}, {...}, ...],
 *      bestPeak10Wma: [{playId, username, Peak10Wma}, {...}, ...],
 *      bestPlayScoresSingle: [{playId, username, playTime, score}, {...}, ...],
 *      bestWordScores: [{playId, username, playTime, bestWord, bestWordScore}, {...}, ...]
 *    } 
 *  }
 *
 * Returns all leaderboards up to 10 entries per leaderboard.
 *
 * Authorization required: none
 **/

router.get("/", async function (req, res, next) {
  try {
    const leaderboards = await Leaderboard.getAll();
    return res.json({ leaderboards });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;