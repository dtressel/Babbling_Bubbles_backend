"use strict";

/** Routes for plays. */

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureLoggedIn, ensureAdmin } = require("../middleware/auth");
const { BadRequestError } = require("../expressError");
const Play = require("../models/play-model");
const playAddSchema = require("../schemas/playAdd.json");
const playSearchSchema = require("../schemas/playSearch.json");
const playUpdateSchema = require("../schemas/playUpdate.json");
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

/** GET / => { users: [ { username, firstName, lastName, email, country, dateRegistered, permissions }, ... ] }
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

router.get("/", async function (req, res, next) {
  const filters = req.query;
  // change numerical values into ints since everything arrives as strings
  for (const filter of filters) {
    if (playsFiltersNums.includes(filter)) {
      filters[filter] = +filters[filter];
    }
    else if (!playsFiltersAll.includes(filter)) {
      throw new BadRequestError(`${filter} is not a correct filter property.`);
    }
  }

  try {
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
 * Adds a new user. This is not the registration endpoint --- instead, this is
 * only for admin users to add new users. The new user being added can be an
 * admin.
 *
 * This returns the newly created user and an authentication token for them:
 *  {
 *    user: { username, email, firstName, lastName, country, dateRegistered, permissions},
 *    token: token
 *  }
 *
 * Authorization required: logged in
 **/

router.post("/", ensureLoggedIn, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, playAddSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }

    const play = await Play.add(req.body);
    return res.status(201).json({ play });
  } catch (err) {
    return next(err);
  }
});


/** GET /[playId] => { play }
 * 
 * Get info on user by id
 *
 * Returns { id, username, email, firstName, lastName, country, dateRegistered, permissions}
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


/** DELETE /[playId]  =>  { deleted: username }
 *
 * Authorization required: admin
 **/

router.delete("/:playId", ensureAdmin, async function (req, res, next) {
  try {
    await User.remove(req.params.playId);
    return res.json({ deleted: req.params.playId });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;