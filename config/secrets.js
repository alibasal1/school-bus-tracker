// Loads the secrets (Neon link, Calendarific key) from AWS Secrets Manager.
// On Lambda: SECRET_ID is set, so we read the secret once when the function starts.
// On your PC: SECRET_ID is not set, so the values come from .env as before.
// The secret never appears in the code, in the Lambda settings or in the logs (Lecture 6).
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

async function loadSecrets() {
  const secretId = process.env.SECRET_ID;
  if (!secretId) return;

  // No keys here: the Lambda's IAM role gives permission to read this one secret.
  const client = new SecretsManagerClient({});
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  const values = JSON.parse(result.SecretString);
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

module.exports = { loadSecrets };
