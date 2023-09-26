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
  let sqlStatement = '';
  // build limit statement if limit exists
  if (limit) {
    sqlStatement = `LIMIT $${valuesArray.length + 1}`;
    valuesArray.push(limit);
  }
  // build offset statement if offset exists
  if (offset) {
    if (sqlStatement) sqlStatement += ' ';
    sqlStatement = `OFFSET $${valuesArray.length + 1}`;
    valuesArray.push(offset);
  }
  return { sqlStatement, valuesArray }
}

/*
  Creates an insert query from provided data

  Parameters: 1. name of table to insert into,
              2. data obj { <columnName>: <value>, ... },
              3. columns key that translates given key in data obj to 
                expected SQL column name (optional)

  Returns: { sqlStatement, valuesArray }
*/ 

function createInsertQuery(tableName, data, relativeChanges = {}, columnKey = {}, valuesArray = []) {
  if (!Object.keys(data).length && !Object.keys(relativeChanges).length) {
    throw new BadRequestError("No data");
  }
  const columnsArray = [];
  const valuesArraySql = [];
  for (const key in data) {
    columnsArray.push(columnKey[key] === undefined ? key : columnKey[key]);
    valuesArraySql.push(`$${valuesArray.length + 1}`);
    valuesArray.push(data[key]);  
  }
  for (const key in relativeChanges) {
    columnsArray.push(columnKey[key] === undefined ? key : columnKey[key]);
    valuesArraySql.push(relativeChanges[key]);
  }
  const columnsSql = columnsArray.join(', ');
  const valuesSql = valuesArraySql.join(', ');
  const sqlStatement = `INSERT INTO ${tableName} (${columnsSql}) VALUES (${valuesSql})`;

  return { sqlStatement, valuesArray };
}


/*
  Creates an insert query to insert multiple rows from provided data

  Parameters: 1. name of table to insert into
              2. data arrays for provided data [[<data1>, <data2>, ...], [...], ...]
              3. data column names array [<column1>, <column2>, ...] (column names in sql format)
              4. relative changes data applied to all rows { acheived_on: 'CURRENT_DATE', ... }
              5. current values array (optional)

  Returns: { sqlStatement, valuesArray }
*/ 

function createMultipleInsertQuery(tableName, dataArrays, dataColumns, relativeChanges = {}, valuesArray = []) {
  if (!dataArrays.length) {
    throw new BadRequestError("No data");
  }
  const relativeChangesColumns = Object.keys(relativeChanges);
  const columnsArray = [...dataColumns, ...relativeChangesColumns];
  // Create arrays of arrays to hold the values of all of the rows to insert
  const valuesArraysForSql = [];
  for (const wordDataArr of dataArrays) {
    // value array to hold values or sql variables for a single row
    const values = [];
    for (const value of wordDataArr) {
      // push sql variable for each value
      values.push(`$${valuesArray.length + 1}`);
      // push values into valuesArray
      valuesArray.push(value);
    }
    for (const column of relativeChangesColumns) {
      // push relative changes values into values
      values.push(relativeChanges[column]);
    }
    valuesArraysForSql.push(values);
  }
  const columnsSql = columnsArray.join(', ');
  const valuesSql = valuesArraysForSql.join('), (');
  const sqlStatement = `INSERT INTO ${tableName} (${columnsSql}) VALUES (${valuesSql})`;

  return { sqlStatement, valuesArray };
}


/*
  Builds an update set clause from provided data

  Parameters: 1. data obj { <columnName>: <value>, <columnName>: <array>, ... }
                 * An array (length = 2) as a value is used for a conditionally updated value
                   Array index 0: The conditional statement, ex: 'GREATEST(peak_20_wma, <$_>)'
                     ('<$_>' is a placeholder that will be replaced by a $<variable number>)
                   Array index 1: The value to be used in place of '<$_>' in conditional statement
              2. relative changes obj 
                 { <columnName>: 'CURRENT_DATE', <columnName>: 'num_of_plays + 1', ... }
              3. columns key that translates given key in data obj to 
                 expected SQL column name (optional)
              4. current values array if there are already set values

  Returns: { sqlStatement, valuesArray }
*/

function buildUpdateSetClause(data, relativeChanges = {}, columnKey = {}, valuesArray = []) {
  if (!Object.keys(data).length && !Object.keys(relativeChanges).length) {
    throw new BadRequestError("No data");
  }
  const setClauseArray = [];
  for (const key in data) {
    // if a conditionally updated value (which would be an array of length = 2)
    // **************************************** Delete this if, if unused (currently unused) **********************************************************
    if (Array.isArray(data[key])) {
      const value = data[key][0].replace('<$_>', `$${valuesArray.length + 1}`);
      setClauseArray.push(`${columnKey[key] === undefined ? key : columnKey[key]} = ${value}`);
      valuesArray.push(data[key][1]);
    }
    else {
      setClauseArray.push(`${columnKey[key] === undefined ? key : columnKey[key]} = $${valuesArray.length + 1}`);
      valuesArray.push(data[key]);
    }
  }
  for (const key in relativeChanges) {
    setClauseArray.push(`${columnKey[key] === undefined ? key : columnKey[key]} = ${relativeChanges[key]}`);
  }
  const sqlStatement = 'SET ' + setClauseArray.join(', ');

  return { sqlStatement, valuesArray };
}

module.exports = { combineWhereClauses, buildWhereClauses, buildLimitOffsetClause, createInsertQuery, createMultipleInsertQuery, buildUpdateSetClause };
