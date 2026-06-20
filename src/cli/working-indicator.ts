const CLEAR_LINE = "\r\u001b[2K";

export class WorkingIndicator {
  private interval?: ReturnType<typeof setInterval>;
  private readonly startedAt = Date.now();
  private visible = false;

  start(): void {
    if (!process.stdout.isTTY || this.interval) {
      return;
    }

    this.show();
    this.interval = setInterval(() => this.render(), 1_000);
  }

  show(): void {
    if (!process.stdout.isTTY) {
      return;
    }

    this.visible = true;
    this.render();
  }

  hide(): void {
    if (!this.visible || !process.stdout.isTTY) {
      return;
    }

    process.stdout.write(CLEAR_LINE);
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
    process.stdout.write(`${CLEAR_LINE}Working (${elapsedSeconds}s, Ctrl+C to interrupt)`);
  }
}
