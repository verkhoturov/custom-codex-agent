import type { CliState } from '../types.js';

export function printWelcome(state: CliState): void {
  process.stdout.write(`Custom Codex Agent
cwd: ${state.cwd}
model: ${state.model} (${state.reasoningEffort})
authentication: API key only
sandbox: ${state.sandbox}
approvals: ${state.approvalPolicy}
Run /help for commands. Ctrl+C cancels a turn or exits while idle.\n`);
}

export function printStatus(state: CliState): void {
  process.stdout.write(`cwd: ${state.cwd}
model: ${state.model} (${state.reasoningEffort})
sandbox: ${state.sandbox}
approvals: ${state.approvalPolicy}
Codex thread: ${state.threadId || 'not started'}\n`);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
