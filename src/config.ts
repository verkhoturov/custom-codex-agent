import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { DEFAULT_CODEX_HOME } from './codex-home.js';
import {
  type CliState,
  isReasoningEffort,
  isSandboxMode,
  type ReasoningEffort,
  type SandboxMode,
} from './types.js';

export interface ParsedArgs {
  help: boolean;
  state: CliState;
}

const DEFAULT_MODEL = 'gpt-5.5';
const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'xhigh';

export function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }
}

export function parseArgs(args: string[]): ParsedArgs {
  const codexHome = DEFAULT_CODEX_HOME;
  let cwd = process.cwd();
  let model = process.env.CODEX_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  let reasoningEffort = parseReasoningEffort(
    process.env.CODEX_REASONING_EFFORT || process.env.OPENAI_REASONING_EFFORT,
    'CODEX_REASONING_EFFORT',
    DEFAULT_REASONING_EFFORT,
  );
  let sandbox: SandboxMode = 'workspace-write';
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
      approvalPolicy: 'on-request',
      codexHome,
      cwd,
      model,
      reasoningEffort,
      sandbox,
    },
  };
}

export function requireOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required. ChatGPT account authentication is not supported.');
  }
  return apiKey;
}

export function usage(): string {
  return `Usage: custom-codex-agent [options]

Options:
  -C, --cwd <path>        Working directory (default: current directory)
  -m, --model <model>     Codex model (default: gpt-5.5)
  -r, --reasoning-effort <effort>  Codex effort (default: xhigh)
  -s, --sandbox <mode>    read-only or workspace-write
  -h, --help              Show this help

Run /help inside the CLI to list interactive commands.`;
}

const REASONING_EFFORT_HELP = 'none, minimal, low, medium, high, or xhigh';

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
