"use strict";

const db = require("../db");
const bcrypt = require("bcrypt");
const { sqlForPartialUpdate } = require("../helpers/sql-for-update");
const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../expressError");

const { BCRYPT_WORK_FACTOR } = require("../config.js");

/** Related functions for users. */

class User {
  /** authenticate user with username, password.
   *
   * Returns { username, first_name, last_name, email, is_admin }
   *
   * Throws UnauthorizedError is user not found or wrong password.
   **/

  static async authenticate(username, password) {
    // try to find the user first
    const result = await db.query(
          `SELECT id, 
                  username,
                  password,
                  first_name AS "firstName",
                  last_name AS "lastName",
                  email,
                  country,
                  date_registered AS "dateRegistered",
                  permissions
           FROM users
           WHERE username = $1`,
        [username],
    );

    const user = result.rows[0];

    if (user) {
      // compare hashed password to a new hash from password
      const isValid = await bcrypt.compare(password, user.password);
      if (isValid === true) {
        delete user.password;
        return user;
      }
    }

    throw new UnauthorizedError("Invalid username/password");
  }


  /** Checks for correct password input for logged in user who is updating profile or password
   *
   * Throws UnauthorizedError if password incorrect
   *
   * If password is correct, no error, and returns undefined
   **/
  static async checkIfCorrectPassword(userId, password) {
    // query user hashed password using userId
    const storedHashedPassword = await db.query(
        `SELECT password
         FROM users
         WHERE user_id = $1`,
      [userId]
    ).rows[0].password;
    // check if password is correct, and if not, throw error
    if (!await bcrypt.compare(password, storedHashedPassword)) {
      throw new UnauthorizedError("Invalid password");
    }
  }


  /** Register user with data.
   *
   * Returns { username, firstName, lastName, email, country, permissions }
   *
   * Throws BadRequestError on duplicates.
   **/

  static async register({ username, password, firstName, lastName, email, country }) {
    const duplicateCheck = await db.query(
          `SELECT username
           FROM users
           WHERE username = $1`,
        [username],
    );

    if (duplicateCheck.rows[0]) {
      throw new BadRequestError(`Duplicate username: ${username}`);
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_WORK_FACTOR);

    const result = await db.query(
          `INSERT INTO users
           (username,
            password,
            first_name,
            last_name,
            email,
            country,
            permissions)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING username,
                     first_name AS "firstName",
                     last_name AS "lastName",
                     email,
                     country,
                     date_registered AS "dateRegistered",
                     permissions`,
        [
          username,
          hashedPassword,
          firstName,
          lastName,
          email,
          country,
          permissions
        ],
    );

    const user = result.rows[0];

    return user;
  }



  /** Find all users.
   *
   * Returns [{ id, username, first_name, last_name, email, permissions }, ...]
   **/

  static async findAll() {
    const result = await db.query(
          `SELECT id,
                  username,
                  first_name AS "firstName",
                  last_name AS "lastName",
                  email,
                  country,
                  date_registered AS "dateRegistered",
                  permissions
           FROM users
           ORDER BY username`,
    );

    return result.rows;
  }



  /** Given an id or username, return data about user.
   *
   * Returns { username, first_name, last_name, permissions, jobs }
   *   where jobs is { id, title, company_handle, company_name, state }
   *
   * Throws NotFoundError if user not found.
   **/

  static async get(identifierType, value) {
    const userRes = await db.query(
          `SELECT username,
                  first_name AS "firstName",
                  last_name AS "lastName",
                  email,
                  country,
                  date_registered AS "dateRegistered",
                  permissions
           FROM users
           WHERE $1 = $2`,
        [identifierType, value],
    );

    const user = userRes.rows[0];

    if (!user) throw new NotFoundError(`No user: ${value}`);

    return user;
  }



  /** Update user data with `data`.
   *
   * This is a "partial update" --- it's fine if data doesn't contain
   * all the fields; this only changes provided ones.
   *
   * Data can include:
   *   { firstName, lastName, password, email, permissions }
   *
   * Returns { username, firstName, lastName, email, permissions }
   *
   * Throws NotFoundError if not found.
   *
   * WARNING: this function can set a new password or make a user an admin.
   * Callers of this function must be certain they have validated inputs to this
   * or a serious security risks are opened.
   */

  static async update(userId, data) {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, BCRYPT_WORK_FACTOR);
    }

    const { setCols, values } = sqlForPartialUpdate(
        data,
        {
          firstName: "first_name",
          lastName: "last_name",
        });
    const idVarIdx = "$" + (values.length + 1);

    const querySql = `UPDATE users 
                      SET ${setCols} 
                      WHERE id = ${idVarIdx} 
                      RETURNING username,
                                email,
                                first_name AS "firstName",
                                last_name AS "lastName",
                                country,
                                permissions`;
    const result = await db.query(querySql, [...values, userId]);
    const user = result.rows[0];

    if (!user) throw new NotFoundError(`No user: ${userId}`);

    delete user.password;
    return user;
  }



  /** Delete given user from database; returns undefined. */

  static async remove(userId) {
    let result = await db.query(
          `DELETE
           FROM users
           WHERE id = $1
           RETURNING id`,
        [userId],
    );
    const user = result.rows[0];

    if (!user) throw new NotFoundError(`No user: ${userId}`);
  }


  static async getStats(userId) {
    const overallStats = await db.query(
        `SELECT num_of_plays_single AS "numOfPlaysSingle",
                curr_10_wma AS "curr10Wma",
                curr_100_wma AS "curr100Wma",
                peak_10_wma AS "peak10Wma",
                peak_100_wma AS "peak100Wma"
        FROM users
        WHERE user_id = $1`,
      [userId]
    );

    const top10SinglePlays = await db.query(
       `SELECT id AS "playId",
               play_time AS "playTime",
               score,
               num_of_words AS "numOfWords",
               best_word AS "bestWord",
               best_word_score AS "bestWordScore"
        FROM plays
        WHERE user_id = $1
        AND score > 0
        ORDER BY score DESC
        LIMIT 10`,
      [userId] 
    );

    const top10Words = await db.query(
       `SELECT id AS "playId",
               play_time AS "playTime",
               best_word AS "bestWord",
               best_word_score AS "bestWordScore"
               best_word_board_state AS "bestWordBoardState"
        FROM plays
        WHERE user_id = $1
        AND score > 0
        ORDER BY best_word_score DESC
        LIMIT 10`,
      [userId] 
    );

    const top10AvgWordScores = await db.query(
       `SELECT id AS "playId",
               play_time AS "playTime",
               avg_word_score AS "avgWordScore",
               score
               num_of_words AS "numOfWords"
        FROM plays
        WHERE user_id = $1
        AND num_of_words > 14
        ORDER BY avg_word_score DESC
        LIMIT 10`,
      [userId]   
    );

    if (!overallStats.rows[0]) {
      throw new NotFoundError(`No user: ${id}`);
    }

    const stats = { ...overallStats.rows[0],
                    top10SinglePlays: top10SinglePlays.rows,
                    top10Words: top10Words.rows,
                    top10AvgWordScores: top10AvgWordScores.rows };

    return stats;
  }
}


module.exports = User;
