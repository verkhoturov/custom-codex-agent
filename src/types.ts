import type { TokenUsageBreakdown } from './app-server/protocol.js';

export const SANDBOX_MODES = ['read-only', 'workspace-write'] as const;
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
export const AGENT_MODES = ['multi', 'single'] as const;

export type SandboxMode = (typeof SANDBOX_MODES)[number];
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export type AgentMode = (typeof AGENT_MODES)[number];

export const AGENT_ROLES = ['agent', 'coordinator', 'analyzer', 'implementer'] as const;
export const MULTI_AGENT_ROLES = ['coordinator', 'analyzer', 'implementer'] as const;

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

export interface ConversationState {
  lastRoute?: RoutingDecision;
  threadId?: string;
  usageByRole: Partial<Record<AgentRole, TokenUsageBreakdown>>;
}

export function isAgentMode(value: string): value is AgentMode {
  return AGENT_MODES.some(mode => mode === value);
}

export function isSandboxMode(value: string): value is SandboxMode {
  return SANDBOX_MODES.some(mode => mode === value);
}

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return REASONING_EFFORTS.some(effort => effort === value);
}

export interface CliState {
  agentMode: AgentMode;
  approvalPolicy: 'never' | 'on-request' | 'untrusted';
  codexHome: string;
  conversation: ConversationState;
  cwd: string;
  model: string;
  reasoningEffortOverride?: ReasoningEffort;
  sandbox: SandboxMode;
}
