import type { Terminal } from '../cli/terminal.js';
import type { TurnRunner } from '../cli/turn/runner.js';
import type { CliState } from '../types.js';
import { SingleAgentRunner } from './single-agent-runner.js';
import { WorkflowRunner } from './workflow-runner.js';

export class AgentRunner {
  private readonly singleAgentRunner: SingleAgentRunner;
  private readonly workflowRunner: WorkflowRunner;

  constructor(
    private readonly state: CliState,
    private readonly turnRunner: TurnRunner,
    terminal: Terminal,
  ) {
    this.singleAgentRunner = new SingleAgentRunner(state, turnRunner, terminal);
    this.workflowRunner = new WorkflowRunner(state, turnRunner, terminal);
  }

  get workingIndicator() {
    return this.turnRunner.workingIndicator;
  }

  interrupt(): boolean {
    return this.turnRunner.interrupt();
  }

  async run(input: string): Promise<void> {
    if (this.state.agentMode === 'single') {
      await this.singleAgentRunner.run(input);
      return;
    }
    await this.workflowRunner.run(input);
  }
}
