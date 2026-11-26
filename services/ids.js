// Ids in the team's DynamoDB tables are strings: UUIDs for users, favorites and
// alerts, and readable ids such as "route-cairo-demo" for Ahmed's routes and stops.
// Only letters, digits, "-" and "_" are allowed. That also refuses NoSQL tricks
// like {"$ne": null} (not a string) and "' OR 1=1" (spaces and quotes).
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function validId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

module.exports = { ID_PATTERN, validId };
