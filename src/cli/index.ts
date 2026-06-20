import { createInterface } from 'node:readline/promises';

import { type MCPServerStdio, MemorySession, run, Usage } from '@openai/agents';

import { createCodingAgent } from '../agent.js';
import type { CliState } from '../types.js';
import { checkCodexCli } from './check-codex-cli.js';
import { getErrorMessage, printWelcome } from './common.js';
import { handleCommand } from './handle-command.js';
import { createRunOutputState, finishRunOutput, renderRunEvent } from './render-run-event.js';
import { printSessionSummary } from './session-summary.js';
import { WorkingIndicator } from './working-indicator.js';

export { checkCodexCli };

export async function runCli(state: CliState, codexMcpServer: MCPServerStdio): Promise<void> {
  const session = new MemorySession();
  const sessionUsage = new Usage();

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  });

  let activeAbortController: AbortController | undefined;
  let exiting = false;

  readline.on('SIGINT', () => {
    if (activeAbortController) {
      activeAbortController.abort();
      process.stdout.write('\n[turn cancelled]\n');
      return;
    }

    exiting = true;
    readline.close();
  });

  printWelcome(state);

  try {
    while (!exiting) {
      let input: string;
      try {
        input = (await readline.question('\nyou> ')).trim();
      } catch {
        break;
      }

      if (!input) {
        continue;
      }

      if (input.startsWith('/')) {
        const shouldExit = await handleCommand(input, state, session);

        if (shouldExit) {
          break;
        }

        continue;
      }

      activeAbortController = new AbortController();
      try {
        await executeTurn(
          input,
          state,
          codexMcpServer,
          session,
          sessionUsage,
          activeAbortController.signal,
        );
      } catch (error) {
        if (!activeAbortController.signal.aborted) {
          process.stderr.write(`\nError: ${getErrorMessage(error)}\n`);
        }
      } finally {
        activeAbortController = undefined;
      }
    }
  } finally {
    readline.close();
    printSessionSummary(sessionUsage, state.codexThreadId);
  }
}

async function executeTurn(
  input: string,
  state: CliState,
  codexMcpServer: MCPServerStdio,
  session: MemorySession,
  sessionUsage: Usage,
  signal: AbortSignal,
): Promise<void> {
  const agent = createCodingAgent(state, codexMcpServer);
  const working = new WorkingIndicator();

  process.stdout.write('\n');
  working.start();

  try {
    const result = await run(agent, input, {
      stream: true,
      session,
      signal,
      maxTurns: 20,
    });

    try {
      const output = createRunOutputState(() => working.hide());

      for await (const event of result) {
        renderRunEvent(event, output, state);
        if (!output.openLine) {
          working.show();
        }
      }

      working.hide();
      finishRunOutput(output);
      await result.completed;

      if (!output.streamedText && typeof result.finalOutput === 'string') {
        process.stdout.write(`agent> ${result.finalOutput}\n`);
      }
    } finally {
      sessionUsage.add(result.state.usage);
    }
  } finally {
    working.stop();
  }
}
