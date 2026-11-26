// Checks that lambda.js sends each kind of event to the right place.
jest.mock('../config/secrets', () => ({ loadSecrets: jest.fn().mockResolvedValue() }));
jest.mock('../db/dynamo', () => require('./helpers/fakeDynamo').createFake());
jest.mock('../services/alertsQueue', () => ({ handleQueueMessage: jest.fn().mockResolvedValue(1) }));

const { loadSecrets } = require('../config/secrets');
const { handleQueueMessage } = require('../services/alertsQueue');
const { handler } = require('../lambda');

function webEvent(path) {
  return {
    version: '2.0', rawPath: path, rawQueryString: '', headers: { host: 'test' },
    requestContext: { http: { method: 'GET', path, sourceIp: '1.1.1.1' } }, isBase64Encoded: false
  };
}

describe('lambda handler', () => {
  test('API Gateway request goes to Express', async () => {
    const result = await handler(webEvent('/api/health'), {});
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).service).toBe('favorites-alerts');
  });

  test('a JSON body from API Gateway reaches Express as an object, not a Buffer', () => {
    const { parseJsonBody } = require('../lambda');
    const json = { headers: { 'content-type': 'application/json' }, body: Buffer.from('{"isRead":true}') };
    parseJsonBody(json);
    expect(json.body).toEqual({ isRead: true });

    const broken = { headers: { 'content-type': 'application/json' }, body: Buffer.from('{bad') };
    parseJsonBody(broken);
    expect(broken.body).toBeUndefined();

    const text = { headers: { 'content-type': 'text/plain' }, body: Buffer.from('a=1') };
    parseJsonBody(text);
    expect(text.body).toBeUndefined();
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
