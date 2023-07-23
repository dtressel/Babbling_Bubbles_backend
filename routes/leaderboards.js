"use strict";

/** Routes for leaderboards. */

const express = require("express");
const Leaderboard = require("../models/leaderboard-model");

const router = express.Router();

/** GET / => { leaderboards: [
 *    bestAvgWordScoreMin15,
 *    bestCurrent100Wma,
 *    bestCurrent10Wma,
 *    bestPeak100Wma,
 *    bestPeak10Wma,
 *    bestPlayScoresSingle,
 *    bestWordScores
 * ] }
 *
 * Returns all leaderboards up to 10 entries.
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