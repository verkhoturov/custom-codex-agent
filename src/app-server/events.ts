import type {
  FileChange,
  RpcNotification,
  ThreadItem,
  ThreadTokenUsage,
  TokenUsageBreakdown,
  TurnCompletedParams,
} from './protocol.js';

interface EventScope {
  threadId?: string;
  turnId?: string;
}

export type AppServerEvent =
  | (EventScope & { type: 'agentMessageDelta'; delta: string })
  | (EventScope & { type: 'commandOutputDelta'; delta: string })
  | (EventScope & { type: 'error'; message: string })
  | (EventScope & { type: 'filePatch'; changes: FileChange[] })
  | (EventScope & { type: 'itemCompleted'; item: ThreadItem })
  | (EventScope & { type: 'itemStarted'; item: ThreadItem })
  | (EventScope & { type: 'protocolError'; message: string })
  | (EventScope & { type: 'reasoningDelta'; delta: string })
  | (EventScope & { type: 'tokenUsage'; tokenUsage: ThreadTokenUsage })
  | (EventScope & { type: 'turnCompleted'; completion: TurnCompletedParams })
  | (EventScope & { type: 'warning'; message: string });

export type RenderableAppServerEvent = Exclude<
  AppServerEvent,
  { type: 'protocolError' | 'tokenUsage' | 'turnCompleted' }
>;

export function decodeAppServerEvent(notification: RpcNotification): AppServerEvent | undefined {
  const params = asRecord(notification.params);
  const scope = eventScope(params);

  switch (notification.method) {
    case 'thread/tokenUsage/updated': {
      const tokenUsage = decodeTokenUsage(params.tokenUsage);
      return tokenUsage ? { ...scope, tokenUsage, type: 'tokenUsage' } : undefined;
    }
    case 'turn/completed': {
      const completion = decodeTurnCompleted(params);
      return completion
        ? {
            ...scope,
            completion,
            turnId: scope.turnId || completion.turn.id,
            type: 'turnCompleted',
          }
        : { ...scope, message: 'Invalid turn/completed payload', type: 'protocolError' };
    }
    case 'item/reasoning/summaryTextDelta':
      return { ...scope, delta: stringValue(params.delta), type: 'reasoningDelta' };
    case 'item/agentMessage/delta':
      return { ...scope, delta: stringValue(params.delta), type: 'agentMessageDelta' };
    case 'item/commandExecution/outputDelta':
      return { ...scope, delta: stringValue(params.delta), type: 'commandOutputDelta' };
    case 'item/fileChange/patchUpdated':
      return {
        ...scope,
        changes: decodeFileChanges(params.changes),
        type: 'filePatch',
      };
    case 'item/started': {
      const item = decodeThreadItem(params.item);
      return item ? { ...scope, item, type: 'itemStarted' } : undefined;
    }
    case 'item/completed': {
      const item = decodeThreadItem(params.item);
      return item ? { ...scope, item, type: 'itemCompleted' } : undefined;
    }
    case 'error': {
      const error = asRecord(params.error);
      return {
        ...scope,
        message: stringValue(error.message) || 'Codex turn failed',
        type: 'error',
      };
    }
    case 'warning':
    case 'configWarning':
      return { ...scope, message: stringValue(params.message) || 'Codex warning', type: 'warning' };
    default:
      return undefined;
  }
}

function decodeTurnCompleted(params: Record<string, unknown>): TurnCompletedParams | undefined {
  const turn = asRecord(params.turn);
  const id = stringValue(turn.id);
  const status = stringValue(turn.status);
  if (!id || !isTurnStatus(status)) {
    return undefined;
  }

  const error = asRecord(turn.error);
  const items = Array.isArray(turn.items)
    ? turn.items.map(decodeThreadItem).filter((item): item is ThreadItem => item !== undefined)
    : undefined;

  return {
    threadId: stringValue(params.threadId),
    turn: {
      durationMs: numberOrNull(turn.durationMs),
      error: turn.error ? { message: stringValue(error.message) || undefined } : null,
      id,
      ...(items ? { items } : {}),
      status,
    },
  };
}

