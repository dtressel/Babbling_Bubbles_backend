"use strict";

/** Routes for users. */

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureCorrectUserOrAdmin, ensureAdmin } = require("../middleware/auth-ware");
const { BadRequestError } = require("../expressError");
const User = require("../models/user-model");
const { createToken } = require("../helpers/tokens");
const userUpdateSchema = require("../schemas/userUpdate.json");
const userUpdateSpecialSchema = require("../schemas/userUpdateSpecial.json");
const userAddSchema = require("../schemas/userAdd.json");
const userJustPasswordSchema = require("../schemas/userJustPassword.json");
const userJustUsernameSchema = require("../schemas/userJustUsername.json");
const userGetProfileSchema = require("../schemas/userGetProfile.json");

const router = express.Router();

// **********************create check if correct user method in auth-ware and apply here ******************************

/** POST / { user }  => { user, token }
 *
 * Adds a new user. This is not the registration endpoint --- instead, this is
 * only for admin users to add new users. The new user being added can be an
 * admin.
 *
 * This returns the newly created user and an authentication token for them:
 *  {
 *    user: { username, email, bio, country, dateRegistered, permissions},
 *    token: token
 *  }
 *
 * Authorization required: admin
 **/

router.post("/", ensureAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, userAddSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }

    const user = await User.add(req.body);
    const token = createToken(user);
    return res.status(201).json({ user, token });
  } catch (err) {
    return next(err);
  }
});


/** GET / => { users: [ { id, username, email, bio, country, dateRegistered, permissions }, ... ] }
 *
 * Returns list of all users.
 *
 * Authorization required: none
 **/

router.get("/", async function (req, res, next) {
  try {
    const users = await User.findAll();
    return res.json({ users });
  } catch (err) {
    return next(err);
  }
});


/** GET /[userId] => { user }
 * 
 * Get info on user by id
 *
 * Returns { user: { id, username, email, country, wordsFound, dateRegistered, permissions } }
 *
 * Authorization required: none
 **/

router.get("/:userId", async function (req, res, next) {
  try {
    const user = await User.get("id", req.params.userId);
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
});

/** GET /[username]/username => { user }
 * 
 * Get info on user by username
 *
 * Returns { user: { <user data> } }
 *
 * Authorization required: none
 **/

router.get("/:username/username", async function (req, res, next) {
  try {
    const user = await User.get("username", req.params.username);
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
});


/** PATCH /[userId] { user } => { user }
 *
 * Data can include:
 *   { email, bio, country, newPasssword, currPassword (for additional verification, required) }
 *
 * Returns { user: { userId, username, email, bio, country, permissions } }
 *
 * Authorization required: same-user-as-:username or admin
 **/

router.patch("/:userId", ensureCorrectUserOrAdmin, async function (req, res, next) {
  try {
    for (const key in req.body) {
      if (req.body[key] === null) delete req.body[key];
    }
    const validator = jsonschema.validate(req.body, userUpdateSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    // Check if password is correct, if not, will throw error
    await User.checkIfCorrectPassword(req.params.userId, req.body.currPassword, "Current Password");
    delete req.body.currPassword;
    const user = await User.update(req.params.userId, req.body);
    return res.json({ user: { ...user, userId: req.params.userId } });
  } catch (err) {
    return next(err);
  }
});

/** DELETE /[userId]  =>  { deleted: username }
 * 
 * Route for user to delete self
 * 
 * Data required: password
 *
 * Authorization required: same-user-as-:username or admin
 **/

router.delete("/:userId", ensureCorrectUserOrAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, userJustPasswordSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    // Check if password is correct, if not, will throw error
    await User.checkIfCorrectPassword(req.params.userId, req.body.password);
    await User.remove(req.params.userId);
    return res.json({ deleted: req.params.userId });
  } catch (err) {
    return next(err);
  }
});


/** DELETE /[userId]/admin  =>  { deleted: username }
 * 
 * Route for admins to delete a user
 * 
 * Data required: username
 *
 * Authorization required: admin
 **/

router.delete("/:userId/admin", ensureAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, userJustUsernameSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    // Check if username is correct, if not, will throw error
    await User.checkIfUsernameMatchesUserId(req.params.userId, req.body.username);
    await User.remove(req.params.userId);
    return res.json({ deleted: req.params.userId });
  } catch (err) {
    return next(err);
  }
});


/** PATCH /[userId]/admin { user } => { user }
 *
 * Data can include:
 *   { username, password, email, bio, country, permissions }
 *
 * Returns { id, username, email, bio, country, permissions }
 *
 * Authorization required: admin
 **/

router.patch("/:userId/admin", ensureAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, userUpdateSpecialSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }

    const user = await User.update(req.params.userId, req.body);
    return res.json({ user: { ...user, userId: req.params.userId } });
  } catch (err) {
    return next(err);
  }
});

/** GET /[userId]/stats => { user }
 * 
 * Provide the following optional query parameters:
 *  - gameType (solo3, solo10, free), defaults to solo3
 *  - includeGeneralInfo (true, false), defaults to true
 *
 * Returns { 
 *   numOfPlaysSingle,
 *   curr10Wma,
 *   curr100Wma,
 *   best10Wma,
 *   best100Wma
 *   top10SinglePlays: [{ playId, playTime, score, numOfWords, bestWord, bestWordScore }, ...],
 *   top10Words: [{ playId, playTime, bestWord, bestWordScore, bestWordBoardState }, ...],
 *   top10AvgWordScores: [{ playId, playTime, avgWordScore, score, numOfWords }]
 * }
 *
 * Authorization required: none
 **/

router.get("/:userId/profile-data", async function (req, res, next) {
  try {
    const filters = req.query;
    const validator = jsonschema.validate(filters, userGetProfileSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    if (filters.includeGeneralInfo === undefined) filters.includeGeneralInfo = true;
    else filters.includeGeneralInfo = (filters.includeGeneralInfo === "true");
    const stats = await User.getProfileData(req.params.userId, filters);
    return res.json(stats);
  } catch (err) {
    return next(err);
  }
});



/** GET /[userId]/stats => { user }
 *
 * Provide the following query parameters:
 *  - gameType (solo3, solo10, free)
 *  - excludeGeneralInfo (true, false)
 *
 * Returns { 
 *   numOfPlaysSingle,
 *   curr10Wma,
 *   curr100Wma,
 *   best10Wma,
 *   best100Wma
 *   top10SinglePlays: [{ playId, playTime, score, numOfWords, bestWord, bestWordScore }, ...],
 *   top10Words: [{ playId, playTime, bestWord, bestWordScore, bestWordBoardState }, ...],
 *   top10AvgWordScores: [{ playId, playTime, avgWordScore, score, numOfWords }]
 * }
 *
 * Authorization required: none
 **/

router.get("/:username/profile-data-by-username/", async function (req, res, next) {
  try {
    const filters = req.query;
    const validator = jsonschema.validate(req.query, userGetProfileSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    if (filters.includeGeneralInfo === undefined) filters.includeGeneralInfo = true;
    else filters.includeGeneralInfo = (filters.includeGeneralInfo === "true");
    const stats = await User.getProfileDataByUsername(req.params.username, filters);
    return res.json(stats);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
