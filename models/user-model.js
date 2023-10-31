"use strict";

const db = require("../db");
const bcrypt = require("bcrypt");
const { buildUpdateSetClause } = require("../helpers/sql-for-update");
const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../expressError");

const { BCRYPT_WORK_FACTOR } = require("../config.js");

/** Related functions for users. */

class User {
  static bestScoreTypes = ["ttl", "avg"];
  static bestWordTypes = ["bst", "crz", "lng"];
  static gameTypes = ['solo3', 'solo10', 'free'];

  /** authenticate user with username, password.
   *
   * Returns { username, email, is_admin }
   *
   * Throws UnauthorizedError is user not found or wrong password.
   **/

  static async authenticate(username, password) {
    // try to find the user first
    const result = await db.query(
          `SELECT id AS "userId", 
                  username,
                  password,
                  email,
                  country,
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
        // update last_active
        await db.query(
          `
            UPDATE users
            SET last_active = CURRENT_DATE
            WHERE id = $1
          `,
          [user.userId]
        )
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
  static async checkIfCorrectPassword(userId, password, fieldName) {
    // query user hashed password using userId
    const res = await db.query(
        `SELECT password
         FROM users
         WHERE id = $1`,
      [userId]
    );
    const storedHashedPassword = res.rows[0].password;
    // check if password is correct, and if not, throw error
    const isValid = await bcrypt.compare(password, storedHashedPassword)
    if (!isValid) {
      throw new UnauthorizedError(`Invalid ${fieldName}`);
    }
  }



  /** Checks for correct username for user that admin is trying to delete
   *
   * Throws BadRequestError if username is incorrect
   *
   * If provided username is correct, no error, and returns undefined
   **/
    static async checkIfUsernameMatchesUserId(userId, providedUsername) {
      // query user username using userId
      const res = await db.query(
          `SELECT username
           FROM users
           WHERE id = $1`,
        [userId]
      );
      const storedUsername = res.rows[0].username;
      // check if usernames match
      if (storedUsername !== providedUsername) {
        throw new BadRequestError("Invalid username");
      }
    }


  /** Register user with data.
   *
   * Returns { userId, username, country, permissions }
   *
   * Throws BadRequestError on duplicates.
   **/

  static async register({ username, password, email, country }) {
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
            email,
            country)
           VALUES ($1, $2, $3, $4)
           RETURNING id AS "userId",
                     username,
                     email,
                     country,
                     permissions`,
        [
          username,
          hashedPassword,
          email,
          country
        ],
    );

    const user = result.rows[0];

    return user;
  }


  /** Allows an admin to add a user and set permissions at the same time.
   *
   * Returns { username, email, country, permissions }
   *
   * Throws BadRequestError on duplicates.
   **/

  static async add({ username, password, email, country, permissions }) {
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
            email,
            country,
            permissions)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id AS "userId",
                     username,
                     email,
                     country,
                     date_registered AS "dateRegistered",
                     permissions`,
        [
          username,
          hashedPassword,
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
   * Returns [{ id, username, email, permissions }, ...]
   **/

  static async findAll() {
    const result = await db.query(
          `SELECT id,
                  username,
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
   * Returns { user }
   *
   * Throws NotFoundError if user not found.
   **/

