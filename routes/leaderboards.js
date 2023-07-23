"use strict";

/** Routes for leaderboards. */

const express = require("express");
const Leaderboard = require("../models/leaderboard-model");

const router = express.Router();

/** GET / => { users: [ { username, firstName, lastName, email, country, dateRegistered, permissions }, ... ] }
 *
 * Returns all leaderboards up to 10 entries.
 *
 * Authorization required: none
 **/

router.get("/", async function (req, res, next) {
  try {
    const leaderboards = await Leaderboard.getAll();
    return res.json({ leaderboards });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;