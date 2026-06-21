import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DEFAULT_APPROVAL_POLICY,
  DEFAULT_CODEX_HOME,
  DEFAULT_MODEL,
  DEFAULT_SANDBOX,
} from '../config.js';
import {
  type CliState,
  isReasoningEffort,
  isSandboxMode,
  type ReasoningEffort,
  type SandboxMode,
} from '../types.js';

const REASONING_EFFORT_HELP = 'none, minimal, low, medium, high, or xhigh';

export interface ParsedArgs {
  help: boolean;
  resumeThreadId?: string;
  state: CliState;
}

export function parseArgs(args: string[]): ParsedArgs {
  let cwd = process.cwd();
  let model = DEFAULT_MODEL;
  let reasoningEffortOverride: ReasoningEffort | undefined;
  let resumeThreadId: string | undefined;
  let sandbox: SandboxMode = DEFAULT_SANDBOX;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--help' || argument === '-h') {
      help = true;
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
    help,
    resumeThreadId,
    state: {
      approvalPolicy: DEFAULT_APPROVAL_POLICY,
      codexHome: DEFAULT_CODEX_HOME,
      cwd,
      model,
      reasoningEffortOverride,
      sandbox,
      workflow: { usageByRole: {} },
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
