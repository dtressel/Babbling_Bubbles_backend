const jwt = require("jsonwebtoken");
const { SECRET_KEY } = require("../config");

/** return signed JWT from user data. */

function createToken(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    permissions: user.permissions,
  };

  return jwt.sign(payload, SECRET_KEY);
}

module.exports = { createToken };