// One DynamoDB client for the whole service (AWS SDK v3, Lab 7).
// On Floci, AWS_ENDPOINT_URL points the SDK at the local copy of AWS.
// On real AWS it is not set, and the SDK uses the normal DynamoDB address.
// No keys here: on Lambda the IAM role gives the permissions.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const endpoint = process.env.AWS_ENDPOINT_URL;
const client = new DynamoDBClient(endpoint ? { endpoint } : {});

// The document client turns plain JavaScript objects into DynamoDB items and back.
// removeUndefinedValues: a favorite for the whole route simply has no stop_id.
const doc = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

function send(command) {
  return doc.send(command);
}

module.exports = { send };
