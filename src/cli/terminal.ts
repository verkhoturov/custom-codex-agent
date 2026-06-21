import { createInterface, type Interface } from 'node:readline/promises';
import { Writable } from 'node:stream';

class TerminalOutput extends Writable {
  muted = false;

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (this.muted) {
      callback();
      return;
    }

    process.stdout.write(chunk, callback);
  }
}

export interface Terminal {
  readonly isTTY: boolean;
  clear(): void;
  close(): void;
  onInterrupt(handler: () => void): () => void;
  question(prompt: string): Promise<string>;
  questionSecret(prompt: string): Promise<string>;
  write(value: string): void;
  writeError(value: string): void;
}

export class NodeTerminal implements Terminal {
  private closed = false;
  private readonly interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  private readonly output = new TerminalOutput();
  private readonly readline: Interface;

  constructor() {
    this.readline = createInterface({
      input: process.stdin,
      output: this.output,
      terminal: this.interactive,
    });
  }

  get isTTY(): boolean {
    return Boolean(process.stdout.isTTY);
  }

  clear(): void {
    console.clear();
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.readline.close();
  }

  onInterrupt(handler: () => void): () => void {
    this.readline.on('SIGINT', handler);
    return () => this.readline.off('SIGINT', handler);
  }

  question(prompt: string): Promise<string> {
    return this.readline.question(prompt);
  }

  async questionSecret(prompt: string): Promise<string> {
    if (!this.interactive) {
      return this.readline.question(prompt);
    }

    this.write(prompt);
    this.output.muted = true;

    try {
      return await this.readline.question('');
    } finally {
      this.output.muted = false;
      this.write('\n');
    }
  }

  write(value: string): void {
    process.stdout.write(value);
  }

  writeError(value: string): void {
    process.stderr.write(value);
  }
}
