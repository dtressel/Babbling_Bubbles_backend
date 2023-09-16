const { BadRequestError } = require("../expressError");

/**
 * Helper for making selective update queries.
 *
 * The calling function can use it to make the SET clause of an SQL UPDATE
 * statement.
 *
 * @param dataToUpdate {Object} {field1: newVal, field2: newVal, ...}
 * @param jsToSql {Object} maps js-style data fields to database column names,
 *   like { firstName: "first_name", age: "age" }
 *
 * @returns {Object} {sqlSetCols, dataToUpdate}
 *
 * @example {firstName: 'Aliya', age: 32} =>
 *   { setCols: '"first_name"=$1, "age"=$2',
 *     values: ['Aliya', 32] }
 */

function sqlForPartialUpdate(dataToUpdate, jsToSql) {
  const keys = Object.keys(dataToUpdate);
  if (keys.length === 0) throw new BadRequestError("No data");

  // {firstName: 'Aliya', age: 32} => ['"first_name"=$1', '"age"=$2']
  const cols = keys.map((colName, idx) =>
      `"${jsToSql[colName] || colName}"=$${idx + 1}`,
  );

  return {
    setCols: cols.join(", "),
    values: Object.values(dataToUpdate),
  };
}

/** Combine where clauses used for filtering
 * 
 * Parameter: An array of where clauses without 'WHERE' or 'AND' keywords
 * 
 * Returns: A string of combined where clauses with "WHERE" and 'AND' keywords
 * 
 */

function combineWhereClauses(clauseArray) {
  if (!clauseArray[0]) return '';
  let whereString = `WHERE ${clauseArray[0]}`;
  for (let i = 1; i < clauseArray.length; i++) {
    whereString += ` AND ${clauseArray[i]}`;
  }
  return whereString;
}

/* 
  Builds where clauses from a filters object

  jsToSql key translates the JS formatted filter names into the SQL formatted filter names

  values from the filters will fill the valuesArray, which may already contain values

  values array also helps the function know where to start for $<num>

  set firstClause as false if you already have a manually written WHERE clause and want to add
  on to it with further AND additions

  Returns: { whereClause, valuesArray }

  If filters object is empty, it will return an empty string and original valuesArray
*/

function buildWhereClauses(filters, jsToSqlKey = {}, valuesArray = [], firstClause = true) {
  let whereString = '';
  // build whereString and valuesArray for each filter
  for (const filter in filters) {
    if (firstClause) {
      whereString = `WHERE ${jsToSqlKey[filter]} = $${valuesArray.length + 1}`
      firstClause = false;
    } else {
      if (whereString) whereString += ' ';
      whereString += `AND ${jsToSqlKey[filter]} = $${valuesArray.length + 1}`
    }
    valuesArray.push(filters[filter]);
  }
  return { whereClause: whereString, valuesArray }
}


/* 
  Builds a limit and/or offset clause (if both present, it will create a combined clause)

  values from the limit and/or offset will fill the valuesArray, which may already contain values

  values array also helps the function know where to start for $<num>

  Returns: { limitOffsetClause, valuesArray }

  If no limit or offset, it will return empty an string and original valuesArray
*/

function buildLimitOffsetClause(limit, offset, valuesArray = []) {
  let limitOffsetClause = '';
  // build limit statement if limit exists
  if (limit) {
    limitOffsetClause = `LIMIT $${valuesArray.length + 1}`;
    valuesArray.push(limit);
  }
  // build offset statement if offset exists
  if (offset) {
    if (limitOffsetClause) limitOffsetClause += ' ';
    limitOffsetClause = `OFFSET $${valuesArray.length + 1}`;
    valuesArray.push(offset);
  }
  return { limitOffsetClause, valuesArray }
}

/** Creates an insert query from provided data
 * 
 * Parameters: 1. name of table to insert into,
 *             2. data obj { <columnName>: <value>, ... },
 *             3. columns key that translates given key in data obj to 
 *                expected SQL column name (optional)
 * 
 * Returns: { sqlStatement, valuesArray }
 * 
 *  */ 

function createInsertQuery(tableName, data, columnsJsToSqlKey = {}) {
  const keysArray = [...Object.keys(data)];
  const numOfDataItems = keysArray.length;
  if (!numOfDataItems) return;
  const columnList = keysArray.slice(1).reduce((accum, curr) => {
    return accum + `, ${columnsJsToSqlKey[curr] || curr}`;
  }, columnsJsToSqlKey[keysArray[0]] || keysArray[0]);
  let valuesList = '$1';
  for (let i = 2; i <= numOfDataItems; i++) {
    valuesList += `, $${i}`;
  }
  const sqlStatement = `INSERT INTO ${tableName} (${columnList}) VALUES (${valuesList})`;
  const valuesArray = keysArray.map(key => data[key]);
  return { sqlStatement, valuesArray };
}

/** Creates an update query from provided data
 * 
 * Parameters: 1. name of table to insert into,
 *             2. data obj { <columnName>: <value>, ... },
 *             3. whereClause Array [[column, operand (= or <, etc.), value], [...], ...],
 *             4. WhereConjunction - AND or OR (this function cannot combine ANDs and ORs)
 *                (optional, defaults to AND),
 *             5. columns key that translates given key in data obj to 
 *                expected SQL column name (optional)
 * 
 * Returns: { sqlStatement, valuesArray }
 * 
 *  */ 

function createUpdateQuery(tableName, data, whereClauseArray, columnsJsToSqlKey = {}, WhereConjunction = 'AND') {
  const keysArray = [...Object.keys(data)];
  const numOfDataItems = keysArray.length;
  if (!numOfDataItems) return;
  // subtractor for special values that don't require $<num> notation
  let s = 0;
  const keysArrayIdxsToDelete = [];
  const setStatement = keysArray.reduce((accum, curr, idx) => {
    if (data[curr] === "CURRENT_DATE" || data[curr] === "num_of_plays_single + 1") {
      s++;
      keysArrayIdxsToDelete.push(idx);
      return accum + `, ${columnsJsToSqlKey[curr] || curr} = ${data[curr]}`;
    }
    return accum + `, ${columnsJsToSqlKey[curr] || curr} = $${idx + 1 - s}`;
  }, '').slice(2);
  // loop through idex array backwards to avoid deleting the wrong index
  for (let i = keysArrayIdxsToDelete.length - 1; i >= 0; i--) {
    keysArray.splice(keysArrayIdxsToDelete[i], 1);
  }
  const whereStatement = whereClauseArray.slice(1).reduce((accum, curr, idx) => {
    return accum + `${WhereConjunction} ${curr[0]} ${curr[1]} $${idx + numOfDataItems + 2 - s}`;
  }, `${whereClauseArray[0][0]} ${whereClauseArray[0][1]} $${numOfDataItems + 1 - s}`);
  const sqlStatement = `Update ${tableName} SET ${setStatement} WHERE ${whereStatement}`;
  const valuesArray = [...keysArray.map(key => data[key]), ...whereClauseArray.map(arr => arr[2])];
  return { sqlStatement, valuesArray };
}

module.exports = { sqlForPartialUpdate, combineWhereClauses, createInsertQuery, createUpdateQuery, buildWhereClauses, buildLimitOffsetClause };
