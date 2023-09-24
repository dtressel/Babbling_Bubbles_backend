"use strict";

/** Routes for plays. */

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureLoggedIn, ensureAdmin, ensureCorrectUserInBodyOrAdmin } = require("../middleware/auth-ware");
const { BadRequestError } = require("../expressError");
const SoloScore = require("../models/solo-score-model");
const soloScoreGetSchema = require("../schemas/soloScoreGet.json");
const soloScorePatchSchema = require("../schemas/soloScorePatch.json");
const soloScorePostSchema = require("../schemas/soloScorePost.json");

const router = express.Router();

/** GET /[userId] => { scores: { solo3: [ score1, score2, score3, ... ], ... } }
 *
 * Returns list of all recent scores for a user optionally by gameType.
 * 
 * Can filter on provided search filters:
 * - gameType
 * - limit (number of words to retrieve, from best to worst, defaults to null resulting in retrieving all)
 * - offset (number result to start at, defaults to 0)
 *
 * Authorization required: none
 **/

router.get("/:userId", async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.query, soloScoreGetSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const { limit, offset, gameType } = req.query;
    const scores = await SoloScore.get(req.params.userId, gameType, limit, offset);
    return res.json({ scores });
  } catch (err) {
    return next(err);
  }
});


/** POST /[userId] { soloScore }  => { soloScore }
 *
 * Adds a new soloScore when a user starts a new game
 * This prevents the user from closing the browser to avoid posting the score of a bad game
 * At the completion of the game this soloScore will be updated with full stats
 * Also updates last_play_single and num_of_games_played in users data for user
 * 
 * No Data needs to be provided in body
 *
 * Returns { soloScoreId, curr20Wma, curr100Wma }
 *
 * Authorization required: logged in
 **/

router.post("/game-start/:userId/:gameType", ensureCorrectUserInBodyOrAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, soloScorePostSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const soloScoreId = await SoloScore.postAtStartGame(req.params.userId, req.params.gameType);
    return res.status(201).json({ soloScoreId });
  } catch (err) {
    return next(err);
  }
});


/** PATCH /[soloScoreId] { soloScore }  => { soloScore }
 *
 * Updates the soloScore at the completion of a game with full stats
 * 
 * Provide the following soloScore obj:
 * {
 *    userId,
 *    gameType, 
 *    score
 * }
 *
 * This returns newly calculated stats:
 *  {
 *    stats: curr100Wma, curr20Wma
 *  }
 *
 * Authorization required: same user as user in patched score
 **/

router.patch("/:soloScoreId", ensureLoggedIn, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, soloScorePatchSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const stats = await Play.updateAtGameOver(req.params.soloScoreId, req.body);
    return res.status(201).json({ stats });
  } catch (err) {
    return next(err);
  }
});


/** DELETE /[soloScoreId]  =>  { deleted: soloScoreId }
 *
 * Authorization required: admin
 **/

router.delete("/:soloScoreId", ensureAdmin, async function (req, res, next) {
  try {
    await Play.delete(req.params.soloScoreId);
    return res.json({ deleted: req.params.soloScoreId });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;