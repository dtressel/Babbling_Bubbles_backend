"use strict";

/** Routes for plays. */

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureLoggedIn, ensureAdmin, ensureCorrectUserInBodyOrAdmin } = require("../middleware/auth-ware");
const { BadRequestError } = require("../expressError");
const SoloScore = require("../models/solo-score-model");
const soloScoreGetSchema = require("../schemas/soloScoreGet.json");
const soloScorePatchSchema = require("../schemas/soloScoreGet.json");
const soloScorePostSchema = require("../schemas/soloScoreGet.json");

const router = express.Router();

/** GET /[userId] => { scores: { solo3: [ score1, score2, score3, ... ], ... } }
 *
 * Returns list of all recent scores for a user optionally by gameType.
 * 
 * Can filter on provided search filters:
 * - gameType
 * - num (number of scores to retrieve, from newest to oldest, defaults to all)
 *
 * Authorization required: none
 **/

router.get("/:userId", async function (req, res, next) {
  try {
    const filters = req.query;
    const validator = jsonschema.validate(filters, soloScoreGetSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }

    const scores = await SoloScore.get(req.params.userId, filters);
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
 * Provide the following soloScore obj:
 * {
 *   gameType
 * }
 *
 * This returns soloScoreId to allow easy update after soloScore is complete
 *
 * Authorization required: logged in
 **/

router.post("/:userId", ensureCorrectUserInBodyOrAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, soloScorePostSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const soloScoreId = await SoloScore.addAtStartGame(req.params.userId, req.body);
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
 *     score
 * }
 *
 * This returns newly calculated stats:
 *  {
 *    stats: avgWordScore, curr100Wma, curr10Wma, isPeak100Wma, isPeak10Wma
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