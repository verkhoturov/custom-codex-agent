import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AgentMode, CliState, ReasoningEffort, SandboxMode } from './types.js';

export const APP_SERVER_CLIENT_INFO = {
  name: 'custom_codex_agent',
  title: 'Custom Codex Agent',
  version: '1.0.0',
} as const;

export const DEFAULT_CODEX_HOME = join(
  fileURLToPath(new URL('..', import.meta.url)),
  '.codex-data',
);

export const DEFAULT_MODEL = 'gpt-5.5';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'medium';
export const DEFAULT_SUPPORT_MODEL = 'gpt-5.4-mini';
export const DEFAULT_LIGHT_REASONING_EFFORT: ReasoningEffort = 'low';
export const DEFAULT_ANALYZER_REASONING_EFFORT: ReasoningEffort = 'medium';
export const DEFAULT_AGENT_MODE: AgentMode = 'multi';
export const DEFAULT_SANDBOX: SandboxMode = 'workspace-write';
export const DEFAULT_APPROVAL_POLICY: CliState['approvalPolicy'] = 'on-request';

export function usage(): string {
  return `Usage: custom-codex-agent [options]

Options:
  -C, --cwd <path>        Working directory (default: current directory)
  --agent-mode <mode>     Agent mode: multi or single (default: ${DEFAULT_AGENT_MODE})
  --login                 Choose and replace saved Codex authentication
  -m, --model <model>     Primary agent model (default: ${DEFAULT_MODEL})
  -r, --reasoning-effort <effort>  Primary agent effort override
  --resume <thread-id>    Resume a thread in the selected agent mode
  -s, --sandbox <mode>    Primary agent sandbox: read-only or workspace-write
  -h, --help              Show this help

Run /help inside the CLI to list interactive commands.`;
}
