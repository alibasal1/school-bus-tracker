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
TOPIC=favorites-alerts-ops
# Yehia publishes every trip change to this topic (Route & Stop, transactional outbox)
ROUTE_TOPIC=school-bus-route-events
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
NEW_API=no
if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
  API_ID=$(aws apigatewayv2 create-api --name $API_NAME \
    --protocol-type HTTP --query ApiId --output text)
  aws apigatewayv2 create-integration --api-id $API_ID \
    --integration-type AWS_PROXY --payload-format-version 2.0 \
    --integration-uri arn:aws:lambda:$REGION:$ACCOUNT:function:$FN >/dev/null
  NEW_API=yes
fi
INTEGRATION_ID=$(aws apigatewayv2 get-integrations --api-id $API_ID \
  --query "Items[0].IntegrationId" --output text)
EXISTING=$(aws apigatewayv2 get-routes --api-id $API_ID --query "Items[].RouteKey" --output text)
# Every route we allow. Anything else gets 404 from API Gateway, before Lambda runs.
for ROUTE in "GET /api/health" \
             "GET /api/favorites" "POST /api/favorites" "DELETE /api/favorites/{id}" \
             "GET /api/favorites/options" \
             "GET /api/alerts" "PATCH /api/alerts/{id}" \
             "GET /api/holidays" \
             "OPTIONS /api/favorites" "OPTIONS /api/favorites/{id}" "OPTIONS /api/favorites/options" \
             "OPTIONS /api/alerts" "OPTIONS /api/alerts/{id}" "OPTIONS /api/holidays"; do
  if ! printf '%s' "$EXISTING" | tr -d '\r' | tr '\t' '\n' | grep -qxF "$ROUTE"; then
    aws apigatewayv2 create-route --api-id $API_ID --route-key "$ROUTE" \
      --target integrations/$INTEGRATION_ID --query RouteKey --output text
  fi
