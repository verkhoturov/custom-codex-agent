import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DEFAULT_APPROVAL_POLICY,
  DEFAULT_CODEX_HOME,
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
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
  state: CliState;
}

export function parseArgs(args: string[]): ParsedArgs {
  let cwd = process.cwd();
  let model = process.env.CODEX_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  let reasoningEffort = parseReasoningEffort(
    process.env.CODEX_REASONING_EFFORT || process.env.OPENAI_REASONING_EFFORT,
    'CODEX_REASONING_EFFORT',
    DEFAULT_REASONING_EFFORT,
  );
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
      reasoningEffort = value;
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
    state: {
      approvalPolicy: DEFAULT_APPROVAL_POLICY,
      codexHome: DEFAULT_CODEX_HOME,
      cwd,
      model,
      reasoningEffort,
      sandbox,
    },
  };
}

function parseReasoningEffort(
  value: string | undefined,
  source: string,
  fallback: ReasoningEffort,
): ReasoningEffort {
  if (!value) {
    return fallback;
  }

  if (!isReasoningEffort(value)) {
    throw new Error(`Unsupported ${source}: ${value}. Use ${REASONING_EFFORT_HELP}.`);
  }

  return value;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}
