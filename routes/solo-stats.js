"use strict";

/** Routes for plays. */

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureAdmin, ensureCorrectUserOrAdmin } = require("../middleware/auth-ware");
const { BadRequestError } = require("../expressError");
const SoloStat = require("../models/solo-stat-model");
const soloStatGetSchema = require("../schemas/soloStatGet.json");
const soloStatPatchStartSchema = require("../schemas/soloStatPatchStart.json");
const soloStatPatchEndSchema = require("../schemas/soloStatPatchEnd.json");

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
 *    gameType
 * }
 * 
 * This returns soloStatId to allow easy update after soloStat is complete
 *
 * Authorization required: logged in
 **/

router.patch("/game-start/:userId", ensureCorrectUserOrAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, soloStatPatchStartSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const soloStatId = await SoloStat.patchAtGameStart(req.params.userId, req.body.gameType);
    return res.status(200).json({ soloStatId });
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
 *   game_type,
 *   curr20Wma, (curr20Wma will also be set as peak20Wma if greater)
 *   curr100Wma (curr100Wma will also be set as peak100Wma if greater)
 * }
 *
 * This returns newly calculated stats:
 *  {
 *    stats: curr20Wma, peak20Wma, curr100Wma, peak100Wma, isPeak20Wma (may not exist), isPeak100Wma (may not exist)
 *  }
 *
 * Authorization required: same user as user in patched stat
 **/

router.patch("/game-end/:userId", ensureAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, soloStatPatchEndSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const { gameType, ...data } = req.body
    const stats = await Play.patchAtGameEnd(req.params.userId, gameType, data);
    return res.status(201).json({ stats });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;