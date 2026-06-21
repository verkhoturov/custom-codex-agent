import type { TokenUsageBreakdown } from '../app-server/protocol.js';
import type { AgentRole, CliState } from '../types.js';

export function addUsage(
  state: CliState,
  role: AgentRole,
  usage: TokenUsageBreakdown | undefined,
): void {
  if (!usage) {
    return;
  }
  const current = state.conversation.usageByRole[role];
  state.conversation.usageByRole[role] = {
    cachedInputTokens: (current?.cachedInputTokens || 0) + usage.cachedInputTokens,
    inputTokens: (current?.inputTokens || 0) + usage.inputTokens,
    outputTokens: (current?.outputTokens || 0) + usage.outputTokens,
    reasoningOutputTokens: (current?.reasoningOutputTokens || 0) + usage.reasoningOutputTokens,
    totalTokens: (current?.totalTokens || 0) + usage.totalTokens,
  };
}
