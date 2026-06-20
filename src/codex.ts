#!/usr/bin/env node

import { spawn } from 'node:child_process';

import { DEFAULT_CODEX_HOME, ensureCodexHome } from './codex-home.js';

ensureCodexHome(DEFAULT_CODEX_HOME);

const child = spawn('codex', process.argv.slice(2), {
  env: {
    ...process.env,
    CODEX_HOME: DEFAULT_CODEX_HOME,
  },
  stdio: 'inherit',
});

child.once('error', error => {
  process.stderr.write(`Failed to start Codex CLI: ${error.message}\n`);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
