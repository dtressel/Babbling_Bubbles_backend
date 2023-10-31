"use strict";

/** Express backend for Babbling Bubbles. */

const express = require("express");
const cors = require("cors");

const { NotFoundError } = require("./expressError");

const { authenticateJWT } = require("./middleware/auth-ware");
const authRoutes = require("./routes/auth");
const bestScoresRoutes = require("./routes/best-scores");
const bestWordsRoutes = require("./routes/best-words");
const leaderboardsRoutes = require("./routes/leaderboards");
const soloPlaysRoutes = require("./routes/solo-plays");
const soloScoresRoutes = require("./routes/solo-scores");
const soloStatsRoutes = require("./routes/solo-stats");
const usersRoutes = require("./routes/users");

const morgan = require("morgan");

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));
app.use(authenticateJWT);

app.use("/auth", authRoutes);
app.use("/best-scores", bestScoresRoutes);
app.use("/best-words", bestWordsRoutes);
app.use("/leaderboards", leaderboardsRoutes);
app.use("/solo-plays", soloPlaysRoutes);
app.use("/solo-scores", soloScoresRoutes);
app.use("/solo-stats", soloStatsRoutes);
app.use("/users", usersRoutes);



/** Handle 404 errors -- this matches everything */
// app.use(function (req, res, next) {
//   return next(new NotFoundError());
// });

/** Generic error handler; anything unhandled goes here. */
app.use(function (err, req, res, next) {
  if (process.env.NODE_ENV !== "test") console.error(err.stack);
  const status = err.status || 500;
  const message = err.message;

  return res.status(status).json({
    error: { message, status },
  });
});

module.exports = app;
