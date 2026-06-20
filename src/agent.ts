import { Agent, MCPServerStdio } from '@openai/agents';

import type { CliState } from './types.js';

export function createCodexMcpClient(state: CliState): MCPServerStdio {
  return new MCPServerStdio({
    name: 'Codex CLI',
    command: 'codex',
    args: ['mcp-server'],
    cwd: state.cwd,
    cacheToolsList: true,
    clientSessionTimeoutSeconds: 3600,
    timeout: 3_600_000,
    useStructuredContent: true,
    toolFilter: {
      allowedToolNames: ['codex', 'codex-reply'],
    },
    customDataExtractor(context) {
      const threadId = context.structuredContent?.threadId;
      if (typeof threadId !== 'string') {
        return undefined;
      }

      state.codexThreadId = threadId;
      return { codexThreadId: threadId };
    },
  });
}

export function createCodingAgent(state: CliState, codexMcpServer: MCPServerStdio): Agent {
  const threadInstruction = state.codexThreadId
    ? `Continue Codex thread ${state.codexThreadId} with codex-reply.`
    : 'Start a Codex thread with the codex tool.';

  return new Agent({
    name: 'Custom Codex Agent',
    model: state.model,
    modelSettings: {
      reasoning: {
        summary: 'auto',
      },
    },
    instructions: `You are an expert software engineering agent focused on analyzing and writing code.

Delegate repository inspection, code analysis, file changes, and command execution to the Codex MCP tools. Do not claim that you inspected or changed the workspace unless Codex did it. ${threadInstruction}

When starting a thread, call codex with:
- cwd: ${JSON.stringify(state.cwd)}
- model: ${JSON.stringify(state.model)}
- sandbox: ${JSON.stringify(state.sandbox)}
- approval-policy: "never"
- include-plan-tool: true

When a Codex thread already exists, use codex-reply with its threadId and the new request. Give the user a concise final response based on Codex's result. Do not expose orchestration details unless they are relevant to an error.`,
    mcpServers: [codexMcpServer],
  });
}
