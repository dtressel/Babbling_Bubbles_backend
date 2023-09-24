"use strict";

/*
  Single route for posting and patching information for a new solo play.
*/

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureLoggedIn, ensureAdmin, ensureCorrectUserInBodyOrAdmin } = require("../middleware/auth-ware");
const { BadRequestError } = require("../expressError");
const Play = require("../models/play-model");
const soloPlayPostSchema = require("../schemas/soloPlayPost.json");
const soloPlayPatchSchema = require("../schemas/soloPlayPatch.json");

const router = express.Router();


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
 *   gameType
 * }
 *
 * Returns
 * {
 *    soloScoreId,
 *    soloStatId,
 *    bstWordScoreBar,
 *    crzWordScoreBar,
 *    lngWordScoreBar
 * }
 *
 * Authorization required: logged in
 **/

router.post("/", ensureCorrectUserInBodyOrAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, soloPlayPostSchema);
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
 *    userId,
 *    gameType,
 *    soloScoreId,
 *    solostatId,
 *    score,
 *    numOfWords,
 *    bestWords: [{ type, word, score, boardState }, ...]
 * }
 *
 * Returns
 *  {
 *    stats: {
 *      curr20Wma,
 *      peak20Wma,
 *      curr100Wma,
 *      peak100Wma,
 *      isPeak20Wma (may not be present),
 *      isPeak100Wma (may not be present)
 *    }
 *  }
 *
 * Authorization required: logged in
 **/

router.patch("/:playId", ensureLoggedIn, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, soloPlayPatchSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const stats = await Play.updateAtGameOver({ playId: req.params.playId, ...req.body });
    return res.status(200).json({ stats });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;