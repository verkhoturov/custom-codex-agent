import type { MemorySession } from '@openai/agents';

import type { CliState, SandboxMode } from '../types.js';
import { printStatus, printWelcome } from './common.js';

const COMMANDS = `/help                         Show commands
/new                          Start a new in-memory conversation
/resume <thread-id>           Continue a known Codex thread
/status                       Show current configuration
/model [model]                Show or change the active model
/permissions [mode]           Show or set read-only/workspace-write
/clear                        Clear the screen and start a new conversation
/exit                         Exit the CLI`;

export async function handleCommand(
  input: string,
  state: CliState,
  session: MemorySession,
): Promise<boolean> {
  const [command, ...argumentsList] = input.split(/\s+/);
  const argument = argumentsList.join(' ').trim();

  switch (command) {
    case '/help':
      process.stdout.write(`${COMMANDS}\n`);
      return false;

    case '/new':
      await resetConversation(state, session);
      process.stdout.write('Started a new conversation.\n');
      return false;

    case '/resume':
      if (!argument) {
        process.stdout.write(
          `Usage: /resume <thread-id>${state.codexThreadId ? `\nCurrent: ${state.codexThreadId}` : ''}\n`,
        );
        return false;
      }
      await session.clearSession();
      state.codexThreadId = argument;
      process.stdout.write(`Will resume Codex thread ${argument}.\n`);
      return false;

    case '/status':
      printStatus(state);
      return false;

    case '/model':
      if (!argument) {
        process.stdout.write(`Model: ${state.model}\n`);
        return false;
      }
      state.model = argument;
      await resetConversation(state, session);
      process.stdout.write(`Model changed to ${argument}. Started a new conversation.\n`);
      return false;

    case '/permissions':
      if (!argument) {
        process.stdout.write(`Sandbox: ${state.sandbox}\n`);
        return false;
      }
      if (!isSandboxMode(argument)) {
        process.stdout.write('Usage: /permissions <read-only|workspace-write>\n');
        return false;
      }
      state.sandbox = argument;
      await resetConversation(state, session);
      process.stdout.write(`Sandbox changed to ${argument}. Started a new conversation.\n`);
      return false;

    case '/clear':
      console.clear();
      await resetConversation(state, session);
      printWelcome(state);
      return false;

    case '/exit':
    case '/quit':
      return true;

    default:
      process.stdout.write(`Unknown command: ${command}. Run /help.\n`);
      return false;
  }
}

async function resetConversation(state: CliState, session: MemorySession): Promise<void> {
  await session.clearSession();
  state.codexThreadId = undefined;
}

function isSandboxMode(value: string): value is SandboxMode {
  return value === 'read-only' || value === 'workspace-write';
}
