#!/usr/bin/env bash
# Deploys the Favorites & Alerts service to Floci (or real AWS) with one command:
#   bash infra/deploy.sh
# Same commands as Lab 6 and Lab 7, in one file, so anyone can rebuild it.
set -e
export MSYS_NO_PATHCONV=1                # stop Git Bash from changing /api/... into C:/...
export AWS_PROFILE=${AWS_PROFILE:-floci}
cd "$(dirname "$0")/.."                  # run from the repo folder

FN=favorites-alerts-api
ROLE=favorites-alerts-api-role
POLICY=favorites-alerts-access
API_NAME=favorites-alerts-http-api
SECRET_NAME=favorites-alerts/app
RULE=favorites-alerts-daily-holiday
QUEUE=favorites-alerts-queue
DLQ=favorites-alerts-dlq
KEY_ALIAS=alias/favorites-alerts
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo us-east-1)

echo "== 0. KMS: our own key that encrypts the secret, rotated every year"
KEY_ID=$(aws kms list-aliases --query "Aliases[?AliasName=='$KEY_ALIAS'].TargetKeyId | [0]" --output text)
if [ -z "$KEY_ID" ] || [ "$KEY_ID" = "None" ]; then
  KEY_ID=$(aws kms create-key --description "Encrypts the favorites-alerts secret" \
    --query KeyMetadata.KeyId --output text)
  aws kms create-alias --alias-name $KEY_ALIAS --target-key-id $KEY_ID
fi
aws kms enable-key-rotation --key-id $KEY_ID
KEY_ARN=$(aws kms describe-key --key-id $KEY_ID --query KeyMetadata.Arn --output text)
mkdir -p out
# The policy file says KMS_KEY_ARN; put the real key address in a copy
sed "s#KMS_KEY_ARN#$KEY_ARN#" infra/iam/favorites-alerts-policy.json > out/policy.json

echo "== 1. IAM role (who may wear the badge) and policy (what it opens)"
if ! aws iam get-role --role-name $ROLE >/dev/null 2>&1; then
  aws iam create-role --role-name $ROLE \
    --assume-role-policy-document file://infra/iam/trust-policy.json >/dev/null
fi
POLICY_ARN=arn:aws:iam::$ACCOUNT:policy/$POLICY
if ! aws iam get-policy --policy-arn $POLICY_ARN >/dev/null 2>&1; then
  aws iam create-policy --policy-name $POLICY \
    --policy-document file://out/policy.json >/dev/null
else
  # Policy exists: save the new version from the file (keep at most 5 versions)
  for V in $(aws iam list-policy-versions --policy-arn $POLICY_ARN \
      --query "Versions[?IsDefaultVersion==\`false\`].VersionId" --output text); do
    aws iam delete-policy-version --policy-arn $POLICY_ARN --version-id $V
  done
  aws iam create-policy-version --policy-arn $POLICY_ARN --set-as-default \
    --policy-document file://out/policy.json >/dev/null
fi
aws iam attach-role-policy --role-name $ROLE --policy-arn $POLICY_ARN

echo "== 2. Build lambda.zip"
npm run zip --silent

echo "== 3. Secrets Manager: the Neon link and Calendarific key go in one secret"
[ -f .env ] || { echo "Missing .env. Copy .env.example to .env first."; exit 1; }
mkdir -p out
: > out/api-url.txt
node -e "
require('dotenv').config();
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is empty in .env'); process.exit(1); }
const secret = { DATABASE_URL: process.env.DATABASE_URL,
  CALENDARIFIC_API_KEY: process.env.CALENDARIFIC_API_KEY || '' };
require('fs').writeFileSync('out/secret.json', JSON.stringify(secret));
const v = { NODE_ENV: 'production', SECRET_ID: '$SECRET_NAME',
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'http://localhost:5173' };
require('fs').writeFileSync('out/lambda-env.json', JSON.stringify({ Variables: v }));"
if aws secretsmanager describe-secret --secret-id $SECRET_NAME >/dev/null 2>&1; then
  aws secretsmanager update-secret --secret-id $SECRET_NAME \
    --kms-key-id $KEY_ARN --secret-string file://out/secret.json >/dev/null
else
  aws secretsmanager create-secret --name $SECRET_NAME \
    --description "Neon link and Calendarific key for favorites-alerts-api" \
    --kms-key-id $KEY_ARN --secret-string file://out/secret.json >/dev/null
fi
rm -f out/secret.json                    # it holds secrets, do not keep it

echo "== 4. Lambda function $FN"
if aws lambda get-function --function-name $FN >/dev/null 2>&1; then
  aws lambda update-function-code --function-name $FN --zip-file fileb://lambda.zip >/dev/null
  aws lambda wait function-updated-v2 --function-name $FN
  aws lambda update-function-configuration --function-name $FN \
    --environment file://out/lambda-env.json >/dev/null
else
  aws lambda create-function --function-name $FN \
    --runtime nodejs24.x --handler lambda.handler \
    --role arn:aws:iam::$ACCOUNT:role/$ROLE \
    --zip-file fileb://lambda.zip --timeout 15 \
    --environment file://out/lambda-env.json >/dev/null
