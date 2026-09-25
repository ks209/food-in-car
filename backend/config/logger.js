import fs from 'fs';
import path from 'path';
import { createStream } from 'rotating-file-stream';

// File logging, off by default.
//
// In containers stdout IS the log: `docker compose logs backend`, with rotation
// handled by the json-file driver in docker-compose.yml. Set LOG_DIR to ALSO
// write rotating files on disk — useful when logs must outlive the container,
// be shipped elsewhere, or be read without Docker.
//
//   LOG_DIR=/app/logs     where to write (unset = stdout only)
//   LOG_MAX_SIZE=10M      rotate once a file reaches this
//   LOG_KEEP=14           how many rotated files to keep (older ones deleted)
//
// Two files: access.log (one line per HTTP request, morgan "combined") and
// app.log (everything the app prints). Both rotate daily as well as by size,
// and rotated files are gzipped.

const LOG_DIR = process.env.LOG_DIR;
const size = process.env.LOG_MAX_SIZE || '10M';
const maxFiles = Number(process.env.LOG_KEEP || 14);

const makeStream = (name) => createStream(name, {
  path: LOG_DIR,
  size,
  interval: '1d',
  maxFiles,
  compress: 'gzip',
});

let accessLogStream = null;
let appLogStream = null;

if (LOG_DIR) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    accessLogStream = makeStream('access.log');
    appLogStream = makeStream('app.log');
    // A disk that fills up, or a read-only mount, must not take the API down.
    for (const stream of [accessLogStream, appLogStream]) {
      stream.on('error', (err) => process.stderr.write(`[logger] write failed: ${err.message}\n`));
    }
  } catch (err) {
    process.stderr.write(`[logger] file logging disabled — ${err.message}\n`);
    accessLogStream = null;
    appLogStream = null;
  }
}

export { accessLogStream };

// Mirrors console output into app.log, keeping stdout/stderr as they are so
// `docker compose logs` still works. Timestamped and levelled, so the file is
// readable on its own.
export function setupFileLogging() {
  if (!appLogStream) return false;

  const write = (level, args) => {
    const line = args
      .map((a) => (typeof a === 'string' ? a : a instanceof Error ? (a.stack || a.message) : safeStringify(a)))
      .join(' ');
    appLogStream.write(`${new Date().toISOString()} ${level} ${line}\n`);
  };

  for (const [method, level] of [['log', 'INFO'], ['info', 'INFO'], ['warn', 'WARN'], ['error', 'ERROR']]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      original(...args);
      try { write(level, args); } catch { /* never let logging break a request */ }
    };
  }

  // Otherwise these die silently to a file-only reader.
  process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
  process.on('uncaughtException', (err) => { console.error('[uncaughtException]', err); });

  console.log(`[logger] writing ${path.join(LOG_DIR, 'access.log')} and app.log (rotate ${size}/daily, keep ${maxFiles})`);
  return true;
}

function safeStringify(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}
