import type { ModelSettings } from '@openai/agents';

export const SANDBOX_MODES = ['read-only', 'workspace-write'] as const;
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export type SandboxMode = (typeof SANDBOX_MODES)[number];
export type ReasoningEffort = NonNullable<NonNullable<ModelSettings['reasoning']>['effort']>;

export function isSandboxMode(value: string): value is SandboxMode {
  return SANDBOX_MODES.some(mode => mode === value);
}

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return REASONING_EFFORTS.some(effort => effort === value);
}

export interface CliState {
  cwd: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  sandbox: SandboxMode;
  codexThreadId?: string;
}