fi
aws lambda wait function-active-v2 --function-name $FN
aws lambda wait function-updated-v2 --function-name $FN
rm -f out/lambda-env.json

echo "== 5. API Gateway (the front door): only our routes reach Lambda"
API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='$API_NAME'].ApiId | [0]" --output text)
if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
  API_ID=$(aws apigatewayv2 create-api --name $API_NAME \
    --protocol-type HTTP --query ApiId --output text)
  INTEGRATION_ID=$(aws apigatewayv2 create-integration --api-id $API_ID \
    --integration-type AWS_PROXY --payload-format-version 2.0 \
    --integration-uri arn:aws:lambda:$REGION:$ACCOUNT:function:$FN \
    --query IntegrationId --output text)
  for ROUTE in "GET /api/health" \
               "GET /api/favorites" "POST /api/favorites" "DELETE /api/favorites/{id}" \
               "GET /api/alerts" "PATCH /api/alerts/{id}" \
               "GET /api/holidays" \
               "OPTIONS /api/favorites" "OPTIONS /api/favorites/{id}" \
               "OPTIONS /api/alerts" "OPTIONS /api/alerts/{id}" "OPTIONS /api/holidays"; do
    aws apigatewayv2 create-route --api-id $API_ID --route-key "$ROUTE" \
      --target integrations/$INTEGRATION_ID --query RouteKey --output text
  done
  aws apigatewayv2 create-stage --api-id $API_ID --stage-name '$default' --auto-deploy >/dev/null
  aws lambda add-permission --function-name $FN --statement-id apigw-invoke \
    --action lambda:InvokeFunction --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT:$API_ID/*" >/dev/null
fi

echo "== 6. EventBridge: every day at 18:00 UTC (8 PM Cairo) run the holiday job"
aws events put-rule --name $RULE \
  --schedule-expression "cron(0 18 * * ? *)" \
  --description "Send tomorrow's holiday alerts to parents" >/dev/null
aws events put-targets --rule $RULE \
  --targets "Id"="1","Arn"="arn:aws:lambda:$REGION:$ACCOUNT:function:$FN" >/dev/null
aws lambda add-permission --function-name $FN --statement-id eventbridge-daily-holiday \
  --action lambda:InvokeFunction --principal events.amazonaws.com \
  --source-arn "arn:aws:events:$REGION:$ACCOUNT:rule/$RULE" >/dev/null 2>&1 || true

echo "== 7. SQS: the alerts queue (Yehia and Ahmed send here), plus a dead-letter queue"
DLQ_URL=$(aws sqs create-queue --queue-name $DLQ --query QueueUrl --output text)
DLQ_ARN=$(aws sqs get-queue-attributes --queue-url $DLQ_URL \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)
# After 3 failed tries a message moves to the dead-letter queue instead of being lost
node -e "
const redrive = JSON.stringify({ deadLetterTargetArn: '$DLQ_ARN', maxReceiveCount: '3' });
require('fs').writeFileSync('out/queue-attributes.json',
  JSON.stringify({ VisibilityTimeout: '30', RedrivePolicy: redrive }));"
QUEUE_URL=$(aws sqs create-queue --queue-name $QUEUE --query QueueUrl --output text)
aws sqs set-queue-attributes --queue-url $QUEUE_URL --attributes file://out/queue-attributes.json
QUEUE_ARN=$(aws sqs get-queue-attributes --queue-url $QUEUE_URL \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)
MAPPING=$(aws lambda list-event-source-mappings --function-name $FN \
  --event-source-arn $QUEUE_ARN --query "EventSourceMappings[0].UUID" --output text)
if [ -z "$MAPPING" ] || [ "$MAPPING" = "None" ]; then
  aws lambda create-event-source-mapping --function-name $FN \
    --event-source-arn $QUEUE_ARN --batch-size 10 >/dev/null
fi
echo "QUEUE_URL=$QUEUE_URL" >> out/api-url.txt
echo "Queue: $QUEUE_URL"

if [ "$ACCOUNT" = "000000000000" ]; then
  API_URL=http://$API_ID.execute-api.localhost.floci.io:4566
else
  API_URL=https://$API_ID.execute-api.$REGION.amazonaws.com
fi
echo "API_URL=$API_URL" >> out/api-url.txt

echo "== 8. Test the API"
curl -s --max-time 30 "$API_URL/api/health" || echo "(no answer yet: wait a few seconds and open the address below in your browser)"; echo

echo "== 9. Test the daily job now (same event EventBridge sends)"
aws lambda invoke --function-name $FN \
  --payload file://infra/events/daily-holiday.json \
  --cli-binary-format raw-in-base64-out out/daily-holiday-result.json >/dev/null \
  && cat out/daily-holiday-result.json; echo

echo
echo "Done. Your API address: $API_URL"
echo "Queue for Yehia and Ahmed: $QUEUE_URL"
echo "Logs: MSYS_NO_PATHCONV=1 aws logs tail /aws/lambda/$FN --since 15m --format short"
