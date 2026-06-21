import type { TokenUsageBreakdown } from './app-server/protocol.js';

export const SANDBOX_MODES = ['read-only', 'workspace-write'] as const;
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export type SandboxMode = (typeof SANDBOX_MODES)[number];
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const AGENT_ROLES = ['coordinator', 'analyzer', 'implementer'] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];
export type TaskComplexity = 'simple' | 'normal' | 'complex' | 'critical';

export interface AgentProfile {
  developerInstructions: string;
  ephemeral: boolean;
  model: string;
  reasoningEffort: ReasoningEffort;
  role: AgentRole;
  sandbox: SandboxMode;
}

export interface RoutingDecision {
  agents: Array<'analyzer' | 'implementer'>;
  complexity: TaskComplexity;
  normalizedTask: string;
  rationale: string;
}

export interface WorkflowState {
  coordinatorThreadId?: string;
  lastRoute?: RoutingDecision;
  usageByRole: Partial<Record<AgentRole, TokenUsageBreakdown>>;
}

export function isSandboxMode(value: string): value is SandboxMode {
  return SANDBOX_MODES.some(mode => mode === value);
}

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return REASONING_EFFORTS.some(effort => effort === value);
}

export interface CliState {
  approvalPolicy: 'never' | 'on-request' | 'untrusted';
  codexHome: string;
  cwd: string;
  model: string;
  reasoningEffortOverride?: ReasoningEffort;
  sandbox: SandboxMode;
  workflow: WorkflowState;
}
