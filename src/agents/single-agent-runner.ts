import type { Terminal } from '../cli/terminal.js';
import type { TurnRunner } from '../cli/turn/runner.js';
import type { CliState } from '../types.js';
import { createAgentProfiles } from './profiles.js';
import { addUsage } from './usage.js';

export class SingleAgentRunner {
  constructor(
    private readonly state: CliState,
    private readonly turnRunner: TurnRunner,
    private readonly terminal: Terminal,
  ) {}

  async run(input: string): Promise<void> {
    const profile = createAgentProfiles(this.state).agent;
    this.terminal.write(`[agent] ${profile.model} (${profile.reasoningEffort})\n`);
    const result = await this.turnRunner.run({
      input,
      label: 'agent',
      outputMode: 'full',
      profile,
      threadId: this.state.conversation.threadId,
    });
    this.state.conversation.threadId = result.threadId;
    addUsage(this.state, profile.role, result.tokenUsage?.last);
  }
}
