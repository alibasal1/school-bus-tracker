// A tiny in-memory DynamoDB for the Jest tests, used in place of db/dynamo.js:
//   jest.mock('../db/dynamo', () => require('./helpers/fakeDynamo').createFake());
// It understands only the commands and expressions this service uses, so the
// real service code runs against it and no database is needed.
const KEYS = {
  TripStops: ['trip_id', 'stop_id'],
  ProcessedEvents: ['event_id']
};

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function conditionFailed() {
  return Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' });
}

function createFake() {
  const tables = new Map();
  const calls = [];
  let nextError = null;

  const keyNames = (table) => KEYS[table] || ['id'];
  const keyOf = (table, item) => keyNames(table).map((name) => item[name]).join('|');
  const table = (name) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  };

  // One operand: #name, :value, or a plain attribute name.
  function operand(token, item, input) {
    token = token.trim();
    if (token.startsWith(':')) return input.ExpressionAttributeValues[token];
    const name = token.startsWith('#') ? input.ExpressionAttributeNames[token] : token;
    return item ? item[name] : undefined;
  }

  // Clauses joined by AND: a = b, a <> b, attribute_exists(a),
  // attribute_not_exists(a), contains(a, b).
  function matches(expression, item, input) {
    if (!expression) return true;
    return expression.split(/\s+AND\s+/).every((clause) => {
      let m = /^attribute_not_exists\((.+)\)$/.exec(clause.trim());
      if (m) return operand(m[1], item, input) === undefined;
      m = /^attribute_exists\((.+)\)$/.exec(clause.trim());
      if (m) return operand(m[1], item, input) !== undefined;
      m = /^contains\((.+),(.+)\)$/.exec(clause.trim());
      if (m) return String(operand(m[1], item, input) ?? '').includes(operand(m[2], item, input));
      m = /^(.+?)\s*(<>|=)\s*(.+)$/.exec(clause.trim());
      if (!m) throw new Error(`fakeDynamo cannot read: ${clause}`);
      const same = operand(m[1], item, input) === operand(m[3], item, input);
      return m[2] === '=' ? same : !same;
    });
  }

  function handle(name, input) {
    const rows = table(input.TableName || '');
    switch (name) {
      case 'GetCommand':
        return { Item: clone(rows.get(keyOf(input.TableName, input.Key))) };
      case 'PutCommand': {
        const key = keyOf(input.TableName, input.Item);
        if (!matches(input.ConditionExpression, rows.get(key), input)) throw conditionFailed();
        rows.set(key, clone(input.Item));
        return {};
      }
      case 'DeleteCommand': {
        const key = keyOf(input.TableName, input.Key);
        const current = rows.get(key);
        if (input.ConditionExpression && (!current || !matches(input.ConditionExpression, current, input))) {
          throw conditionFailed();
        }
        rows.delete(key);
        return {};
      }
      case 'UpdateCommand': {
        const key = keyOf(input.TableName, input.Key);
        const current = rows.get(key);
        if (input.ConditionExpression && (!current || !matches(input.ConditionExpression, current, input))) {
          throw conditionFailed();
        }
        const updated = { ...(current || input.Key) };
        for (const part of input.UpdateExpression.replace(/^SET\s+/, '').split(',')) {
          const [left, right] = part.split('=').map((s) => s.trim());
          const field = left.startsWith('#') ? input.ExpressionAttributeNames[left] : left;
          updated[field] = operand(right, updated, input);
        }
        rows.set(key, updated);
        return { Attributes: clone(updated) };
      }
      case 'QueryCommand': {
        const m = /^(.+?)\s*=\s*(.+)$/.exec(input.KeyConditionExpression);
        const items = [...rows.values()].filter((item) => (
          operand(m[1], item, input) === operand(m[2], item, input)
          && matches(input.FilterExpression, item, input)
        ));
        return { Items: clone(items) };
      }
      case 'ScanCommand':
        return { Items: clone([...rows.values()].filter((item) => matches(input.FilterExpression, item, input))) };
      case 'BatchWriteCommand': {
        for (const [tableName, requests] of Object.entries(input.RequestItems)) {
          if (requests.length > 25) throw new Error('BatchWriteItem takes at most 25 items');
          for (const request of requests) {
            table(tableName).set(keyOf(tableName, request.PutRequest.Item), clone(request.PutRequest.Item));
          }
        }
        return { UnprocessedItems: {} };
      }
      default:
        throw new Error(`fakeDynamo does not support ${name}`);
    }
  }

  return {
    async send(command) {
      const name = command.constructor.name;
      calls.push({ name, input: command.input });
      if (nextError) {
        const error = nextError;
        nextError = null;
        throw error;
      }
      return handle(name, command.input);
    },
    // Helpers for the tests.
    calls,
    put(tableName, item) { table(tableName).set(keyOf(tableName, item), clone(item)); },
    all(tableName) { return clone([...table(tableName).values()]); },
    failNext(error) { nextError = error; },
    reset() { tables.clear(); calls.length = 0; nextError = null; }
  };
}

module.exports = { createFake };
