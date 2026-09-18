import http from 'node:http';

type Stats = {
  ok: number;
  fail: number;
  durations: number[];
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

async function hit(url: string): Promise<number> {
  const started = Date.now();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  await response.text();
  return Date.now() - started;
}

async function run(url: string, total: number, concurrency: number): Promise<Stats> {
  const stats: Stats = { ok: 0, fail: 0, durations: [] };
  let next = 0;
  async function worker() {
    while (next < total) {
      const current = next;
      next += 1;
      void current;
      try {
        const ms = await hit(url);
        stats.ok += 1;
        stats.durations.push(ms);
      } catch {
        stats.fail += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return stats;
}

async function main(): Promise<void> {
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/api/v1/health/live')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.url?.includes('/assign')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { id: 'lead-1', assigned: true } }));
      return;
    }
    if (req.url?.startsWith('/api/v1/leads')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [], meta: { requestId: 'load', timestamp: new Date().toISOString() } }));
      return;
    }
    if (req.url?.startsWith('/api/v1/sync')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { leads: [], notes: [], followUps: [] } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind load-test server');
  }
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const scenarios = [
      { name: 'health', path: '/api/v1/health/live', total: 200, concurrency: 20 },
      { name: 'lead-list', path: '/api/v1/leads', total: 200, concurrency: 20 },
      { name: 'lead-assign', path: '/api/v1/leads/lead-1/assign', total: 100, concurrency: 10 },
      { name: 'sync', path: '/api/v1/sync', total: 100, concurrency: 10 },
    ];
    for (const scenario of scenarios) {
      const stats = await run(`${base}${scenario.path}`, scenario.total, scenario.concurrency);
      const p95 = percentile(stats.durations, 95);
      const success = stats.ok / (stats.ok + stats.fail);
      console.log(
        `${scenario.name}: ok=${stats.ok} fail=${stats.fail} p95=${p95}ms success=${(success * 100).toFixed(1)}%`,
      );
      if (success < 0.99) {
        throw new Error(`${scenario.name} success rate ${success} is below 99%`);
      }
      if (p95 > 2000) {
        throw new Error(`${scenario.name} p95 ${p95}ms exceeded 2s`);
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

void main();