done
if [ "$NEW_API" = "yes" ]; then
  aws apigatewayv2 create-stage --api-id $API_ID --stage-name '$default' --auto-deploy --default-route-settings ThrottlingBurstLimit=20,ThrottlingRateLimit=10 >/dev/null
  aws lambda add-permission --function-name $FN --statement-id apigw-invoke \
    --action lambda:InvokeFunction --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT:$API_ID/*" >/dev/null
fi

# Rate limiting at the front door: API Gateway refuses extra requests with 429
# before Lambda even starts, so a flood of login-guessing or scraping costs us nothing.
# 10 requests a second, with a burst of 20. Re-applied on every deploy.
aws apigatewayv2 update-stage --api-id $API_ID --stage-name '$default' \
  --default-route-settings ThrottlingBurstLimit=20,ThrottlingRateLimit=10 >/dev/null
echo "   rate limit: 10 req/s, burst 20"

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

echo "== 7b. SNS: subscribe the queue to Yehia route events topic (if it is here)"
# Yehia Route & Stop service writes trip.created / trip.cancelled into its outbox
# and a forwarder Lambda publishes them to $ROUTE_TOPIC. Subscribing this queue
# means a cancelled trip reaches the parents who saved that route, with no direct
# call between the two services: if this service is down the messages wait in SQS.
#
# The topic belongs to Yehia, so this script never creates or changes it. His API
# still runs on Vercel, so on a fresh Floci the topic is simply not there yet:
# print a warning and carry on, the deploy must not stop for it.
ROUTE_TOPIC_ARN=$(aws sns list-topics \
  --query "Topics[?ends_with(TopicArn, ':$ROUTE_TOPIC')].TopicArn | [0]" --output text 2>/dev/null)
if [ -z "$ROUTE_TOPIC_ARN" ] || [ "$ROUTE_TOPIC_ARN" = "None" ]; then
  echo "   WARNING: topic $ROUTE_TOPIC is not on this AWS copy yet, subscription skipped."
  echo "   Ask Yehia to create it, or run his forwarder here, then run this script again."
else
  # The topic may only send to this one queue, nothing else.
  node -e "
  const policy = JSON.stringify({ Version: '2012-10-17', Statement: [{
    Effect: 'Allow', Principal: { Service: 'sns.amazonaws.com' },
    Action: 'sqs:SendMessage', Resource: '$QUEUE_ARN',
    Condition: { ArnEquals: { 'aws:SourceArn': '$ROUTE_TOPIC_ARN' } } }] });
  require('fs').writeFileSync('out/queue-policy.json', JSON.stringify({ Policy: policy }));"
  aws sqs set-queue-attributes --queue-url $QUEUE_URL --attributes file://out/queue-policy.json

  SUB=$(aws sns list-subscriptions-by-topic --topic-arn $ROUTE_TOPIC_ARN \
    --query "Subscriptions[?Endpoint=='$QUEUE_ARN'].SubscriptionArn | [0]" --output text 2>/dev/null)
  if [ -z "$SUB" ] || [ "$SUB" = "None" ]; then
    SUB=$(aws sns subscribe --topic-arn $ROUTE_TOPIC_ARN --protocol sqs \
      --notification-endpoint $QUEUE_ARN --query SubscriptionArn --output text)
  fi
  # Raw delivery: the body is the event itself, not an SNS envelope.
  aws sns set-subscription-attributes --subscription-arn $SUB \
    --attribute-name RawMessageDelivery --attribute-value true
  # Only the two events this service understands are delivered. Anything else
  # Yehia adds later stays out of the queue instead of being received and dropped.
  node -e "require('fs').writeFileSync('out/filter-policy.json',
    JSON.stringify({ event_type: ['trip.cancelled', 'trip.created'] }));"
  aws sns set-subscription-attributes --subscription-arn $SUB \
    --attribute-name FilterPolicy --attribute-value "$(cat out/filter-policy.json)"
  echo "   subscribed to $ROUTE_TOPIC_ARN (raw delivery, trip.cancelled and trip.created only)"
fi

echo "== 8. CloudWatch alarms: tell us when something goes wrong (SNS topic $TOPIC)"
# Lecture 8: metrics detect the problem, logs explain it.
if TOPIC_ARN=$(aws sns create-topic --name $TOPIC --query TopicArn --output text 2>/dev/null) && \
   aws cloudwatch put-metric-alarm --alarm-name favorites-alerts-lambda-errors \
     --alarm-description "The Lambda failed at least once in 5 minutes" \
     --namespace AWS/Lambda --metric-name Errors \
     --dimensions Name=FunctionName,Value=$FN \
     --statistic Sum --period 300 --evaluation-periods 1 \
     --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
     --treat-missing-data notBreaching --alarm-actions $TOPIC_ARN && \
   aws cloudwatch put-metric-alarm --alarm-name favorites-alerts-dlq-not-empty \
     --alarm-description "A queue message failed 3 times and is waiting in the dead-letter queue" \
     --namespace AWS/SQS --metric-name ApproximateNumberOfMessagesVisible \
     --dimensions Name=QueueName,Value=$DLQ \
     --statistic Maximum --period 300 --evaluation-periods 1 \
     --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
     --treat-missing-data notBreaching --alarm-actions $TOPIC_ARN; then
  echo "Alarms: favorites-alerts-lambda-errors, favorites-alerts-dlq-not-empty -> $TOPIC"
  if [ -n "$ALARM_EMAIL" ]; then
    aws sns subscribe --topic-arn $TOPIC_ARN --protocol email \
      --notification-endpoint "$ALARM_EMAIL" >/dev/null
    echo "Alarm emails go to $ALARM_EMAIL (confirm the email AWS sends you)"
  fi
else
  echo "(this AWS copy has no CloudWatch alarms; skipped)"
fi

echo "== 8b. CloudWatch metric filter: count the refused requests in the logs"
# Lecture 8: a metric filter turns a log line into a number we can alarm on.
# middleware/logger.js writes one SECURITY line per refused request, so this
# counts 401, 403, 404, 429 and 5xx answers. Five or more in five minutes is
# either a bug or somebody trying tokens, and both are worth a message.
LOG_GROUP=/aws/lambda/$FN
FOUND_LOG=$(aws logs describe-log-groups --log-group-name-prefix $LOG_GROUP \
  --query "logGroups[0].logGroupName" --output text 2>/dev/null)
if [ -z "$FOUND_LOG" ] || [ "$FOUND_LOG" = "None" ]; then
  echo "   $LOG_GROUP does not exist yet: call the API once, then run this script again."
elif aws logs put-metric-filter --log-group-name $LOG_GROUP \
  --filter-name favorites-alerts-security-denied \
  --filter-pattern "SECURITY" \
  --metric-transformations \
      metricName=favorites-alerts-security-denied,metricNamespace=SchoolBus/FavoritesAlerts,metricValue=1,defaultValue=0 \
  2>/dev/null; then
  echo "   metric filter favorites-alerts-security-denied is in place"
  if [ -n "$TOPIC_ARN" ]; then
    aws cloudwatch put-metric-alarm --alarm-name favorites-alerts-security-denied-alarm \
      --alarm-description "5 or more refused requests in 5 minutes" \
      --namespace SchoolBus/FavoritesAlerts --metric-name favorites-alerts-security-denied \
      --statistic Sum --period 300 --evaluation-periods 1 \
      --threshold 5 --comparison-operator GreaterThanOrEqualToThreshold \
      --treat-missing-data notBreaching --alarm-actions $TOPIC_ARN 2>/dev/null \
      && echo "   alarm favorites-alerts-security-denied-alarm -> $TOPIC" \
      || echo "   (this AWS copy has no CloudWatch alarms; alarm skipped)"
  fi
else
  echo "   (this AWS copy has no metric filters; skipped)"
fi

if [ "$ACCOUNT" = "000000000000" ]; then
  API_URL=http://$API_ID.execute-api.localhost.floci.io:4566
else
  API_URL=https://$API_ID.execute-api.$REGION.amazonaws.com
fi
echo "API_URL=$API_URL" >> out/api-url.txt

echo "== 9. Test the API"
curl -s --max-time 30 "$API_URL/api/health" || echo "(no answer yet: wait a few seconds and open the address below in your browser)"; echo

echo "== 10. Test the daily job now (same event EventBridge sends)"
aws lambda invoke --function-name $FN \
  --payload file://infra/events/daily-holiday.json \
  --cli-binary-format raw-in-base64-out out/daily-holiday-result.json >/dev/null \
  && cat out/daily-holiday-result.json; echo

echo
echo "Done. Your API address: $API_URL"
echo "Queue for Yehia and Ahmed: $QUEUE_URL"
echo "Logs: MSYS_NO_PATHCONV=1 aws logs tail /aws/lambda/$FN --since 15m --format short"
