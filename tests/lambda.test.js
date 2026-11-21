// Checks that lambda.js sends each kind of event to the right place.
jest.mock('../config/secrets', () => ({ loadSecrets: jest.fn().mockResolvedValue() }));
jest.mock('../services/alerts', () => ({
  sendHolidayAlertsToAllParents: jest.fn().mockResolvedValue({ parents: 2, sent: 1 })
}));
jest.mock('../db', () => jest.fn());

const { loadSecrets } = require('../config/secrets');
const alerts = require('../services/alerts');
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

  test('secrets are loaded only once', () => {
    expect(loadSecrets).toHaveBeenCalledTimes(1);
  });
});