function decodeThreadItem(value: unknown): ThreadItem | undefined {
  const item = asRecord(value);
  const type = stringValue(item.type);
  if (!type) {
    return undefined;
  }
  return {
    agentPath: stringValue(item.agentPath) || undefined,
    agentsStates: decodeAgentStates(item.agentsStates),
    agentThreadId: stringValue(item.agentThreadId) || undefined,
    aggregatedOutput: nullableString(item.aggregatedOutput),
    changes: decodeFileChanges(item.changes),
    command: stringValue(item.command) || undefined,
    durationMs: numberOrNull(item.durationMs),
    error: item.error,
    exitCode: numberOrNull(item.exitCode),
    id: stringValue(item.id),
    kind: stringValue(item.kind) || undefined,
    model: nullableString(item.model),
    prompt: nullableString(item.prompt),
    query: stringValue(item.query) || undefined,
    reasoningEffort: nullableString(item.reasoningEffort),
    receiverThreadIds: stringArray(item.receiverThreadIds),
    senderThreadId: stringValue(item.senderThreadId) || undefined,
    server: stringValue(item.server) || undefined,
    status: stringValue(item.status) || undefined,
    text: stringValue(item.text) || undefined,
    tool: stringValue(item.tool) || undefined,
    type,
  };
}

function decodeAgentStates(
  value: unknown,
): Record<string, { message: string | null; status: string }> | undefined {
  const states = asRecord(value);
  const decoded = Object.fromEntries(
    Object.entries(states).flatMap(([threadId, state]) => {
      const record = asRecord(state);
      const status = stringValue(record.status);
      return status
        ? [[threadId, { message: nullableString(record.message) ?? null, status }]]
        : [];
    }),
  );
  return Object.keys(decoded).length > 0 ? decoded : undefined;
}

function decodeFileChanges(value: unknown): FileChange[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap(change => {
    const record = asRecord(change);
    const path = stringValue(record.path);
    if (!path) {
      return [];
    }
    const kind = asRecord(record.kind);
    return [
      {
        diff: stringValue(record.diff) || undefined,
        kind: stringValue(kind.type) || stringValue(record.kind) || 'update',
        path,
      },
    ];
  });
}

function decodeTokenUsage(value: unknown): ThreadTokenUsage | undefined {
  const usage = asRecord(value);
  const last = decodeTokenBreakdown(usage.last);
  const total = decodeTokenBreakdown(usage.total);
  if (!last || !total) {
    return undefined;
  }
  return {
    last,
    modelContextWindow:
      typeof usage.modelContextWindow === 'number' ? usage.modelContextWindow : null,
    total,
  };
}

function decodeTokenBreakdown(value: unknown): TokenUsageBreakdown | undefined {
  const breakdown = asRecord(value);
  const fields = [
    'cachedInputTokens',
    'inputTokens',
    'outputTokens',
    'reasoningOutputTokens',
    'totalTokens',
  ] as const;
  if (fields.some(field => typeof breakdown[field] !== 'number')) {
    return undefined;
  }
  return {
    cachedInputTokens: breakdown.cachedInputTokens as number,
    inputTokens: breakdown.inputTokens as number,
    outputTokens: breakdown.outputTokens as number,
    reasoningOutputTokens: breakdown.reasoningOutputTokens as number,
    totalTokens: breakdown.totalTokens as number,
  };
}

function eventScope(params: Record<string, unknown>): EventScope {
  const threadId = stringValue(params.threadId);
  const turnId = stringValue(params.turnId);
  return {
    ...(threadId ? { threadId } : {}),
    ...(turnId ? { turnId } : {}),
  };
}

function isTurnStatus(value: string): value is TurnCompletedParams['turn']['status'] {
  return ['completed', 'failed', 'inProgress', 'interrupted'].includes(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : stringValue(value) || undefined;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length > 0 ? strings : undefined;
}
