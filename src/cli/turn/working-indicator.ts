import type { Terminal } from '../terminal.js';

const CLEAR_LINE = '\r\u001b[2K';

export class WorkingIndicator {
  private interval?: ReturnType<typeof setInterval>;
  private readonly startedAt = Date.now();
  private visible = false;

  constructor(
    private readonly terminal: Terminal,
    private readonly label = 'working',
  ) {}

  start(): void {
    if (!this.terminal.isTTY || this.interval) {
      return;
    }

    this.show();
    this.interval = setInterval(() => this.render(), 1_000);
  }

  show(): void {
    if (!this.terminal.isTTY || this.visible) {
      return;
    }

    this.visible = true;
    this.render();
  }

  hide(): void {
    if (!this.visible || !this.terminal.isTTY) {
      return;
    }

    this.terminal.write(CLEAR_LINE);
    this.visible = false;
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.hide();
  }

  private render(): void {
    if (!this.visible) {
      return;
    }

    const elapsedSeconds = Math.floor((Date.now() - this.startedAt) / 1_000);
    this.terminal.write(
      `${CLEAR_LINE}[${this.label}] working (${elapsedSeconds}s, Ctrl+C to interrupt)`,
    );
  }
}
