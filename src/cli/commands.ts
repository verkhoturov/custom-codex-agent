import { createAgentProfiles } from '../agents/profiles.js';
import type { AppServerClient } from '../app-server/client.js';
import { resumeThread } from '../app-server/session.js';
import { DEFAULT_REASONING_EFFORT } from '../config.js';
import {
  type CliState,
  isAgentMode,
  isReasoningEffort,
  isSandboxMode,
  MULTI_AGENT_ROLES,
  type ReasoningEffort,
} from '../types.js';
import { printStatus, printWelcome } from './session-output.js';
import type { Terminal } from './terminal.js';

export type CommandResult = 'continue' | 'exit' | 'logout';

export interface CommandContext {
  client: AppServerClient;
  state: CliState;
  terminal: Terminal;
}

interface CliCommand {
  description: string;
  execute(context: CommandContext, args: string[]): CommandResult | Promise<CommandResult>;
  names: readonly [string, ...string[]];
  usage: string;
}

const COMMANDS: CliCommand[] = [
  {
    description: 'Show commands',
    execute: showHelp,
    names: ['/help'],
    usage: '/help',
  },
  {
    description: 'Start a new conversation in the current agent mode',
    execute: startNewThread,
    names: ['/new'],
    usage: '/new',
  },
  {
    description: 'Resume a saved thread in the current agent mode',
    execute: resumeSavedThread,
    names: ['/resume'],
    usage: '/resume <thread-id>',
  },
  {
    description: 'Show current configuration',
    execute: showStatus,
    names: ['/status'],
    usage: '/status',
  },
  {
    description: 'Show or switch multi/single agent mode',
    execute: changeAgentMode,
    names: ['/mode'],
    usage: '/mode [multi|single]',
  },
  {
    description: 'Show the active agent configuration',
    execute: showAgents,
    names: ['/agents', '/workflow'],
    usage: '/agents',
  },
  {
    description: 'Show or change the primary agent model and effort',
    execute: changeModel,
    names: ['/model'],
    usage: '/model [model] [effort]',
  },
  {
    description: 'Show or set read-only/workspace-write',
    execute: changePermissions,
    names: ['/permissions'],
    usage: '/permissions [mode]',
  },
  {
    description: 'Clear the screen and start a new thread',
    execute: clearConversation,
    names: ['/clear'],
    usage: '/clear',
  },
  {
    description: 'Log out of Codex and exit the CLI',
    execute: logout,
    names: ['/logout'],
    usage: '/logout',
  },
  {
    description: 'Exit the CLI',
    execute: () => 'exit',
    names: ['/exit', '/quit'],
    usage: '/exit',
  },
];

const COMMAND_BY_NAME = new Map(
  COMMANDS.flatMap(command => command.names.map(name => [name, command])),
);

export async function handleCommand(
  input: string,
  context: CommandContext,
): Promise<CommandResult> {
  const [name, ...args] = input.trim().split(/\s+/);
  const command = name ? COMMAND_BY_NAME.get(name) : undefined;
  if (!command) {
    context.terminal.write(`Unknown command: ${name || input}. Run /help.\n`);
    return 'continue';
  }
  return command.execute(context, args);
}

export function commandHelp(): string {
  const usageWidth = Math.max(...COMMANDS.map(command => command.usage.length)) + 2;
  return COMMANDS.map(command => `${command.usage.padEnd(usageWidth)}${command.description}`).join(
    '\n',
  );
}

function showHelp({ terminal }: CommandContext): CommandResult {
  terminal.write(`${commandHelp()}\n`);
  return 'continue';
}

function startNewThread({ state, terminal }: CommandContext): CommandResult {
  resetConversation(state);
  terminal.write(`Started a new ${state.agentMode}-agent conversation.\n`);
  return 'continue';
}

async function resumeSavedThread(
  { client, state, terminal }: CommandContext,
  args: string[],
): Promise<CommandResult> {
  const threadId = args.join(' ').trim();
  if (!threadId) {
    terminal.write(
      `Usage: /resume <thread-id>${state.conversation.threadId ? `\nCurrent: ${state.conversation.threadId}` : ''}\n`,
    );
    return 'continue';
  }
  const profiles = createAgentProfiles(state);
  const profile = state.agentMode === 'single' ? profiles.agent : profiles.coordinator;
  const resumedThreadId = await resumeThread(client, threadId, {
    approvalPolicy: state.approvalPolicy,
    cwd: state.cwd,
    developerInstructions: profile.developerInstructions,
    ephemeral: profile.ephemeral,
    model: profile.model,
    reasoningEffort: profile.reasoningEffort,
    sandbox: profile.sandbox,
  });
  resetConversation(state);
  state.conversation.threadId = resumedThreadId;
  const suffix = state.agentMode === 'multi' ? ' Worker threads will start fresh.' : '';
  terminal.write(`Resumed ${state.agentMode}-agent thread ${resumedThreadId}.${suffix}\n`);
  return 'continue';
}

function showStatus({ state, terminal }: CommandContext): CommandResult {
  printStatus(terminal, state);
  return 'continue';
}

