const { BadRequestError } = require("../expressError");

/*
  Combine where clauses used for filtering
  
  Parameter: An array of where clauses without 'WHERE' or 'AND' keywords
  
  Returns: A string of combined where clauses with "WHERE" and 'AND' keywords 
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

/*
  Creates an insert query from provided data

  Parameters: 1. name of table to insert into,
              2. data obj { <columnName>: <value>, ... },
              3. columns key that translates given key in data obj to 
                expected SQL column name (optional)

  Returns: { sqlStatement, valuesArray }
*/ 

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


/*
  Builds an update set clause from provided data

  Parameters: 1. data obj { <columnName>: <value>, ... },
              2. relative changes obj 
                 { <columnName>: 'CURRENT_DATE', <columnName>: 'num_of_plays + 1', ... }
              3. columns key that translates given key in data obj to 
                 expected SQL column name (optional),
              4. current values array if there are already set values

  Returns: { sqlStatement, valuesArray }
*/

function buildUpdateSetClause(data, relativeChanges = {}, columnKey = {}, valuesArray = []) {
  if (!Object.keys(data).length && !Object.keys(relativeChanges).length) {
    throw new BadRequestError("No data");
  }
  const setClauseArray = [];
  for (const key in data) {
    setClauseArray.push(`${columnKey[key] === undefined ? key : columnKey[key]} = $${valuesArray.length + 1}`);
    valuesArray.push(data[key]);
  }
  for (const key in relativeChanges) {
    setClauseArray.push(`${columnKey[key] === undefined ? key : columnKey[key]} = ${relativeChanges[key]}`);
  }
  const setClause = 'SET ' + setClauseArray.join(', ');
  return { sqlStatement, valuesArray };
}

module.exports = { buildUpdateSetClause, combineWhereClauses, createInsertQuery, createUpdateQuery, buildWhereClauses, buildLimitOffsetClause };
