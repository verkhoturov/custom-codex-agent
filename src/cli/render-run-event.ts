import type { RunStreamEvent } from '@openai/agents';

import type { CliState } from '../types.js';
import { captureThreadId, toolName } from './common.js';

type OpenLine = 'answer' | 'reasoning';

export interface RunOutputState {
  beforeWrite?: () => void;
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
  if (event.type === 'raw_model_stream_event') {
    renderRawEvent(event.data, output);
    return;
  }

  if (event.type !== 'run_item_stream_event') {
    return;
  }

  captureThreadId(event.item, cliState);

  if (event.name === 'tool_called') {
    const name = toolName(event.item);
    if (isInternalCodexTool(name)) {
      return;
    }

    closeOpenLine(output);
    write(output, `[action] ${name}\n`);
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

function isInternalCodexTool(name: string): boolean {
  return name === 'codex' || name === 'codex-reply';
}
