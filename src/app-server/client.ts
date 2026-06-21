import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';

import { ensureCodexHome } from '../utils/codex-home.js';
import {
  type GetAccountResponse,
  isRpcNotification,
  isRpcRequest,
  isRpcResponse,
  type LoginAccountResponse,
  type NotificationHandler,
  type RequestId,
  type RpcMessage,
  type RpcRequest,
  type ServerRequestHandler,
} from './protocol.js';

interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
}

export interface AppServerClient {
  hasApiKeyAuthentication(): Promise<boolean>;
  loginWithApiKey(apiKey: string): Promise<void>;
  onExit(handler: (error: Error) => void): () => void;
  onNotification(handler: NotificationHandler): () => void;
  request<TResult>(method: string, params?: unknown): Promise<TResult>;
  setServerRequestHandler(handler: ServerRequestHandler): void;
}

export interface CodexAppServerClientOptions {
  codexHome: string;
  cwd: string;
}

export class CodexAppServerClient implements AppServerClient {
  private child?: ChildProcessWithoutNullStreams;
  private exitError?: Error;
  private readonly exitHandlers = new Set<(error: Error) => void>();
  private nextRequestId = 1;
  private readonly notificationHandlers = new Set<NotificationHandler>();
  private readonly pendingRequests = new Map<RequestId, PendingRequest>();
  private requestHandler?: ServerRequestHandler;
  private stdout?: Interface;

  constructor(private readonly options: CodexAppServerClientOptions) {}

  async connect(): Promise<void> {
    if (this.child) {
      return;
    }

    ensureCodexHome(this.options.codexHome);

    this.exitError = undefined;

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      CODEX_HOME: this.options.codexHome,
    };
    delete childEnv.CODEX_ACCESS_TOKEN;
    delete childEnv.OPENAI_API_KEY;

    const child = spawn('codex', ['app-server', '-c', 'cli_auth_credentials_store="file"'], {
      cwd: this.options.cwd,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child = child;
    this.stdout = createInterface({ input: child.stdout });
    this.stdout.on('line', line => this.handleLine(line));
    child.stderr.on('data', chunk => {
      if (process.env.DEBUG_APP_SERVER === '1') {
        process.stderr.write(`[app-server] ${String(chunk)}`);
      }
    });
    child.once('error', error => this.handleExit(error));
    child.once('exit', (code, signal) => {
      this.handleExit(
        new Error(`codex app-server exited (code=${String(code)}, signal=${String(signal)})`),
      );
    });

    await this.request('initialize', {
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
      clientInfo: {
        name: 'custom_codex_agent',
        title: 'Custom Codex Agent',
        version: '1.0.0',
      },
    });
    this.notify('initialized');
  }

  async hasApiKeyAuthentication(): Promise<boolean> {
    const account = await this.request<GetAccountResponse>('account/read', {
      refreshToken: false,
    });

    if (!account.account) {
      return false;
    }

    if (account.account.type !== 'apiKey') {
      throw new Error(
        `Codex app-server selected unsupported authentication: ${account.account.type}`,
      );
    }

    return true;
  }

  async loginWithApiKey(apiKey: string): Promise<void> {
    const login = await this.request<LoginAccountResponse>('account/login/start', {
      apiKey,
      type: 'apiKey',
    });
    if (login.type !== 'apiKey') {
      throw new Error(`Codex app-server selected unsupported authentication: ${login.type}`);
    }

    if (!(await this.hasApiKeyAuthentication())) {
      throw new Error('Codex app-server did not activate API key authentication');
    }
  }

  setServerRequestHandler(handler: ServerRequestHandler): void {
    this.requestHandler = handler;
  }

  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  onExit(handler: (error: Error) => void): () => void {
    if (this.exitError) {
      const error = this.exitError;
      queueMicrotask(() => handler(error));
      return () => undefined;
    }
    this.exitHandlers.add(handler);
    return () => this.exitHandlers.delete(handler);
  }

  request<TResult>(method: string, params?: unknown): Promise<TResult> {
    const id = this.nextRequestId++;
    return new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(id, {
        reject,
        resolve: value => resolve(value as TResult),
      });
      try {
        this.write({ id, method, ...(params === undefined ? {} : { params }) });
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  notify(method: string, params?: unknown): void {
    this.write({ method, ...(params === undefined ? {} : { params }) });
  }

  async close(): Promise<void> {
    const child = this.child;
    if (!child) {
      return;
    }

    this.child = undefined;
    this.stdout?.close();
    this.stdout = undefined;
    child.stdin.end();

    if (child.exitCode === null && child.signalCode === null) {
      await waitForExit(child, 1_000);
    }
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await waitForExit(child, 1_000);
    }
  }

  private write(message: RpcMessage): void {
    if (!this.child?.stdin.writable) {
      throw new Error('codex app-server is not connected');
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      if (process.env.DEBUG_APP_SERVER === '1') {
        process.stderr.write(`[app-server invalid JSON] ${line}\n`);
      }
      return;
    }

    if (isRpcResponse(message)) {
      const pending = this.pendingRequests.get(message.id);
      if (!pending) {
        return;
      }
      this.pendingRequests.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (isRpcRequest(message)) {
      void this.handleServerRequest(message);
      return;
    }

    if (isRpcNotification(message)) {
      for (const handler of this.notificationHandlers) {
        handler(message);
      }
    }
  }

  private async handleServerRequest(request: RpcRequest): Promise<void> {
    if (!this.requestHandler) {
      this.write({
        error: { code: -32601, message: `Unsupported server request: ${request.method}` },
        id: request.id,
      });
      return;
    }

    try {
      const result = await this.requestHandler(request);
      this.write({ id: request.id, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.write({ error: { code: -32000, message }, id: request.id });
    }
  }

  private handleExit(error: Error): void {
    if (this.exitError) {
      return;
    }
    this.exitError = error;
    this.child = undefined;
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
    const exitHandlers = [...this.exitHandlers];
    this.exitHandlers.clear();
    for (const handler of exitHandlers) {
      handler(error);
    }
  }
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>(resolve => {
    const timeout = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
