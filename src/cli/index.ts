import { WorkflowRunner } from '../agents/workflow-runner.js';
import type { AppServerClient } from '../app-server/client.js';
import type { CliState } from '../types.js';
import { handleCommand } from './commands.js';
import { handleServerRequest } from './server-requests/handler.js';
import { PromptQueue } from './server-requests/queue.js';
import { printSessionSummary, printWelcome } from './session-output.js';
import { NodeTerminal, type Terminal } from './terminal.js';
import { TurnRunner } from './turn/runner.js';

export async function runCli(
  state: CliState,
  client: AppServerClient,
  terminal: Terminal = new NodeTerminal(),
  resumeThreadId?: string,
): Promise<void> {
  let exiting = false;
  const promptQueue = new PromptQueue();
  const turnRunner = new TurnRunner(state, client, terminal);
  const workflowRunner = new WorkflowRunner(state, turnRunner, terminal);

  client.setServerRequestHandler(request =>
    promptQueue.run(() => handleServerRequest(request, terminal, workflowRunner.workingIndicator)),
  );

  const unsubscribeInterrupt = terminal.onInterrupt(() => {
    if (workflowRunner.interrupt()) {
      return;
    }

    exiting = true;
    terminal.close();
  });

  try {
    printWelcome(terminal, state);
    if (resumeThreadId) {
      await handleCommand(`/resume ${resumeThreadId}`, { client, state, terminal });
    }

    while (!exiting) {
      let input: string;
      try {
        input = (await terminal.question('\nyou> ')).trim();
      } catch {
        break;
      }

      if (!input) {
        continue;
      }

      if (input.startsWith('/')) {
        const result = await handleCommand(input, { client, state, terminal });
        if (result === 'exit') {
          break;
        }
        continue;
      }

      try {
        await workflowRunner.run(input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        terminal.writeError(`\nError: ${message}\n`);
      }
    }
  } finally {
    unsubscribeInterrupt();
    terminal.close();
    printSessionSummary(terminal, state);
  }
}
