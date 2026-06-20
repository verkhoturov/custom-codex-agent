import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

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

export function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }
}

export function parseArgs(args: string[]): ParsedArgs {
  let cwd = process.cwd();
  let model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  let reasoningEffort = parseReasoningEffort(process.env.OPENAI_REASONING_EFFORT);
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

    if (argument === '--model' || argument === '-m') {
      model = requireValue(args, ++index, argument);
      continue;
    }

    if (argument === '--reasoning-effort' || argument === '-r') {
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

  return { help, state: { cwd, model, reasoningEffort, sandbox } };
}

export function usage(): string {
  return `Usage: custom-codex-agent [options]

Options:
  -C, --cwd <path>        Working directory (default: current directory)
  -m, --model <model>     Model for Agents SDK and Codex (default: gpt-5.5)
  -r, --reasoning-effort  none, minimal, low, medium, high, or xhigh
  -s, --sandbox <mode>    read-only or workspace-write
  -h, --help              Show this help

Run /help inside the CLI to list interactive commands.`;
}

const REASONING_EFFORT_HELP = 'none, minimal, low, medium, high, or xhigh';

function parseReasoningEffort(value: string | undefined): ReasoningEffort | undefined {
  if (!value) {
    return undefined;
  }
  if (!isReasoningEffort(value)) {
    throw new Error(`Unsupported OPENAI_REASONING_EFFORT: ${value}. Use ${REASONING_EFFORT_HELP}.`);
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