  static async get(identifierType, value) {
    const userRes = await db.query(
          `SELECT id AS "userId",
                  username,
                  email,
                  country,
                  bio,
                  words_found AS "wordsFound",
                  TO_CHAR(date_registered, 'Month DD, YYYY') AS "dateRegistered",
                  permissions
           FROM users
           WHERE ${identifierType} = $1`,
        [value],
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
   *   { password, email, bio, permissions }
   *
   * Returns { username, email, bio, permissions }
   *
   * Throws NotFoundError if not found.
   *
   * WARNING: this function can set a new password or make a user an admin.
   * Callers of this function must be certain they have validated inputs to this
   * or a serious security risks are opened.
   */

  static async update(userId, data) {
    if (data.newPassword) {
      data.newPassword = await bcrypt.hash(data.newPassword, BCRYPT_WORK_FACTOR);
    }

    const { sqlStatement, valuesArray } = buildUpdateSetClause(data, {}, { newPassword: "password" });
    const idVarIdx = "$" + (valuesArray.length + 1);

    const querySql = `UPDATE users 
                      ${sqlStatement} 
                      WHERE id = ${idVarIdx} 
                      RETURNING id AS "userId",
                                username,
                                email,
                                bio,
                                country,
                                permissions`;
    const result = await db.query(querySql, [...valuesArray, userId]);
    const user = result.rows[0];

    if (!user) throw new NotFoundError(`No user: ${userId}`);

    return user;
  }


  /** Update a user's words found number after game play, and updates last_active
   *
   * Method must be provided: userId, words found increment amount
   *
   * Returns { userId }
   */

  static async updateWordsFound(userId, increment) {  
    const result = await db.query(
      `
        UPDATE users
        SET words_found = words_found + $1,
            last_active = CURRENT_DATE
        WHERE id = $2
        RETURNING id AS "userId"
      `,
      [increment, userId]
    );

    const user = result.rows[0];

    if (!user) throw new NotFoundError(`No user: ${userId}`);

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


  /* 
    Given a userId, return all stats for a user

    Used to display stats on user profile page
  */

    static async getProfileData(userId, filters) {
      let gameTypes;
      if (filters.gameType) {
        gameTypes = [filters.gameType];
      } else{
        gameTypes = this.gameTypes;
      }
      const dataObjStructure = [];
      const promises = [];
      if (filters.includeGeneralInfo) {
        dataObjStructure.push({ path: ['info'], multipleResults: false });
        promises.push(db.query(
          `
            SELECT id AS "userId",
                   username,
                   country,
                   bio,
                   words_found AS "wordsFound",
                   TO_CHAR(last_active, 'Mon DD, YYYY') AS "lastActive",
                   TO_CHAR(date_registered, 'Mon DD, YYYY') AS "dateRegistered"
            FROM users
            WHERE id = $1
          `,
          [userId]
        ));
      };

      if (filters.gameType !== "free") {
        const soloStatsGameTypes = gameTypes.filter(value => value !== 'free');
        for (const gameType of soloStatsGameTypes) {
          dataObjStructure.push({ path: ['stats', gameType], multipleResults: false });
          promises.push(db.query(
            `
              SELECT num_of_plays AS "numOfPlays",
                     TO_CHAR(last_play, 'Mon DD, YYYY') AS "lastPlay",
                     curr_20_wma AS "curr20Wma",
                     peak_20_wma AS "peak20Wma",
                     TO_CHAR(peak_20_wma_date, 'Mon DD, YYYY') AS "peak20WmaDate",
                     curr_100_wma AS "curr100Wma",
                     peak_100_wma AS "peak100Wma",
                     TO_CHAR(peak_100_wma_date, 'Mon DD, YYYY') AS "peak100WmaDate"
              FROM solo_stats
              WHERE user_id = $1
                AND game_type = $2
            `,
            [userId, gameType]
          ));
        };
      };
      
      for (const scoreType of this.bestScoreTypes) {
        for (const gameType of gameTypes) {
          dataObjStructure.push({ path: ['leaderboards', `${scoreType}Score`, gameType], multipleResults: true });
          promises.push(db.query(
            `
              SELECT score,
                     TO_CHAR(acheived_on, 'Mon DD, YYYY') AS "date"
              FROM best_scores
              WHERE user_id = $1
                AND game_type = $2
                AND score_type = $3
                AND score > 0
              ORDER BY score DESC
              LIMIT 10
            `,
           [userId, gameType, scoreType] 
          ));
        }
      }

      for (const bestType of this.bestWordTypes) {
        for (const gameType of gameTypes) {
          dataObjStructure.push({ path: ['leaderboards', `${bestType}Word`, gameType], multipleResults: true });
          promises.push(await db.query(
            `
              SELECT word,
                     score,
                     board_state AS "boardState",
                     TO_CHAR(found_on, 'Mon DD, YYYY') AS "date"
              FROM best_words
              WHERE user_id = $1
                AND game_type = $2
                AND best_type = $3
              ORDER BY score DESC
              LIMIT 10
            `,
            [userId, gameType, bestType] 
          ));
        }
      }

      // turn this into helper file
      // using results array and objStructure array, builds an object
      /* 
        Given a promise array and objStructure array, it builds an object of results
      */
      const results = await Promise.all(promises);
      const returnObj = {};
      // loop through results along with objStructure array
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const objStructure = dataObjStructure[i];
        let returnObjRef = returnObj;
        // loop through the objStructure path to build the reference to store the results
        for (let i = 0; i < objStructure.path.length - 1; i++) {
          const key = objStructure.path[i]
          if (returnObjRef[key] === undefined) {
            returnObjRef[key] = {};
          }
          returnObjRef = returnObjRef[key];
        }
        // store the results as an array if multiple results are directly if a single result
        if (objStructure.multipleResults) {
          returnObjRef[objStructure.path.at(-1)] = result.rows;
        }
        else {
          returnObjRef[objStructure.path.at(-1)] = result.rows[0];
        }
      }
  
      return returnObj;
    }


  static async getProfileDataByUsername(username, filters) {
    const userIdRes = await db.query(
      `
        SELECT id
        FROM users
        WHERE username = $1
      `,
      [username]
    );

    return await this.getProfileData(userIdRes.rows[0].id, filters);
  }
}



module.exports = User;
