import type { Usage } from '@openai/agents';

const numberFormat = new Intl.NumberFormat('en-US');

export function printSessionSummary(usage: Usage, codexThreadId?: string): void {
  const cachedTokens = sumCachedTokens(usage.inputTokensDetails);
  const inputTokens = Math.max(0, usage.inputTokens - cachedTokens);
  const totalTokens = inputTokens + usage.outputTokens;
  const cached = cachedTokens ? ` (+ ${formatNumber(cachedTokens)} cached)` : '';

  process.stdout.write(
    `\nToken usage: total=${formatNumber(totalTokens)} input=${formatNumber(inputTokens)}${cached} output=${formatNumber(usage.outputTokens)}\n`,
  );

  if (codexThreadId) {
    process.stdout.write(`To continue this session, run codex resume ${codexThreadId}\n`);
  }
}

function sumCachedTokens(details: Array<Record<string, number>>): number {
  return details.reduce((total, item) => total + (item.cached_tokens ?? item.cachedTokens ?? 0), 0);
}

function formatNumber(value: number): string {
  return numberFormat.format(value);
}
