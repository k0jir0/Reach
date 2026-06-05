import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

async function listSnapshots() {
  const dir = path.join(root, '.reach');
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function listRuns() {
  const dir = path.join(root, '.reach', 'runs');
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function startServer(port = 7331) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (url.pathname === '/') {
        const html = await fs.readFile(path.join(root, 'public', 'index.html'), 'utf8');
        send(res, 200, html, 'text/html; charset=utf-8');
        return;
      }

      if (url.pathname === '/api/snapshots') {
        send(res, 200, JSON.stringify(await listSnapshots()), 'application/json; charset=utf-8');
        return;
      }

      if (url.pathname === '/api/runs') {
        send(res, 200, JSON.stringify(await listRuns()), 'application/json; charset=utf-8');
        return;
      }

      if (url.pathname.startsWith('/api/snapshots/')) {
        const name = path.basename(decodeURIComponent(url.pathname.replace('/api/snapshots/', '')));
        if (!name.endsWith('.json')) {
          send(res, 400, 'invalid snapshot');
          return;
        }
        const filePath = path.join(root, '.reach', name);
        const body = await fs.readFile(filePath, 'utf8');
        send(res, 200, body, 'application/json; charset=utf-8');
        return;
      }

      if (url.pathname.startsWith('/api/runs/')) {
        const name = path.basename(decodeURIComponent(url.pathname.replace('/api/runs/', '')));
        if (!name.endsWith('.json')) {
          send(res, 400, 'invalid run');
          return;
        }
        const filePath = path.join(root, '.reach', 'runs', name);
        const body = await fs.readFile(filePath, 'utf8');
        send(res, 200, body, 'application/json; charset=utf-8');
        return;
      }

      send(res, 404, 'not found');
    } catch (error) {
      send(res, 500, error instanceof Error ? error.message : String(error));
    }
  });

  server.listen(port, () => {
    console.log(`Reach dashboard: http://localhost:${port}`);
  });

  return server;
}
