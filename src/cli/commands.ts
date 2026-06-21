import { createAgentProfiles } from '../agents/profiles.js';
import type { AppServerClient } from '../app-server/client.js';
import { resumeThread } from '../app-server/session.js';
import {
  AGENT_ROLES,
  type CliState,
  isReasoningEffort,
  isSandboxMode,
  type ReasoningEffort,
} from '../types.js';
import { printStatus, printWelcome } from './session-output.js';
import type { Terminal } from './terminal.js';

export type CommandResult = 'continue' | 'exit';

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
    description: 'Start a new multi-agent workflow',
    execute: startNewThread,
    names: ['/new'],
    usage: '/new',
  },
  {
    description: 'Resume a saved coordinator thread',
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
    description: 'Show multi-agent workflow and role profiles',
    execute: showAgents,
    names: ['/agents', '/workflow'],
    usage: '/agents',
  },
  {
    description: 'Show or change implementer model and effort override',
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
  resetWorkflow(state);
  terminal.write('Started a new multi-agent conversation.\n');
  return 'continue';
}

async function resumeSavedThread(
  { client, state, terminal }: CommandContext,
  args: string[],
): Promise<CommandResult> {
  const threadId = args.join(' ').trim();
  if (!threadId) {
    terminal.write(
      `Usage: /resume <thread-id>${state.workflow.coordinatorThreadId ? `\nCurrent: ${state.workflow.coordinatorThreadId}` : ''}\n`,
    );
    return 'continue';
  }
  const coordinator = createAgentProfiles(state).coordinator;
  const coordinatorThreadId = await resumeThread(client, threadId, {
    approvalPolicy: state.approvalPolicy,
    cwd: state.cwd,
    developerInstructions: coordinator.developerInstructions,
    ephemeral: coordinator.ephemeral,
    model: coordinator.model,
    reasoningEffort: coordinator.reasoningEffort,
    sandbox: coordinator.sandbox,
  });
  resetWorkflow(state);
  state.workflow.coordinatorThreadId = coordinatorThreadId;
  terminal.write(
    `Resumed coordinator thread ${state.workflow.coordinatorThreadId}. Worker threads will start fresh.\n`,
  );
  return 'continue';
}

function showStatus({ state, terminal }: CommandContext): CommandResult {
  printStatus(terminal, state);
  return 'continue';
}

function showAgents({ state, terminal }: CommandContext): CommandResult {
  const profiles = createAgentProfiles(state);
  terminal.write('Workflow: always enabled\n');
  for (const role of AGENT_ROLES) {
    const profile = profiles[role];
    const threadId = role === 'coordinator' ? state.workflow.coordinatorThreadId : undefined;
    terminal.write(
      `${role}: ${profile.model} (${describeEffort(state, role, profile.reasoningEffort)}), sandbox=${profile.sandbox}, thread=${threadId || (profile.ephemeral ? 'ephemeral' : 'not started')}\n`,
    );
  }
  if (state.workflow.lastRoute) {
    const agents = state.workflow.lastRoute.agents;
    terminal.write(
      `Last route: ${agents.length > 0 ? agents.join(', ') : 'coordinator'}; complexity=${state.workflow.lastRoute.complexity}\n`,
    );
  }
  return 'continue';
}

function changeModel({ state, terminal }: CommandContext, args: string[]): CommandResult {
  if (args.length === 0) {
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
  resetWorkflow(state);
  terminal.write(
    `Implementer changed to ${state.model} (${state.reasoningEffortOverride || 'dynamic reasoning'}). Started a new conversation.\n`,
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
  resetWorkflow(state);
  terminal.write(`Implementer sandbox changed to ${mode}. Started a new conversation.\n`);
  return 'continue';
}

function clearConversation({ state, terminal }: CommandContext): CommandResult {
  terminal.clear();
  resetWorkflow(state);
  printWelcome(terminal, state);
  return 'continue';
}

function resetWorkflow(state: CliState): void {
  state.workflow = { usageByRole: {} };
}

function describeEffort(
  state: CliState,
  role: (typeof AGENT_ROLES)[number],
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
