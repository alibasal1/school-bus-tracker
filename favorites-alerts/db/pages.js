// DynamoDB returns at most 1 MB per Query or Scan, then a LastEvaluatedKey.
// These two helpers keep asking until every page is read.
const { QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('./dynamo');

async function readAll(Command, input) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await db.send(new Command({ ...input, ExclusiveStartKey }));
    items.push(...(page.Items || []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

const queryAll = (input) => readAll(QueryCommand, input);
const scanAll = (input) => readAll(ScanCommand, input);

module.exports = { queryAll, scanAll };
