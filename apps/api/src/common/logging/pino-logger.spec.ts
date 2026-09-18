import { PinoLogger } from './pino-logger';

describe('PinoLogger', () => {
  it('creates a logger without throwing', () => {
    const logger = new PinoLogger({
      name: 'test',
      env: 'test',
      level: 'silent',
      pretty: false,
    });
    expect(() => logger.log('hello')).not.toThrow();
  });
});
