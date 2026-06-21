import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DEFAULT_AGENT_MODE,
  DEFAULT_APPROVAL_POLICY,
  DEFAULT_CODEX_HOME,
  DEFAULT_MODEL,
  DEFAULT_SANDBOX,
} from '../config.js';
import {
  type AgentMode,
  type CliState,
  isAgentMode,
  isReasoningEffort,
  isSandboxMode,
  type ReasoningEffort,
  type SandboxMode,
} from '../types.js';

const REASONING_EFFORT_HELP = 'none, minimal, low, medium, high, or xhigh';

export interface ParsedArgs {
  forceLogin: boolean;
  help: boolean;
  resumeThreadId?: string;
  state: CliState;
}

export function parseArgs(args: string[]): ParsedArgs {
  let agentMode: AgentMode = DEFAULT_AGENT_MODE;
  let cwd = process.cwd();
  let model = DEFAULT_MODEL;
  let reasoningEffortOverride: ReasoningEffort | undefined;
  let resumeThreadId: string | undefined;
  let sandbox: SandboxMode = DEFAULT_SANDBOX;
  let forceLogin = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }

    if (argument === '--login') {
      forceLogin = true;
      continue;
    }

    if (argument === '--agent-mode') {
      const value = requireValue(args, ++index, argument);
      if (!isAgentMode(value)) {
        throw new Error(`Unsupported agent mode: ${value}. Use multi or single.`);
      }
      agentMode = value;
      continue;
    }

    if (argument === '--cwd' || argument === '-C') {
      cwd = requireValue(args, ++index, argument);
      continue;
    }

    if (argument === '--model' || argument === '-m' || argument === '--codex-model') {
      model = requireValue(args, ++index, argument);
      continue;
    }

    if (
      argument === '--reasoning-effort' ||
      argument === '-r' ||
      argument === '--codex-reasoning-effort'
    ) {
      const value = requireValue(args, ++index, argument);
      if (!isReasoningEffort(value)) {
        throw new Error(`Unsupported reasoning effort: ${value}. Use ${REASONING_EFFORT_HELP}.`);
      }
      reasoningEffortOverride = value;
      continue;
    }

    if (argument === '--resume') {
      resumeThreadId = requireValue(args, ++index, argument);
      continue;
    }

    if (argument === '--sandbox' || argument === '-s') {
      const value = requireValue(args, ++index, argument);
      if (!isSandboxMode(value)) {
        throw new Error(`Unsupported sandbox mode: ${value}. Use read-only or workspace-write.`);
      }
      sandbox = value;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  cwd = resolve(cwd);
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw new Error(`Working directory does not exist: ${cwd}`);
  }

  return {
    forceLogin,
    help,
    resumeThreadId,
    state: {
      agentMode,
      approvalPolicy: DEFAULT_APPROVAL_POLICY,
      codexHome: DEFAULT_CODEX_HOME,
      conversation: { usageByRole: {} },
      cwd,
      model,
      reasoningEffortOverride,
      sandbox,
    },
  };
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}
