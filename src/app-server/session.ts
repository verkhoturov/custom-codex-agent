import type { ReasoningEffort, SandboxMode } from '../types.js';
import type { AppServerClient } from './client.js';
import type { ThreadResumeResponse, ThreadStartResponse, TurnStartResponse } from './protocol.js';

export interface ThreadSettings {
  approvalPolicy: 'never' | 'on-request' | 'untrusted';
  cwd: string;
  developerInstructions: string;
  ephemeral: boolean;
  model: string;
  reasoningEffort: ReasoningEffort;
  sandbox: SandboxMode;
}

export interface TurnSettings {
  approvalPolicy: ThreadSettings['approvalPolicy'];
  cwd: string;
  effort: ReasoningEffort;
  input: string;
  model: string;
  outputSchema?: Record<string, unknown>;
  threadId: string;
}

export async function startThread(
  client: AppServerClient,
  settings: ThreadSettings,
): Promise<string> {
  const response = await client.request<ThreadStartResponse>('thread/start', {
    approvalPolicy: settings.approvalPolicy,
    config: { model_reasoning_effort: settings.reasoningEffort },
    cwd: settings.cwd,
    developerInstructions: settings.developerInstructions,
    ephemeral: settings.ephemeral,
    model: settings.model,
    sandbox: settings.sandbox,
  });
  return response.thread.id;
}

export async function resumeThread(
  client: AppServerClient,
  threadId: string,
  settings: ThreadSettings,
): Promise<string> {
  const response = await client.request<ThreadResumeResponse>('thread/resume', {
    approvalPolicy: settings.approvalPolicy,
    config: { model_reasoning_effort: settings.reasoningEffort },
    cwd: settings.cwd,
    developerInstructions: settings.developerInstructions,
    model: settings.model,
    sandbox: settings.sandbox,
    threadId,
  });
  return response.thread.id;
}

export async function startTurn(client: AppServerClient, settings: TurnSettings): Promise<string> {
  const response = await client.request<TurnStartResponse>('turn/start', {
    approvalPolicy: settings.approvalPolicy,
    cwd: settings.cwd,
    effort: settings.effort,
    input: [{ text: settings.input, text_elements: [], type: 'text' }],
    model: settings.model,
    ...(settings.outputSchema ? { outputSchema: settings.outputSchema } : {}),
    summary: 'auto',
    threadId: settings.threadId,
  });
  return response.turn.id;
}

export async function interruptTurn(
  client: AppServerClient,
  threadId: string,
  turnId: string,
): Promise<void> {
  await client.request('turn/interrupt', { threadId, turnId });
}
