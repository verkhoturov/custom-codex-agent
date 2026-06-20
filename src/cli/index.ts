import { createInterface } from 'node:readline/promises';

import type { CodexAppServerClient } from '../app-server/client.js';
import type {
  RpcNotification,
  ThreadItem,
  ThreadTokenUsage,
  TurnCompletedParams,
} from '../app-server/protocol.js';
import { interruptTurn, startTurn as startCodexTurn } from '../app-server/session.js';
import type { CliState } from '../types.js';
import { checkCodexCli } from './check-codex-cli.js';
import { getErrorMessage, printWelcome } from './common.js';
import { handleCommand } from './handle-command.js';
import { handleServerRequest } from './handle-server-request.js';
import {
  createAppServerOutputState,
  finishAppServerOutput,
  renderAppServerNotification,
} from './render-app-server-event.js';
import { printSessionSummary } from './session-summary.js';
import { WorkingIndicator } from './working-indicator.js';

export { checkCodexCli };

interface ActiveTurn {
  interruptRequested: boolean;
  turnId?: string;
  workingIndicator?: WorkingIndicator;
}

export async function runCli(state: CliState, client: CodexAppServerClient): Promise<void> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  });

  let activeTurn: ActiveTurn | undefined;
  let exiting = false;

  client.setServerRequestHandler(request =>
    handleServerRequest(request, readline, activeTurn?.workingIndicator),
  );

  readline.on('SIGINT', () => {
    if (activeTurn) {
      activeTurn.interruptRequested = true;
      activeTurn.workingIndicator?.hide();
      process.stdout.write('\n[interrupting turn]\n');
      if (activeTurn.turnId && state.threadId) {
        void interruptTurn(client, state.threadId, activeTurn.turnId).catch(error => {
          process.stderr.write(`Interrupt failed: ${getErrorMessage(error)}\n`);
        });
      }
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
        const shouldExit = await handleCommand(input, state, client);
        if (shouldExit) {
          break;
        }
        continue;
      }

      activeTurn = { interruptRequested: false };
      try {
        await executeTurn(input, state, client, activeTurn);
      } catch (error) {
        process.stderr.write(`\nError: ${getErrorMessage(error)}\n`);
      } finally {
        activeTurn = undefined;
      }
    }
  } finally {
    readline.close();
    printSessionSummary(state.tokenUsage, state.threadId);
  }
}

async function executeTurn(
  input: string,
  state: CliState,
  client: CodexAppServerClient,
  activeTurn: ActiveTurn,
): Promise<void> {
  const workingIndicator = new WorkingIndicator();
  const output = createAppServerOutputState(() => workingIndicator.hide());

  activeTurn.workingIndicator = workingIndicator;
  process.stdout.write('\n');
  workingIndicator.start();

  let completed: TurnCompletedParams | undefined;
  let resolveCompletion: (params: TurnCompletedParams) => void = () => undefined;

  const completion = new Promise<TurnCompletedParams>(resolve => {
    resolveCompletion = resolve;
  });

  const unsubscribe = client.onNotification(notification => {
    if (!belongsToActiveTurn(notification, state.threadId, activeTurn.turnId)) {
      return;
    }

    if (notification.method === 'thread/tokenUsage/updated') {
      const params = notification.params as { tokenUsage?: ThreadTokenUsage };
      if (params.tokenUsage) {
        state.tokenUsage = params.tokenUsage;
      }

      return;
    }

    if (notification.method === 'turn/completed') {
      completed = notification.params as TurnCompletedParams;
      resolveCompletion(completed);

      return;
    }

    renderAppServerNotification(notification, output);
    if (!output.openLine) {
      workingIndicator.show();
    }
  });

  try {
    activeTurn.turnId = await startCodexTurn(client, state, input);
    if (activeTurn.interruptRequested && state.threadId) {
      await interruptTurn(client, state.threadId, activeTurn.turnId);
    }

    completed = await completion;
    workingIndicator.hide();
    finishAppServerOutput(output);

    if (!output.streamedText) {
      const finalText = findFinalAgentMessage(completed);
      if (finalText) {
        process.stdout.write(`agent> ${finalText}\n`);
      }
    }

    if (completed.turn.status === 'failed' && !output.errorDisplayed) {
      throw new Error(completed.turn.error?.message || 'Codex turn failed');
    }
  } finally {
    unsubscribe();
    workingIndicator.stop();
    activeTurn.workingIndicator = undefined;
  }
}

function belongsToActiveTurn(
  notification: RpcNotification,
  threadId: string | undefined,
  turnId: string | undefined,
): boolean {
  const params = asRecord(notification.params);
  const notificationThreadId = stringValue(params.threadId);
  const notificationTurnId = stringValue(params.turnId);

  if (threadId && notificationThreadId && notificationThreadId !== threadId) {
    return false;
  }

  if (turnId && notificationTurnId && notificationTurnId !== turnId) {
    return false;
  }

  return true;
}

function findFinalAgentMessage(completed: TurnCompletedParams): string {
  const turn = completed.turn as TurnCompletedParams['turn'] & { items?: ThreadItem[] };
  const messages = (turn.items || []).filter(item => item.type === 'agentMessage');
  const last = messages.at(-1) as (ThreadItem & { text?: string }) | undefined;

  return last?.text || '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
