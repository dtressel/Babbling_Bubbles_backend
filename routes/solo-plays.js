"use strict";

/*
  Single route for posting and patching information for a new solo play.
*/

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureLoggedIn, ensureCorrectUserOrAdmin } = require("../middleware/auth-ware");
const { BadRequestError } = require("../expressError");
const SoloPlay = require("../models/solo-play-model");
const soloPlayPostSchema = require("../schemas/soloPlayPost.json");
const soloPlayPatchSchema = require("../schemas/soloPlayPatch.json");

const router = express.Router();


/** POST /[userId] { play }  => { play }
 *
 * Adds a new play when a user starts a new game
 * This prevents the user from closing the browser to avoid posting the score of a bad game
 * At the completion of the game this play will be updated with full stats
 * Also updates last_play_single and num_of_games_played in users data for user
 * 
 * Provide the following play obj:
 * {
 *   gameType
 * }
 *
 * Returns
 * {
 *    playData: {
 *      soloScoreId,
 *      soloStatId,
 *      bstWordScoreBar,
 *      crzWordScoreBar,
 *      lngWordScoreBar
 *    }
 * }
 *
 * Authorization required: correct user or admin
 **/

router.post("/:userId", ensureCorrectUserOrAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, soloPlayPostSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const playData = await SoloPlay.atGameStart(req.params.userId, req.body.gameType);
    return res.status(201).json({ playData });
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
 *    soloStatId,
 *    score,
 *    numOfWords,
 *    bestWords: [{ bestType, word, score, boardState }, ...]
 * }
 *
 * Returns
 *  {
 *    stats: {
 *      avgWordScore (may not be present if score = 0),
 *      curr20Wma (may not be present if below game threshold),
 *      peak20Wma (may not be present if below game threshold),
 *      curr100Wma (may not be present if below game threshold),
 *      peak100Wma (may not be present if below game threshold),
 *      isPeak20Wma (may not be present),
 *      isPeak100Wma (may not be present),
 *      ttlScorePlace (may not be present),
 *      avgScorePlace (may not be present)
 *    }
 *  }
 *
 * Authorization required: logged in, later checks if the data that it's updating is for the correct user
 **/

router.patch("/:playId", ensureLoggedIn, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, soloPlayPatchSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const stats = await SoloPlay.atGameEnd(req.params.playId, req.body, res.locals.user.userId);
    return res.status(200).json({ stats });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;