function changeAgentMode({ state, terminal }: CommandContext, args: string[]): CommandResult {
  if (args.length === 0) {
    terminal.write(`Agent mode: ${state.agentMode}\n`);
    return 'continue';
  }
  const mode = args.join(' ').trim();
  if (!isAgentMode(mode)) {
    terminal.write('Usage: /mode <multi|single>\n');
    return 'continue';
  }
  if (mode === state.agentMode) {
    terminal.write(`Agent mode is already ${mode}.\n`);
    return 'continue';
  }
  state.agentMode = mode;
  resetConversation(state);
  terminal.write(`Agent mode changed to ${mode}. Started a new conversation.\n`);
  return 'continue';
}

function showAgents({ state, terminal }: CommandContext): CommandResult {
  const profiles = createAgentProfiles(state);
  terminal.write(`Agent mode: ${state.agentMode}\n`);
  if (state.agentMode === 'single') {
    const profile = profiles.agent;
    terminal.write(
      `agent: ${profile.model} (${profile.reasoningEffort}), sandbox=${profile.sandbox}, thread=${state.conversation.threadId || 'not started'}, delegation=disabled\n`,
    );
    return 'continue';
  }
  for (const role of MULTI_AGENT_ROLES) {
    const profile = profiles[role];
    const threadId = role === 'coordinator' ? state.conversation.threadId : undefined;
    terminal.write(
      `${role}: ${profile.model} (${describeEffort(state, role, profile.reasoningEffort)}), sandbox=${profile.sandbox}, thread=${threadId || (profile.ephemeral ? 'ephemeral' : 'not started')}\n`,
    );
  }
  if (state.conversation.lastRoute) {
    const agents = state.conversation.lastRoute.agents;
    terminal.write(
      `Last route: ${agents.length > 0 ? agents.join(', ') : 'coordinator'}; complexity=${state.conversation.lastRoute.complexity}\n`,
    );
  }
  return 'continue';
}

function changeModel({ state, terminal }: CommandContext, args: string[]): CommandResult {
  if (args.length === 0) {
    if (state.agentMode === 'single') {
      terminal.write(
        `Agent: ${state.model} (reasoning: ${state.reasoningEffortOverride || DEFAULT_REASONING_EFFORT})\n`,
      );
      return 'continue';
    }
    terminal.write(
      `Implementer: ${state.model} (reasoning: ${state.reasoningEffortOverride || 'dynamic by complexity'})\n`,
    );
    return 'continue';
  }
  const settings = parseModelSettings(args);
  if (!settings) {
    terminal.write('Usage: /model <model> [none|minimal|low|medium|high|xhigh]\n');
    return 'continue';
  }
  state.model = settings.model;
  state.reasoningEffortOverride = settings.effort;
  resetConversation(state);
  const label = state.agentMode === 'single' ? 'Agent' : 'Implementer';
  terminal.write(
    `${label} changed to ${state.model} (${describePrimaryEffort(state)}). Started a new conversation.\n`,
  );
  return 'continue';
}

function changePermissions({ state, terminal }: CommandContext, args: string[]): CommandResult {
  const mode = args.join(' ').trim();
  if (!mode) {
    terminal.write(`Sandbox: ${state.sandbox}; approvals: ${state.approvalPolicy}\n`);
    return 'continue';
  }
  if (!isSandboxMode(mode)) {
    terminal.write('Usage: /permissions <read-only|workspace-write>\n');
    return 'continue';
  }
  state.sandbox = mode;
  resetConversation(state);
  const label = state.agentMode === 'single' ? 'Agent' : 'Implementer';
  terminal.write(`${label} sandbox changed to ${mode}. Started a new conversation.\n`);
  return 'continue';
}

function clearConversation({ state, terminal }: CommandContext): CommandResult {
  terminal.clear();
  resetConversation(state);
  printWelcome(terminal, state);
  return 'continue';
}

async function logout({ terminal }: CommandContext, args: string[]): Promise<CommandResult> {
  if (args.length > 0) {
    terminal.write('Usage: /logout\n');
    return 'continue';
  }

  const answer = (await terminal.question('Log out of Codex and exit? [y/N] '))
    .trim()
    .toLowerCase();
  if (answer !== 'y' && answer !== 'yes') {
    terminal.write('Logout cancelled.\n');
    return 'continue';
  }

  terminal.write('Closing the session before logout...\n');
  return 'logout';
}

function resetConversation(state: CliState): void {
  state.conversation = { usageByRole: {} };
}

function describeEffort(
  state: CliState,
  role: (typeof MULTI_AGENT_ROLES)[number],
  configured: ReasoningEffort,
): string {
  if (role === 'analyzer') {
    return `dynamic by complexity, normal=${configured}`;
  }
  if (role === 'implementer' && !state.reasoningEffortOverride) {
    return `dynamic by complexity, normal=${configured}`;
  }
  return role === 'implementer' ? `${configured}, fixed override` : configured;
}

function describePrimaryEffort(state: CliState): string {
  if (state.reasoningEffortOverride) {
    return `${state.reasoningEffortOverride}, fixed reasoning`;
  }
  return state.agentMode === 'single'
    ? `${DEFAULT_REASONING_EFFORT} reasoning`
    : 'dynamic reasoning';
}

interface ModelSettings {
  effort?: ReasoningEffort;
  model: string;
}

function parseModelSettings(args: string[]): ModelSettings | undefined {
  const [model, effort] = args;
  if (!model || args.length > 2) {
    return undefined;
  }
  let parsedEffort: ReasoningEffort | undefined;
  if (effort) {
    if (!isReasoningEffort(effort)) {
      return undefined;
    }
    parsedEffort = effort;
  }
  return { effort: parsedEffort, model };
}
