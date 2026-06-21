import { createAgentProfiles } from '../agents/profiles.js';
import type { TokenUsageBreakdown } from '../app-server/protocol.js';
import { AGENT_ROLES, type AgentRole, type CliState } from '../types.js';
import type { Terminal } from './terminal.js';

const numberFormat = new Intl.NumberFormat('en-US');

export function printWelcome(terminal: Terminal, state: CliState): void {
  const profiles = createAgentProfiles(state);
  terminal.write(`Custom Codex Agent
cwd: ${state.cwd}
coordinator: ${profiles.coordinator.model} (${profiles.coordinator.reasoningEffort})
analyzer: ${profiles.analyzer.model} (dynamic, normal=${profiles.analyzer.reasoningEffort})
implementer: ${profiles.implementer.model} (${state.reasoningEffortOverride ? `${state.reasoningEffortOverride}, fixed` : `dynamic, normal=${profiles.implementer.reasoningEffort}`})
implementer sandbox: ${state.sandbox}
approvals: ${state.approvalPolicy}
Run /help for commands. Ctrl+C cancels the workflow or exits while idle.\n`);
}

export function printStatus(terminal: Terminal, state: CliState): void {
  const profiles = createAgentProfiles(state);
  terminal.write(`cwd: ${state.cwd}
coordinator: ${profiles.coordinator.model} (${profiles.coordinator.reasoningEffort})
analyzer: ${profiles.analyzer.model} (dynamic, normal=${profiles.analyzer.reasoningEffort})
implementer: ${profiles.implementer.model} (${state.reasoningEffortOverride ? `${state.reasoningEffortOverride}, fixed` : `dynamic, normal=${profiles.implementer.reasoningEffort}`})
implementer sandbox: ${state.sandbox}
approvals: ${state.approvalPolicy}
Coordinator thread: ${state.workflow.coordinatorThreadId || 'not started'}\n`);
}

export function printSessionSummary(
  terminal: Terminal,
  usageByRole: Partial<Record<AgentRole, TokenUsageBreakdown>>,
  threadId: string | undefined,
): void {
  const total = sumUsage(Object.values(usageByRole));
  terminal.write(
    `\nToken usage: total=${formatNumber(total.totalTokens)} input=${formatNumber(total.inputTokens)}${total.cachedInputTokens ? ` (+ ${formatNumber(total.cachedInputTokens)} cached)` : ''} output=${formatNumber(total.outputTokens)}\n`,
  );

  for (const role of AGENT_ROLES) {
    const usage = usageByRole[role];
    if (usage) {
      terminal.write(
        `  ${role}: total=${formatNumber(usage.totalTokens)} input=${formatNumber(usage.inputTokens)} output=${formatNumber(usage.outputTokens)}\n`,
      );
    }
  }

  if (threadId) {
    terminal.write(
      `To continue the coordinator session, run npm run codex -- resume ${threadId}\n`,
    );
  }
}

function sumUsage(usages: Array<TokenUsageBreakdown | undefined>): TokenUsageBreakdown {
  return usages.reduce<TokenUsageBreakdown>(
    (total, usage) => ({
      cachedInputTokens: total.cachedInputTokens + (usage?.cachedInputTokens || 0),
      inputTokens: total.inputTokens + (usage?.inputTokens || 0),
      outputTokens: total.outputTokens + (usage?.outputTokens || 0),
      reasoningOutputTokens: total.reasoningOutputTokens + (usage?.reasoningOutputTokens || 0),
      totalTokens: total.totalTokens + (usage?.totalTokens || 0),
    }),
    {
      cachedInputTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    },
  );
}

function formatNumber(value: number): string {
  return numberFormat.format(value);
}
