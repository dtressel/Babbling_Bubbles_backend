"use strict";

const db = require("../db.js");
const { BCRYPT_WORK_FACTOR } = require("../config");
const Play = require("../models/play-model");
const { createToken } = require("../helpers/tokens");

async function commonBeforeAll() {
  await db.query("DELETE FROM users");
  await db.query("DELETE FROM plays");

  // Add users bubbles and bubblemaster (admin)
  const bubbles = await db.query(`
      INSERT INTO users (username,
        password,
        email,
        country,
        bio,
        date_registered,
        permissions)
      VALUES ('bubbles',
              $1,
              'bubbles@gmail.com',
              'United States',
              'I love to sing and dance. My favorite food is pepperoni pizza.',
              '2023-07-09',
              'base'),
            ('bubblemaster',
              $2,
              'bubblemaster@gmail.com',
              'United States',
              'I like long walks on the beach.',
              '2023-07-11',
              'admin')
      RETURNING id`,
    [
      await bcrypt.hash("bubbles123", BCRYPT_WORK_FACTOR),
      await bcrypt.hash("bubblemaster123", BCRYPT_WORK_FACTOR),
    ]
  );

  async function addPlays() {
    for (let i = 0; i < 100; i++) {
      const playId = await Play.addAtStartGame({ userId: bubbles.rows[0].id });
      let score = Math.floor(Math.random() * 400) + 64;
      await Play.updateAtGameOver({ 
        playId: playId, 
        baseInfo: {
          score: score,
          numOfWords: Math.min(Math.floor(Math.random() * 50) + 1, Math.floor(score / 4.5)), 
          bestWord: "pleaser",
          bestWordScore: 60,
          bestWordBoardState: "snyjbnceyrnorV2EmxSOp"
        }, 
        extraStats: {
          craziestWord: "pizzazz",
          craziestWordScore: 52,
          craziestWordBoardState: "snyjbnceyrnorV2EmxSOp",
          longestWord: "entrances",
          longestWordScore: 9034,
          longestWordBoardState: "snyjbnceyrnorV2EmxSOp"
        }
      });
    }
  }
  
  addPlays();
}

async function commonBeforeEach() {
  await db.query("BEGIN");
}

async function commonAfterEach() {
  await db.query("ROLLBACK");
}

async function commonAfterAll() {
  await db.end();
}

const bubblesToken = createToken({ username: "bubbles", userId: 1, permissions: 'base' });
const bubblemasterToken = createToken({ username: "bubblemaster", userId: 2, permissions: 'admin' });

module.exports = {
  commonBeforeAll,
  commonBeforeEach,
  commonAfterEach,
  commonAfterAll,
  bubblesToken,
  bubblemasterToken
};