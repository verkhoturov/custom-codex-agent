import type { RunStreamEvent } from '@openai/agents';

import type { CliState } from '../types.js';
import { captureThreadId, toolName } from './common.js';

type OpenLine = 'answer' | 'reasoning';

export interface RunOutputState {
  beforeWrite?: () => void;
  currentTool?: string;
  openLine?: OpenLine;
  streamedText: boolean;
}

export function createRunOutputState(beforeWrite?: () => void): RunOutputState {
  return { beforeWrite, streamedText: false };
}

export function renderRunEvent(
  event: RunStreamEvent,
  output: RunOutputState,
  cliState: CliState,
): void {
  if (process.env.DEBUG_AGENT_EVENTS === '1') {
    closeOpenLine(output);
    // process.stdout.write(`[event data]\n${safeStringify(event)}\n`);
  }

  if (event.type === 'raw_model_stream_event') {
    renderRawEvent(event.data, output);
    return;
  }

  if (event.type !== 'run_item_stream_event') {
    return;
  }

  captureThreadId(event.item, cliState);

  if (event.name === 'tool_called') {
    closeOpenLine(output);
    output.currentTool = toolName(event.item);
    write(output, `[action] ${output.currentTool}\n`);
    return;
  }

  if (event.name === 'tool_output') {
    closeOpenLine(output);
    const thread = cliState.codexThreadId ? `, thread ${cliState.codexThreadId}` : '';
    write(output, `[action completed] ${output.currentTool || 'tool'}${thread}\n`);
    output.currentTool = undefined;
  }
}

export function finishRunOutput(output: RunOutputState): void {
  closeOpenLine(output);
}

function renderRawEvent(data: unknown, output: RunOutputState): void {
  const rawEvent = data as { type?: string; delta?: string };

  if (rawEvent.type === 'response.reasoning_summary_text.delta' && rawEvent.delta) {
    openLine(output, 'reasoning', '[reasoning] ');
    write(output, rawEvent.delta);
    return;
  }

  if (rawEvent.type === 'response.reasoning_summary_text.done') {
    closeLine(output, 'reasoning');
    return;
  }

  if (rawEvent.type === 'response.output_text.delta' && rawEvent.delta) {
    openLine(output, 'answer', 'agent> ');
    write(output, rawEvent.delta);
    output.streamedText = true;
    return;
  }

  if (rawEvent.type === 'response.output_text.done') {
    closeLine(output, 'answer');
  }
}

function openLine(output: RunOutputState, line: OpenLine, prefix: string): void {
  if (output.openLine === line) {
    return;
  }

  closeOpenLine(output);
  write(output, prefix);
  output.openLine = line;
}

function closeLine(output: RunOutputState, line: OpenLine): void {
  if (output.openLine === line) {
    closeOpenLine(output);
  }
}

function closeOpenLine(output: RunOutputState): void {
  if (output.openLine) {
    write(output, '\n');
    output.openLine = undefined;
  }
}

function write(output: RunOutputState, value: string): void {
  output.beforeWrite?.();
  process.stdout.write(value);
}
