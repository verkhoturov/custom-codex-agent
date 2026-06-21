import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CliState, ReasoningEffort, SandboxMode } from './types.js';

export const DEFAULT_CODEX_HOME = join(
  fileURLToPath(new URL('..', import.meta.url)),
  '.codex-data',
);

export const DEFAULT_MODEL = 'gpt-5.5';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'medium';
export const DEFAULT_SUPPORT_MODEL = 'gpt-5.4-mini';
export const DEFAULT_LIGHT_REASONING_EFFORT: ReasoningEffort = 'low';
export const DEFAULT_ANALYZER_REASONING_EFFORT: ReasoningEffort = 'medium';
export const DEFAULT_SANDBOX: SandboxMode = 'workspace-write';
export const DEFAULT_APPROVAL_POLICY: CliState['approvalPolicy'] = 'on-request';

export function usage(): string {
  return `Usage: custom-codex-agent [options]

Options:
  -C, --cwd <path>        Working directory (default: current directory)
  -m, --model <model>     Implementer model (default: ${DEFAULT_MODEL})
  -r, --reasoning-effort <effort>  Override dynamic implementer effort
  -s, --sandbox <mode>    Implementer sandbox: read-only or workspace-write
  -h, --help              Show this help

Run /help inside the CLI to list interactive commands.`;
}
