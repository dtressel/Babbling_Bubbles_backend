"use strict";

/** Routes for leaderboards. */

const jsonschema = require("jsonschema");

const express = require("express");
const Leaderboard = require("../models/leaderboard-model");
const leaderboardGetSchema = require("../schemas/leaderboardGet.json");
const { BadRequestError } = require("../expressError");

const router = express.Router();


/** GET / => 
 * 
 *  can filter with the following query parameter:
 *  
 *    - gameTypes = a string or an array with one or all of the following values: 
 *        solo3, solo10, free
 *    - statNames = a string or an array with one or all of the following values: 
 *        curr20Wma, peak20Wma, curr100Wma, peak100Wma, bestTtlScore, bestAvgScore, bstWord, crzWord, lngWord
 *    - userIds = an integer or an array with one or many userIds
 *    - usernames = a string or an array with one or many usernames
 * 
    {
      "leaderboards": {
        "curr20Wma": {
          "solo3": [],
          "solo10": [],
          "free": []
        },
        "peak20Wma": {
          "solo3": [],
          "solo10": [],
          "free": []
        },
        "curr100Wma": {
          "solo3": [],
          "solo10": [],
          "free": []
        },
        "peak100Wma": {
          "solo3": [],
          "solo10": [],
          "free": []
        },
        "bestTtlScore": {
          "solo3": [
            {
              "username": "bubbles",
              "score": 256,
              "date": "Oct 02, 2023"
            }
          ],
          "solo10": [
            {
              "username": "bubbles",
              "score": 456,
              "date": "Oct 02, 2023"
            }
          ],
          "free": [
            {
              "username": "bubbles",
              "score": 256,
              "date": "Oct 02, 2023"
            }
          ]
        },
        "bestAvgScore": {
          "solo3": [
            {
              "username": "bubbles",
              "score": 11.13,
              "date": "Oct 02, 2023"
            }
          ],
          "solo10": [
            {
              "username": "bubbles",
              "score": 12.67,
              "date": "Oct 02, 2023"
            }
          ],
          "free": [
            {
              "username": "bubbles",
              "score": 132.31,
              "date": "Oct 02, 2023"
            },
            {
              "username": "bubbles",
              "score": 11.13,
              "date": "Oct 02, 2023"
            }
          ]
        },
        "bstWord": {
          "solo3": [
            {
              "username": "bubbles",
              "word": "garden",
              "score": 80,
              "boardState": "ABcDefghijklmnopqrst122",
              "date": "Oct 02, 2023"
            }
          ],
          "solo10": [
            {
              "username": "bubbles",
              "word": "garden",
              "score": 80,
              "boardState": "ABcDefghijklmnopqrst122",
              "date": "Oct 02, 2023"
            }
          ],
          "free": [
            {
              "username": "bubbles",
              "word": "garden",
              "score": 680,
              "boardState": "ABcDefghijklmnopqrst122",
              "date": "Oct 02, 2023"
            },
            {
              "username": "bubbles",
              "word": "garden",
              "score": 680,
              "boardState": "ABcDefghijklmnopqrst122",
              "date": "Oct 02, 2023"
            },
            {
              "username": "bubbles",
              "word": "garden",
              "score": 80,
              "boardState": "ABcDefghijklmnopqrst122",
              "date": "Oct 02, 2023"
            }
          ]
        },
        "crzWord": {
          "solo3": [],
          "solo10": [],
          "free": []
        },
        "lngWord": {
          "solo3": [
            {
              "username": "bubbles",
              "word": "carpenter",
              "score": 9034,
              "boardState": "ABcDefghijklmnopqrst122",
              "date": "Oct 02, 2023"
            }
          ],
          "solo10": [
            {
              "username": "bubbles",
              "word": "carpenter",
              "score": 9034,
              "boardState": "ABcDefghijklmnopqrst122",
              "date": "Oct 02, 2023"
            }
          ],
          "free": [
            {
              "username": "bubbles",
              "word": "carpenter",
              "score": 9034,
              "boardState": "ABcDefghijklmnopqrst122",
              "date": "Oct 02, 2023"
            },
            {
              "username": "bubbles",
              "word": "carpenter",
              "score": 9034,
              "boardState": "ABcDefghijklmnopqrst122",
              "date": "Oct 02, 2023"
            },
            {
              "username": "bubbles",
              "word": "carpenter",
              "score": 9034,
              "boardState": "ABcDefghijklmnopqrst122",
              "date": "Oct 02, 2023"
            }
          ]
        }
      }
    }
 *
 * Returns all leaderboards up to 10 entries per leaderboard.
 *
 * Authorization required: none
 **/

router.get("/", async function (req, res, next) {
  try {
    const filters = req.query;
    // if a single value was submitted rather than multiple, coerce into an array
    for (const filter in filters) {
      if (!Array.isArray(filters[filter])) {
        filters[filter] = [filters[filter]];
      }
    }
    // coerce strings into integers for userIds
    if (filters.userIds) {
      filters.userIds = filters.userIds.map(id => +id);
    }
    // validate coerced query paramaters
    const validator = jsonschema.validate(filters, leaderboardGetSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    const leaderboards = await Leaderboard.get(filters);
    return res.json({ leaderboards });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;