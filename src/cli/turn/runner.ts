import type { AppServerClient } from '../../app-server/client.js';
import { type AppServerEvent, decodeAppServerEvent } from '../../app-server/events.js';
import type { ThreadTokenUsage, TurnCompletedParams } from '../../app-server/protocol.js';
import { interruptTurn, startThread, startTurn } from '../../app-server/session.js';
import type { AgentProfile, CliState } from '../../types.js';
import type { Terminal } from '../terminal.js';
import {
  createAppServerOutputState,
  finishAppServerOutput,
  renderAppServerEvent,
} from './event-renderer.js';
import { WorkingIndicator } from './working-indicator.js';

export type TurnOutputMode = 'activity' | 'full' | 'silent';

export interface TurnRunRequest {
  input: string;
  label?: string;
  outputMode: TurnOutputMode;
  outputSchema?: Record<string, unknown>;
  profile: AgentProfile;
  threadId?: string;
}

export interface TurnRunResult {
  finalText: string;
  threadId: string;
  tokenUsage?: ThreadTokenUsage;
}

interface ActiveTurn {
  interruptRequested: boolean;
  interruptSent: boolean;
  threadId?: string;
  turnId?: string;
  workingIndicator: WorkingIndicator;
}

export class TurnRunner {
  private activeTurn?: ActiveTurn;

  constructor(
    private readonly state: CliState,
    private readonly client: AppServerClient,
    private readonly terminal: Terminal,
  ) {}

  get isActive(): boolean {
    return this.activeTurn !== undefined;
  }

  get workingIndicator(): WorkingIndicator | undefined {
    return this.activeTurn?.workingIndicator;
  }

  interrupt(): boolean {
    const activeTurn = this.activeTurn;
    if (!activeTurn) {
      return false;
    }
    if (activeTurn.interruptRequested) {
      return true;
    }

    activeTurn.interruptRequested = true;
    activeTurn.workingIndicator.hide();
    this.terminal.write('\n[interrupting current request]\n');
    if (activeTurn.turnId && activeTurn.threadId) {
      activeTurn.interruptSent = true;
      void interruptTurn(this.client, activeTurn.threadId, activeTurn.turnId).catch(error => {
        activeTurn.interruptSent = false;
        const message = error instanceof Error ? error.message : String(error);
        this.terminal.writeError(`Interrupt failed: ${message}\n`);
      });
    }
    return true;
  }

  async run(request: TurnRunRequest): Promise<TurnRunResult> {
    if (this.activeTurn) {
      throw new Error('A Codex turn is already running');
    }

    const workingIndicator = new WorkingIndicator(
      this.terminal,
      request.label || request.profile.role,
    );
    const activeTurn: ActiveTurn = {
      interruptRequested: false,
      interruptSent: false,
      workingIndicator,
    };
    const output = createAppServerOutputState(this.terminal, () => workingIndicator.hide());
    const bufferedEvents: AppServerEvent[] = [];
    let streamedText = '';
    let tokenUsage: ThreadTokenUsage | undefined;

    this.activeTurn = activeTurn;
    workingIndicator.start();

    let resolveCompletion: (params: TurnCompletedParams) => void = () => undefined;
    let rejectCompletion: (error: Error) => void = () => undefined;
    const completion = new Promise<TurnCompletedParams>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    let rejectDisconnected: (error: Error) => void = () => undefined;
    const disconnected = new Promise<never>((_resolve, reject) => {
      rejectDisconnected = reject;
    });

    const handleEvent = (event: AppServerEvent): void => {
      if (!activeTurn.turnId) {
        bufferedEvents.push(event);
        return;
      }
      if (!belongsToActiveTurn(event, activeTurn.threadId, activeTurn.turnId)) {
        return;
      }
      if (event.type === 'agentMessageDelta') {
        streamedText += event.delta;
      }
      if (event.type === 'tokenUsage') {
        tokenUsage = event.tokenUsage;
        return;
      }
      if (event.type === 'turnCompleted') {
        resolveCompletion(event.completion);
        return;
      }
      if (event.type === 'protocolError') {
        rejectCompletion(new Error(event.message));
        return;
      }

      if (shouldRender(event, request.outputMode)) {
        renderAppServerEvent(event, output);
        if (!output.openLine) {
          workingIndicator.show();
        }
      }
    };

    const unsubscribeNotification = this.client.onNotification(notification => {
      const event = decodeAppServerEvent(notification);
      if (event) {
        handleEvent(event);
      }
    });
    const unsubscribeExit = this.client.onExit(rejectDisconnected);

    try {
      activeTurn.threadId =
        request.threadId ||
        (await Promise.race([
          startThread(this.client, {
            approvalPolicy: this.state.approvalPolicy,
            cwd: this.state.cwd,
            developerInstructions: request.profile.developerInstructions,
            ephemeral: request.profile.ephemeral,
            model: request.profile.model,
            reasoningEffort: request.profile.reasoningEffort,
            sandbox: request.profile.sandbox,
          }),
          disconnected,
        ]));

      activeTurn.turnId = await Promise.race([
        startTurn(this.client, {
          approvalPolicy: this.state.approvalPolicy,
          cwd: this.state.cwd,
          effort: request.profile.reasoningEffort,
          input: request.input,
          model: request.profile.model,
          outputSchema: request.outputSchema,
          threadId: activeTurn.threadId,
        }),
        disconnected,
      ]);
      for (const event of bufferedEvents) {
        handleEvent(event);
      }
      if (activeTurn.interruptRequested && !activeTurn.interruptSent) {
        activeTurn.interruptSent = true;
        await interruptTurn(this.client, activeTurn.threadId, activeTurn.turnId);
      }

      const completed = await Promise.race([completion, disconnected]);
      workingIndicator.hide();
      finishAppServerOutput(output);

      const finalText = findFinalAgentMessage(completed) || streamedText;
      if (request.outputMode === 'full' && !output.streamedText && finalText) {
        this.terminal.write(`agent> ${finalText}\n`);
      }
      if (completed.turn.status === 'failed') {
        throw new Error(completed.turn.error?.message || `${request.profile.role} turn failed`);
      }
      if (completed.turn.status === 'interrupted') {
        throw new Error(`${request.profile.role} turn was interrupted`);
      }
      if (!finalText) {
        throw new Error(`${request.profile.role} returned no final response`);
      }

      return { finalText, threadId: activeTurn.threadId, tokenUsage };
    } finally {
      unsubscribeNotification();
      unsubscribeExit();
      finishAppServerOutput(output);
      workingIndicator.stop();
      this.activeTurn = undefined;
    }
  }
}

function belongsToActiveTurn(
  event: AppServerEvent,
  threadId: string | undefined,
  turnId: string,
): boolean {
  return !(
    (threadId && event.threadId && event.threadId !== threadId) ||
    (event.turnId && event.turnId !== turnId)
  );
}

function shouldRender(event: AppServerEvent, mode: TurnOutputMode): boolean {
  if (mode === 'full') {
    return !['protocolError', 'tokenUsage', 'turnCompleted'].includes(event.type);
  }
  if (mode === 'activity') {
    return ![
      'agentMessageDelta',
      'protocolError',
      'reasoningDelta',
      'tokenUsage',
      'turnCompleted',
    ].includes(event.type);
  }
  return event.type === 'error' || event.type === 'warning';
}

function findFinalAgentMessage(completed: TurnCompletedParams): string {
  const messages = (completed.turn.items || []).filter(item => item.type === 'agentMessage');
  const last = messages.at(-1);
  return last?.text || '';
}
