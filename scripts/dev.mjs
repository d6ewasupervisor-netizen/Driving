/**
 * Picks a free TCP port (default range 3001–3010), sets PORT + VITE_API_TARGET,
 * then runs the same concurrent server + client as `npm run dev:inner`.
 * Avoids EADDRINUSE when an old API server is still bound to 3001.
 */
import net from 'net';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, '0.0.0.0');
  });
}

async function pickPort(start, endInclusive) {
  for (let p = start; p <= endInclusive; p++) {
    if (await portFree(p)) return p;
  }
  throw new Error(`No free TCP port between ${start} and ${endInclusive}`);
}

const start = Number(process.env.API_PORT_START || 3001);
const span = Number(process.env.API_PORT_SPAN || 10);
const port = await pickPort(start, start + span - 1);

if (port !== start) {
  console.log(
    `[dev] Port ${start} is in use; API will use ${port}. Vite proxy target is set automatically.`
  );
}

const env = {
  ...process.env,
  PORT: String(port),
  VITE_API_TARGET: `http://localhost:${port}`,
};

// Windows: spawning npm.cmd with shell:false causes EINVAL; use shell so PATH resolves npm.
const child = spawn('npm', ['run', 'dev:inner'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
