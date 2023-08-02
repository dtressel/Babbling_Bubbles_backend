"use strict";

/** Routes for plays. */

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureLoggedIn, ensureAdmin } = require("../middleware/auth-ware");
const { BadRequestError } = require("../expressError");
const Play = require("../models/play-model");
const playAddFullSchema = require("../schemas/playAddFull.json");
const playAddStartSchema = require("../schemas/playAddStart.json");
const playPatchSchema = require("../schemas/playPatch.json");
const playSearchSchema = require("../schemas/playSearch.json");
const playsFiltersNums = [
  "userId",
  "gameType",
  "minScore",
  "maxScore",
  "minNumOfWords",
  "maxNumOfWords",
  "minAvgWordScore",
  "maxAvgWordScore",
  "minBestWordScore",
  "maxBestWordScore"
];
const playsFiltersAll = [
  ...playsFiltersNums,
  "oldestDate",
  "newestDate",
  "bestWord"
];

const router = express.Router();

/** GET / => { plays: [ { play }, ... ] }
 *
 * Returns list of all plays and optionally by filter(s).
 * 
 * Can filter on provided search filters:
 * - userId
 * - gameType
 * - oldestDate
 * - newestDate
 * - minScore
 * - maxScore
 * - minNumOfWords
 * - maxNumOfWords
 * - minAvgWordScore
 * - maxAvgWordScore
 * - bestWord
 * - minBestWordScore
 * - maxBestWordScore
 *
 * Authorization required: none
 **/
// *************************************Date filters don't work****************************************************************
router.get("/", async function (req, res, next) {
  try {
    const filters = req.query;
    // change numerical values into ints since everything arrives as strings
    for (const filter in filters) {
      if (playsFiltersNums.includes(filter)) {
        filters[filter] = +filters[filter];
      }
      else if (!playsFiltersAll.includes(filter)) {
        throw new BadRequestError(`${filter} is not a correct filter property.`);
      }
    }
    const validator = jsonschema.validate(filters, playSearchSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }

    const plays = await Play.getAll(filters);
    return res.json({ plays });
  } catch (err) {
    return next(err);
  }
});


/** POST / { play }  => { play }
 *
 * Adds a new play when a user starts a new game
 * This prevents the user from closing the browser to avoid posting the score of a bad game
 * At the completion of the game this play will be updated with full stats
 * Also updates last_play_single and num_of_games_played in users data for user
 * 
 * Provide the following play obj:
 * {
 *   userId,
 *   gameType (optional, default = 0),
 *   gameId (optional)
 * }
 *
 * This returns playId to allow easy update after play is complete
 *
 * Authorization required: logged in
 **/

router.post("/", ensureLoggedIn, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, playAddStartSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const playId = await Play.addAtStartGame(req.body);
    return res.status(201).json({ playId });
  } catch (err) {
    return next(err);
  }
});


/** PATCH /[playId] { play }  => { play }
 *
 * Updates the play at the completion of a game with full stats
 * 
 * Provide the following play obj:
 * {
 *   baseInfo: {
 *     score,
 *     numOfWords,
 *     bestWord,
 *     bestWordScore,
 *     bestWordBoardState
 *   },
 *   extraStats: {
 *     craziestWord,
 *     craziestWordScore,
 *     craziestWordBoardState,
 *     longestWord,
 *     longestWordScore,
 *     longestWordBoardState
 *   }
 * }
 *
 * This returns newly calculated play stats and user stats:
 *  {
 *    stats: avgWordScore, curr100Wma, curr10Wma, isPeak100Wma, isPeak10Wma
 *  }
 *
 * Authorization required: logged in
 **/

router.patch("/:playId", ensureLoggedIn, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, playPatchSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const stats = await Play.updateAtGameOver({ playId: req.params.playId, ...req.body });
    return res.status(201).json({ stats });
  } catch (err) {
    return next(err);
  }
});


/** POST / { play }  => { play }
 *
 * Allows an admin to post a full play
 * 
 * Provide the following play obj:
 * {
 *   baseInfo: {
 *     userId,
 *     gameType,
 *     gameId (optional),
 *     score,
 *     numOfWords,
 *     bestWord,
 *     bestWordScore,
 *     bestWordBoardState
 *   },
 *   extraStats: {
 *     craziestWord,
 *     craziestWordScore,
 *     craziestWordBoardState,
 *     longestWord,
 *     longestWordScore,
 *     longestWordBoardState
 *   }
 * }
 *
 * This returns newly calculated play stats and user stats:
 *  {
 *    stats: avgWordScore, curr100Wma, curr10Wma, isPeak100Wma, isPeak10Wma
 *  }
 *
 * Authorization required: logged in
 **/

router.post("/full", ensureAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, playAddFullSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const stats = await Play.addFull(req.body);
    return res.status(201).json({ stats });
  } catch (err) {
    return next(err);
  }
});




/** GET /[playId] => { play }
 * 
 * Get info on play by id
 *
 * Returns { play }
 *
 * Authorization required: admin or same user-as-:username
 **/

router.get("/:playId", async function (req, res, next) {
  try {
    const play = await Play.get(req.params.playId);
    return res.json({ play });
  } catch (err) {
    return next(err);
  }
});


/** DELETE /[playId]  =>  { deleted: playId }
 *
 * Authorization required: admin
 **/

router.delete("/:playId", ensureAdmin, async function (req, res, next) {
  try {
    await Play.remove(req.params.playId);
    return res.json({ deleted: req.params.playId });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;