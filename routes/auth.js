"use strict";

/** Routes for authentication. */

const jsonschema = require("jsonschema");

const User = require("../models/user-model");
const express = require("express");
const router = new express.Router();
const { createToken } = require("../helpers/tokens");
const userLoginSchema = require("../schemas/userLogin.json");
const userRegisterSchema = require("../schemas/userRegister.json");
const { BadRequestError } = require("../expressError");

/** POST /auth/login:  { username, password } => { user: { userInfo }, token: token }
 *
 * Returns JWT token which can be used to authenticate further requests.
 *
 * Authorization required: none
 */

router.post("/login", async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, userLoginSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }

    const { username, password } = req.body;
    const user = await User.authenticate(username, password);
    const token = createToken(user);
    return res.json({ user, token });
  } catch (err) {
    return next(err);
  }
});


/** POST /auth/register:   { user } => { user: { userInfo }, token: token }
 *
 * user must include { username, password, email, country(optional) }
 *
 * Returns JWT token which can be used to authenticate further requests.
 *
 * Authorization required: none
 */

router.post("/register", async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, userRegisterSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }

    const newUser = await User.register({ ...req.body, permissions: 0 });
    const token = createToken(newUser);
    return res.status(201).json({ user: newUser, token });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;
