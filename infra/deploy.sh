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
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo us-east-1)

echo "== 1. IAM role (who may wear the badge) and policy (what it opens)"
if ! aws iam get-role --role-name $ROLE >/dev/null 2>&1; then
  aws iam create-role --role-name $ROLE \
    --assume-role-policy-document file://infra/iam/trust-policy.json >/dev/null
fi
POLICY_ARN=arn:aws:iam::$ACCOUNT:policy/$POLICY
if ! aws iam get-policy --policy-arn $POLICY_ARN >/dev/null 2>&1; then
  aws iam create-policy --policy-name $POLICY \
    --policy-document file://infra/iam/favorites-alerts-policy.json >/dev/null
fi
aws iam attach-role-policy --role-name $ROLE --policy-arn $POLICY_ARN

echo "== 2. Build lambda.zip"
npm run zip --silent

echo "== 3. Lambda settings from .env (the file itself is never uploaded)"
[ -f .env ] || { echo "Missing .env. Copy .env.example to .env first."; exit 1; }
mkdir -p out
node -e "
require('dotenv').config();
const v = { NODE_ENV: 'production',
  DATABASE_URL: process.env.DATABASE_URL,
  CALENDARIFIC_API_KEY: process.env.CALENDARIFIC_API_KEY || '',
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'http://localhost:5173' };
require('fs').writeFileSync('out/lambda-env.json', JSON.stringify({ Variables: v }));"

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
rm -f out/lambda-env.json                # it holds secrets, do not keep it

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

if [ "$ACCOUNT" = "000000000000" ]; then
  API_URL=http://$API_ID.execute-api.localhost.floci.io:4566
else
  API_URL=https://$API_ID.execute-api.$REGION.amazonaws.com
fi
echo "API_URL=$API_URL" > out/api-url.txt

echo "== 6. Test"
curl -s --max-time 30 "$API_URL/api/health" || echo "(no answer yet: wait a few seconds and open the address below in your browser)"; echo
echo
echo "Done. Your API address: $API_URL"
echo "Logs: aws logs tail /aws/lambda/$FN --since 15m --format short"
