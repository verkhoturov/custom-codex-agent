#!/usr/bin/env node

import { createCodexMcpClient } from './agent.js';
import { checkCodexCli, runCli } from './cli/index.js';
import { loadLocalEnv, parseArgs, usage } from './config.js';

async function main(): Promise<void> {
  loadLocalEnv();
  const { help, state } = parseArgs(process.argv.slice(2));

  if (help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to .env or export it in your shell. ChatGPT login in Codex CLI does not authenticate the Agents SDK.',
    );
  }

  const codexVersion = checkCodexCli();
  process.stdout.write(`Using ${codexVersion}\nConnecting to Codex MCP...\n`);

  const codexMcpServer = createCodexMcpClient(state);
  await codexMcpServer.connect();

  try {
    await runCli(state, codexMcpServer);
  } finally {
    await codexMcpServer.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
