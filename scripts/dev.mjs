/**
 * Picks a free TCP port (default range 3002–3011), sets PORT + VITE_API_TARGET,
 * then runs the same concurrent server + client as `npm run dev:inner`.
 * Port 3001 is reserved — never used by this workspace.
 */
import net from 'net';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

/** Something already accepts connections on 127.0.0.1 (detects busy :::port on Windows). */
function localhostPortAccepts(port) {
  return new Promise((resolve) => {
    const c = net.createConnection({ port, host: '127.0.0.1', timeout: 400 });
    c.on('connect', () => {
      c.destroy();
      resolve(true);
    });
    c.on('timeout', () => {
      c.destroy();
      resolve(false);
    });
    c.on('error', () => resolve(false));
  });
}

/** True if we can bind the same way Node's http.Server.listen(port) typically does (all interfaces). */
function canBindPort(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port);
  });
}

const BLOCKED_PORTS = new Set([3001]);

async function pickPort(start, endInclusive) {
  for (let p = start; p <= endInclusive; p++) {
    if (BLOCKED_PORTS.has(p)) continue;
    if (await localhostPortAccepts(p)) continue;
    if (await canBindPort(p)) return p;
  }
  throw new Error(`No free TCP port between ${start} and ${endInclusive} (3001 blocked)`);
}

const start = Number(process.env.API_PORT_START || 3002);
const span = Number(process.env.API_PORT_SPAN || 10);
const port = await pickPort(start, start + span - 1);

console.log(
  `[dev] API port ${port}` +
    (port !== start ? ` (${start} was busy; Vite proxy updated via VITE_API_TARGET)` : '')
);

const env = {
  ...process.env,
  PORT: String(port),
  VITE_API_TARGET: `http://localhost:${port}`,
};

// Windows: direct spawn of npm without a shell often yields EINVAL; avoid `shell:true` + argv
// (Node deprecates that). Use cmd.exe /c or sh -c instead.
const isWin = process.platform === 'win32';
const child = spawn(
  isWin ? process.env.ComSpec || 'cmd.exe' : '/bin/sh',
  isWin ? ['/d', '/s', '/c', 'npm run dev:inner'] : ['-c', 'npm run dev:inner'],
  { cwd: root, env, stdio: 'inherit' }
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
