#!/usr/bin/env node

import { CodexAppServerClient } from './app-server/client.js';
import { runCli } from './cli/index.js';
import { NodeTerminal } from './cli/terminal.js';
import { usage } from './config.js';
import { checkCodexCli } from './utils/check-codex-cli.js';
import { parseArgs } from './utils/cli-arguments.js';

async function main(): Promise<void> {
  const { help, resumeThreadId, state } = parseArgs(process.argv.slice(2));

  if (help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const codexVersion = checkCodexCli();
  const terminal = new NodeTerminal();
  terminal.write(`Using ${codexVersion}\nConnecting to Codex app-server...\n`);

  const appServer = new CodexAppServerClient({
    codexHome: state.codexHome,
    cwd: state.cwd,
  });

  try {
    await appServer.connect();

    if (await appServer.hasApiKeyAuthentication()) {
      terminal.write('Authentication: saved API key\n');
    } else {
      terminal.write('No saved API key authentication found.\n');
      const apiKey = (await terminal.questionSecret('OpenAI API key: ')).trim();
      if (!apiKey) {
        throw new Error('OpenAI API key is required');
      }

      await appServer.loginWithApiKey(apiKey);
      terminal.write('Authentication: API key saved in .codex-data/auth.json\n');
    }

    await runCli(state, appServer, terminal, resumeThreadId);
  } finally {
    terminal.close();
    await appServer.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
