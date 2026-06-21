#!/usr/bin/env node

import { CodexAppServerClient } from './app-server/client.js';
import { checkCodexCli, runCli } from './cli/index.js';
import { usage } from './config.js';
import { parseArgs } from './utils/cli-arguments.js';
import { loadLocalEnv, requireOpenAiApiKey } from './utils/environment.js';

async function main(): Promise<void> {
  loadLocalEnv();
  const { help, state } = parseArgs(process.argv.slice(2));

  if (help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const apiKey = requireOpenAiApiKey();
  const codexVersion = checkCodexCli();
  process.stdout.write(
    `Using ${codexVersion}\nAuthentication: API key only\nConnecting to Codex app-server...\n`,
  );

  const appServer = new CodexAppServerClient({
    apiKey,
    codexHome: state.codexHome,
    cwd: state.cwd,
  });

  try {
    await appServer.connect();
    await runCli(state, appServer);
  } finally {
    await appServer.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
