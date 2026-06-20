export type SandboxMode = 'read-only' | 'workspace-write';

export interface CliState {
  cwd: string;
  model: string;
  sandbox: SandboxMode;
  codexThreadId?: string;
}
