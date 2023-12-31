"use strict";

/** Routes for best-scores. */

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureAdmin, ensureCorrectUserOrAdmin } = require("../middleware/auth-ware");
const { BadRequestError } = require("../expressError");
const BestScores = require("../models/best-score-model");
const bestScoreGetSchema = require("../schemas/bestScoreGet.json");
const bestScoreGetTenSchema = require("../schemas/bestScoreGetTen.json");
const bestScorePostSchema = require("../schemas/bestScorePost.json");

const router = express.Router();

/* 
  GET /[userId] => { scores: [score1Obj, score2Obj] } ***each will have up to 10 of each type combo

  Returns list of all plays and optionally by filter(s).

  Can filter on provided search filters:
  - gameType
  - scoreType
  - limit (number of scores to retrieve, from best to worst, defaults to null resulting in retrieving all)
  - offset (number result to start at, defaults to 0)

  Authorization required: none
*/

router.get("/:userId", async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.query, bestScoreGetSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const { limit, offset, ...filters } = req.query;
    const scores = await BestScores.get(req.params.userId, filters, limit, offset);
    return res.json({ scores });
  } catch (err) {
    return next(err);
  }
});


/* 
  GET /[userId]/ten-best => { score }

  Returns the ten best scores of a particular game type and score type

  Must provide the following filters:
  - gameType
  - scoreType

  Authorization required: none
*/

router.get("/:userId/ten-best", async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.query, bestScoreGetTenSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const filters = req.query;
    const score = await BestScores.getTenBest(req.params.userId, filters);
    return res.json({ score });
  } catch (err) {
    return next(err);
  }
});


/*
  POST /[userId] { score }  => { score }

  Allows a user to post a best score
  
  Provide the following play obj:
  {
    gameType,
    scores: [{ scoreType, score }, ...]
  }

  Authorization required: same-as-user
*/

router.post("/:userId", ensureCorrectUserOrAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, bestScorePostSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const score = await BestScores.post(req.params.userId, req.body);
    return res.status(201).json({ score });
  } catch (err) {
    return next(err);
  }
});

/*
  DELETE /[bestScoreId]  =>  { deleted: <bestScoreId> }

  Authorization required: admin
*/

router.delete("/:bestScoreId", ensureAdmin, async function (req, res, next) {
  try {
    await BestScores.delete(req.params.bestScoreId);
    return res.json({ deleted: req.params.bestScoreId });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;