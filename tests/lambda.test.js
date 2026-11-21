// Checks that lambda.js sends each kind of event to the right place.
jest.mock('../config/secrets', () => ({ loadSecrets: jest.fn().mockResolvedValue() }));
jest.mock('../services/alerts', () => ({
  sendHolidayAlertsToAllParents: jest.fn().mockResolvedValue({ parents: 2, sent: 1 })
}));
jest.mock('../db', () => jest.fn());
jest.mock('../services/alertsQueue', () => ({ handleQueueMessage: jest.fn().mockResolvedValue(1) }));

const { loadSecrets } = require('../config/secrets');
const alerts = require('../services/alerts');
const { handleQueueMessage } = require('../services/alertsQueue');
const { handler } = require('../lambda');

function webEvent(path) {
  return {
    version: '2.0', rawPath: path, rawQueryString: '', headers: { host: 'test' },
    requestContext: { http: { method: 'GET', path, sourceIp: '1.1.1.1' } }, isBase64Encoded: false
  };
}

describe('lambda handler', () => {
  test('EventBridge schedule runs the daily holiday job', async () => {
    const result = await handler({ source: 'aws.events', 'detail-type': 'Scheduled Event' }, {});
    expect(alerts.sendHolidayAlertsToAllParents).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ parents: 2, sent: 1 });
  });

  test('API Gateway request goes to Express', async () => {
    const result = await handler(webEvent('/api/health'), {});
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).service).toBe('favorites-alerts');
  });

  test('SQS messages go to the alerts queue handler', async () => {
    const result = await handler({ Records: [
      { eventSource: 'aws:sqs', body: '{"a":1}' }, { eventSource: 'aws:sqs', body: '{"b":2}' }
    ] }, {});
    expect(handleQueueMessage).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ messages: 2, created: 2 });
  });

  test('secrets are loaded only once', () => {
    expect(loadSecrets).toHaveBeenCalledTimes(1);
  });
});
