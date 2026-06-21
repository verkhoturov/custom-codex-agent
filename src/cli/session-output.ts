import { createAgentProfiles } from '../agents/profiles.js';
import type { TokenUsageBreakdown } from '../app-server/protocol.js';
import { APP_SERVER_CLIENT_INFO } from '../config.js';
import { AGENT_ROLES, type CliState } from '../types.js';
import type { Terminal } from './terminal.js';

const numberFormat = new Intl.NumberFormat('en-US');

export function printWelcome(terminal: Terminal, state: CliState): void {
  terminal.write(`
----------------------------------------------------------------------------------

${APP_SERVER_CLIENT_INFO.title} (${APP_SERVER_CLIENT_INFO.version})

${configurationSummary(state)}
Run /help for commands. Ctrl+C cancels the current request or exits while idle.

----------------------------------------------------------------------------------\n`);
}

export function printStatus(terminal: Terminal, state: CliState): void {
  const threadLabel = state.agentMode === 'single' ? 'Agent thread' : 'Coordinator thread';
  terminal.write(
    `${configurationSummary(state)}\n${threadLabel}: ${state.conversation.threadId || 'not started'}\n`,
  );
}

export function printSessionSummary(terminal: Terminal, state: CliState): void {
  const usageByRole = state.conversation.usageByRole;
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

  if (state.conversation.threadId) {
    const cwd = shellQuote(state.cwd);
    const threadId = shellQuote(state.conversation.threadId);
    const model = shellQuote(state.model);
    const effort = state.reasoningEffortOverride
      ? ` --reasoning-effort ${state.reasoningEffortOverride}`
      : '';
    terminal.write(
      `To continue this ${state.agentMode}-agent session, run command "npm run resume -- ${threadId} --agent-mode ${state.agentMode} --model ${model}${effort} --sandbox ${state.sandbox} -C ${cwd}"\n`,
    );
  }
}

function configurationSummary(state: CliState): string {
  const profiles = createAgentProfiles(state);
  const lines = [`cwd: ${state.cwd}`, `agent mode: ${state.agentMode}`];
  if (state.agentMode === 'single') {
    lines.push(
      `agent: ${profiles.agent.model} (${profiles.agent.reasoningEffort})`,
      `agent sandbox: ${state.sandbox}`,
      'subagent delegation: disabled',
    );
  } else {
    lines.push(
      `coordinator: ${profiles.coordinator.model} (${profiles.coordinator.reasoningEffort})`,
      `analyzer: ${profiles.analyzer.model} (dynamic, normal=${profiles.analyzer.reasoningEffort})`,
      `implementer: ${profiles.implementer.model} (${state.reasoningEffortOverride ? `${state.reasoningEffortOverride}, fixed` : `dynamic, normal=${profiles.implementer.reasoningEffort}`})`,
      `implementer sandbox: ${state.sandbox}`,
    );
  }
  lines.push(`approvals: ${state.approvalPolicy}`);
  return lines.join('\n');
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
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
