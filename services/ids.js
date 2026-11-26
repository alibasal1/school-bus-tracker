// Ids in the team's DynamoDB tables are strings: UUIDs for users, favorites and
// alerts, readable ids such as "route-cairo-demo" for Ahmed's routes and stops,
// and "<event id>:<user id>" for the alerts Ahmed's worker creates.
// Only letters, digits, "-", "_" and ":" are allowed. That still refuses NoSQL
// tricks like {"$ne": null} (not a string) and "' OR 1=1" (spaces and quotes).
const ID_PATTERN = /^[A-Za-z0-9_:-]{1,200}$/;

function validId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

module.exports = { ID_PATTERN, validId };
