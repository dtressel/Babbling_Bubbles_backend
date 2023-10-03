"use strict";

/** Routes for leaderboards. */

const jsonschema = require("jsonschema");

const express = require("express");
const Leaderboard = require("../models/leaderboard-model");
const leaderboardGetSchema = require("../schemas/leaderboardGet.json");

const router = express.Router();

/** GET / => 
 * 
 *  can choose game type for displayed leaderboards with query parameter:
 *  
 *    -gameType = solo3, solo10, free (solo3 is default) 
 * 
 *  { 
 *    leaderboards: {
 *      bestAvgWordScoreMin15: [{playId, username, playTime, avgWordScore}, {...}, ...],
 *      bestCurrent100Wma: [{playId, username, curr100Wma}, {...}, ...],
 *      bestCurrent10Wma: [{playId, username, curr10Wma}, {...}, ...],
 *      bestPeak100Wma: [{playId, username, peak100Wma}, {...}, ...],
 *      bestPeak10Wma: [{playId, username, peak10Wma}, {...}, ...],
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
    const filters = req.query;
    const validator = jsonschema.validate(filters, leaderboardGetSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    if (!filters.gameType) filters.gameType = "solo3";
    const leaderboards = await Leaderboard.getByType(filters);
    return res.json({ leaderboards });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;