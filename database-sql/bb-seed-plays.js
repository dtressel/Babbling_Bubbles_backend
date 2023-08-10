const Play = require("../models/play-model");

async function addPlays() {
  for (let i = 0; i < 100; i++) {
    const playId = await Play.addAtStartGame({ userId: 1 });
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

