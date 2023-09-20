"use strict";

/** Routes for plays. */

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureLoggedIn, ensureAdmin, ensureCorrectUserInBodyOrAdmin } = require("../middleware/auth-ware");
const { BadRequestError } = require("../expressError");
const SoloStat = require("../models/solo-stat-model");
const soloStatGetSchema = require("../schemas/soloStatGet.json");
const soloStatPatchSchema = require("../schemas/soloStatPatch.json");

const router = express.Router();

/** GET /[userId] => { stats: { solo3: [ stat1, stat2, stat3, ... ], ... } }
 *
 * Returns list of all recent stats for a user optionally by gameType.
 * 
 * Can filter on provided search filters:
 * - gameType
 *
 * Authorization required: none
 **/

router.get("/:userId", async function (req, res, next) {
  try {
    const filters = req.query;
    const validator = jsonschema.validate(filters, soloStatGetSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }

    const stats = await SoloStat.get(req.params.userId, filters);
    return res.json({ stats });
  } catch (err) {
    return next(err);
  }
});


/** PATCH /[userId] { soloStat }  => { soloStat }
 *
 * Adds a new soloStat when a user starts a new game
 * This prevents the user from closing the browser to avoid posting the stat of a bad game
 * At the completion of the game this soloStat will be updated with full stats
 * Also updates last_play_single and num_of_games_played in users data for user
 * 
 * Provide the following soloStat obj:
 * {
 *   curr_20_wma,
 *   curr_100_wma
 * }
 * 
 * This returns soloStatId to allow easy update after soloStat is complete
 *
 * Authorization required: logged in
 **/

router.patch("/game-start/:userId/:gameType", ensureCorrectUserInBodyOrAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, soloStatPatchSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const soloStatId = await SoloStat.patchAtGameStart(req.params.userId, req.params.gameType, req.body);
    return res.status(201).json({ soloStatId });
  } catch (err) {
    return next(err);
  }
});


/** PATCH /[soloStatId] { soloStat }  => { soloStat }
 *
 * Updates the soloStat at the completion of a game with full stats
 * 
 * Provide the following soloStat obj:
 * {
 *   curr_20_wma, (curr_20_wma will also be set as peak_20_wma if greater)
 *   curr_100_wma (curr_100_wma will also be set as peak_20_wma if greater)
 * }
 *
 * This returns newly calculated stats:
 *  {
 *    stats: avgWordStat, curr100Wma, curr10Wma, isPeak100Wma, isPeak10Wma
 *  }
 *
 * Authorization required: same user as user in patched stat
 **/

router.patch("/game-end/:soloStatId", ensureLoggedIn, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, soloStatPatchSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const stats = await Play.patchAtGameEnd(req.params.userId, req.params.gameType, req.body);
    return res.status(201).json({ stats });
  } catch (err) {
    return next(err);
  }
});


/** DELETE /[soloStatId]  =>  { deleted: soloStatId }
 *
 * Authorization required: admin
 **/

router.delete("/:soloStatId", ensureAdmin, async function (req, res, next) {
  try {
    await Play.delete(req.params.soloStatId);
    return res.json({ deleted: req.params.soloStatId });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;