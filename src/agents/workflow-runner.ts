import type { Terminal } from '../cli/terminal.js';
import type { TurnRunner, TurnRunResult } from '../cli/turn/runner.js';
import type {
  AgentProfile,
  CliState,
  ReasoningEffort,
  RoutingDecision,
  TaskComplexity,
} from '../types.js';
import { createAgentProfiles } from './profiles.js';
import { addUsage } from './usage.js';

const ROUTING_SCHEMA: Record<string, unknown> = {
  additionalProperties: false,
  properties: {
    agents: {
      items: { enum: ['analyzer', 'implementer'], type: 'string' },
      type: 'array',
    },
    complexity: { enum: ['simple', 'normal', 'complex', 'critical'], type: 'string' },
    normalizedTask: { type: 'string' },
    rationale: { type: 'string' },
  },
  required: ['agents', 'complexity', 'normalizedTask', 'rationale'],
  type: 'object',
};

export class WorkflowRunner {
  private active = false;

  constructor(
    private readonly state: CliState,
    private readonly turnRunner: TurnRunner,
    private readonly terminal: Terminal,
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  get workingIndicator() {
    return this.turnRunner.workingIndicator;
  }

  interrupt(): boolean {
    return this.turnRunner.interrupt();
  }

  async run(input: string): Promise<void> {
    if (this.active) {
      throw new Error('A multi-agent workflow is already running');
    }

    this.active = true;
    const profiles = createAgentProfiles(this.state);

    try {
      const routingResult = await this.runStage(
        profiles.coordinator,
        createRoutingPrompt(input),
        'silent',
        this.state.conversation.threadId,
        ROUTING_SCHEMA,
        'coordinator:route',
      );
      this.state.conversation.threadId = routingResult.threadId;
      const route = decodeRoutingDecision(routingResult.finalText);
      this.state.conversation.lastRoute = route;
      this.terminal.write(
        `[coordinator:route] selected: ${route.agents.length > 0 ? route.agents.join(', ') : 'coordinator only'}; complexity=${route.complexity}\n`,
      );

      const routedEffort = COMPLEXITY_EFFORTS[route.complexity];

      let analysis = '';
      if (route.agents.includes('analyzer')) {
        const result = await this.runStage(
          { ...profiles.analyzer, reasoningEffort: routedEffort },
          createAnalyzerPrompt(input, route),
          'activity',
        );
        analysis = result.finalText;
      }

      let implementation = '';
      if (route.agents.includes('implementer')) {
        const result = await this.runStage(
          {
            ...profiles.implementer,
            reasoningEffort: this.state.reasoningEffortOverride || routedEffort,
          },
          createImplementerPrompt(input, route, analysis),
          'activity',
        );
        implementation = result.finalText;
      }

      const coordinatorResult = await this.runStage(
        profiles.coordinator,
        createCoordinatorPrompt(input, route, analysis, implementation),
        'full',
        this.state.conversation.threadId,
        undefined,
        'coordinator:final',
      );
      this.state.conversation.threadId = coordinatorResult.threadId;
    } finally {
      this.active = false;
    }
  }

  private async runStage(
    profile: AgentProfile,
    input: string,
    outputMode: 'activity' | 'full' | 'silent',
    threadId?: string,
    outputSchema?: Record<string, unknown>,
    label: string = profile.role,
  ): Promise<TurnRunResult> {
    this.terminal.write(`[${label}] ${profile.model} (${profile.reasoningEffort})\n`);
    const result = await this.turnRunner.run({
      input,
      label,
      outputMode,
      outputSchema,
      profile,
      threadId,
    });
    addUsage(this.state, profile.role, result.tokenUsage?.last);
    if (outputMode !== 'full') {
      this.terminal.write(`[${label}] completed\n`);
    }
    return result;
  }
}

function createRoutingPrompt(input: string): string {
  return `<workflow_phase>routing</workflow_phase>
Select the worker agents needed for the current user request. Analyzer means inspecting the current repository; use no workers for self-contained questions that you can answer directly in the final phase.

Current user request:
<user_request>
${input}
</user_request>`;
}

function createAnalyzerPrompt(input: string, route: RoutingDecision): string {
  return `Analyze the repository for the normalized task below. Return findings for the implementer or coordinator.

Original user request:
<user_request>
${input}
</user_request>

Normalized task:
<normalized_task>
${route.normalizedTask}
</normalized_task>`;
}

function createImplementerPrompt(input: string, route: RoutingDecision, analysis: string): string {
  return `Implement the normalized task in the current repository.

Original user request:
<user_request>
${input}
</user_request>

Normalized task:
<normalized_task>
${route.normalizedTask}
</normalized_task>

Read-only analyzer report:
<analyzer_report>
${truncate(analysis || '(not requested)', 40_000)}
</analyzer_report>`;
}

function createCoordinatorPrompt(
  input: string,
  route: RoutingDecision,
  analysis: string,
  implementation: string,
): string {
  return `<workflow_phase>final</workflow_phase>
Produce the final response to the user from this workflow result.

Original user request:
<user_request>
${input}
</user_request>

Routing decision:
${JSON.stringify(route)}

Analyzer report:
<analyzer_report>
${truncate(analysis || '(not requested)', 40_000)}
</analyzer_report>

Implementer report:
<implementer_report>
${truncate(implementation || '(not requested)', 40_000)}
</implementer_report>`;
}

function decodeRoutingDecision(value: string): RoutingDecision {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('coordinator routing phase returned invalid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('coordinator routing phase returned an invalid routing decision');
  }

  const record = parsed as Record<string, unknown>;
  const agents = record.agents;
  const complexity = record.complexity;
  const normalizedTask = record.normalizedTask;
  const rationale = record.rationale;
  if (
    !Array.isArray(agents) ||
    agents.some(agent => agent !== 'analyzer' && agent !== 'implementer') ||
    new Set(agents).size !== agents.length ||
    !isTaskComplexity(complexity) ||
    typeof normalizedTask !== 'string' ||
    !normalizedTask.trim() ||
    typeof rationale !== 'string' ||
    !rationale.trim()
  ) {
    throw new Error('coordinator routing phase returned an invalid routing decision');
  }

  return {
    agents: agents as RoutingDecision['agents'],
    complexity,
    normalizedTask: normalizedTask.trim(),
    rationale: rationale.trim(),
  };
}

const COMPLEXITY_EFFORTS: Record<TaskComplexity, ReasoningEffort> = {
  simple: 'low',
  normal: 'medium',
  complex: 'high',
  critical: 'xhigh',
};

function isTaskComplexity(value: unknown): value is TaskComplexity {
  return value === 'simple' || value === 'normal' || value === 'complex' || value === 'critical';
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n[truncated]`;
}
