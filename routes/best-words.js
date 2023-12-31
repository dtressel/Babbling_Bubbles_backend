"use strict";

/** Routes for best-words. */

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureAdmin, ensureCorrectUserOrAdmin } = require("../middleware/auth-ware");
const { BadRequestError } = require("../expressError");
const BestWords = require("../models/best-word-model");
const bestWordGetSchema = require("../schemas/bestWordGet.json");
const bestWordGetTenthSchema = require("../schemas/bestWordGetTenth.json");
const bestWordPostSchema = require("../schemas/bestWordPost.json");

const router = express.Router();

/*
  GET /[userId] => { words: [word1Obj, word2Obj] } ***each will have up to 10 of each type combo

  Returns list of all plays and optionally by filter(s).
  
  Can filter on provided search filters:
  - gameType
  - bestType
  - limit (number of words to retrieve, from best to worst, defaults to null resulting in retrieving all)
  - offset (number result to start at, defaults to 0)

  Authorization required: none
*/

router.get("/:userId", async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.query, bestWordGetSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const { limit, offset, ...filters } = req.query;
    const words = await BestWords.get(req.params.userId, filters, limit, offset);
    return res.json({ words });
  } catch (err) {
    return next(err);
  }
});


/* 
  GET /[userId]/tenth-best => { score }

  Returns tenth best word score of a particular game type and best type

  Must provide the following filters:
  - gameType
  - bestType

  Authorization required: none
*/

router.get("/:userId/tenth-best", async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.query, bestWordGetTenthSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const filters = req.query;
    const score = await BestWords.getTenthBest(req.params.userId, filters);
    return res.json({ score });
  } catch (err) {
    return next(err);
  }
});


/*
  POST /[userId] { word }  => { word }

  Allows a user to post a best word
  
  Provide the following play obj:
  {
    gameType,
    words: [{ bestType, word, score, boardState }, ...]
  }

  Authorization required: same-as-user
*/

router.post("/:userId", ensureCorrectUserOrAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, bestWordPostSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const word = await BestWords.post(req.params.userId, req.body);
    return res.status(201).json({ word });
  } catch (err) {
    return next(err);
  }
});

/*
  DELETE /[bestWordId]  =>  { deleted: <bestWordId> }

  Authorization required: admin
*/

router.delete("/:bestWordId", ensureAdmin, async function (req, res, next) {
  try {
    await BestWords.delete(req.params.bestWordId);
    return res.json({ deleted: req.params.bestWordId });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;