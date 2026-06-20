export const SANDBOX_MODES = ['read-only', 'workspace-write'] as const;

export type SandboxMode = (typeof SANDBOX_MODES)[number];

export function isSandboxMode(value: string): value is SandboxMode {
  return SANDBOX_MODES.some((mode) => mode === value);
}

export interface CliState {
  cwd: string;
  model: string;
  sandbox: SandboxMode;
  codexThreadId?: string;
}
