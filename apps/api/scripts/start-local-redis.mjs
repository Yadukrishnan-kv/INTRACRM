import { RedisMemoryServer } from 'redis-memory-server';

const redis = new RedisMemoryServer({
  instance: { port: 6379 },
});

await redis.start();
const host = await redis.getHost();
const port = await redis.getPort();
console.log(`Redis memory server listening on ${host}:${port}`);
