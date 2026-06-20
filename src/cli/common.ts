import type { RunItem } from '@openai/agents';

import type { CliState } from '../types.js';

export function captureThreadId(item: RunItem, state: CliState): void {
  if (item.type !== 'tool_call_output_item') {
    return;
  }

  const threadId = item.customData?.codexThreadId;
  if (typeof threadId === 'string') {
    state.codexThreadId = threadId;
  }
}

export function toolName(item: RunItem): string {
  if (item.type !== 'tool_call_item') {
    return 'tool';
  }

  const rawItem = item.rawItem as { name?: string };
  return rawItem.name || 'tool';
}

export function printWelcome(state: CliState): void {
  process.stdout.write(`Custom Codex Agent
cwd: ${state.cwd}
model: ${state.model}
sandbox: ${state.sandbox}
Run /help for commands. Ctrl+C cancels a turn or exits while idle.\n`);
}

export function printStatus(state: CliState): void {
  process.stdout.write(`cwd: ${state.cwd}
model: ${state.model}
sandbox: ${state.sandbox}
Codex thread: ${state.codexThreadId || 'not started'}
session persistence: disabled\n`);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
