import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CODEX_HOME = join(
  fileURLToPath(new URL('..', import.meta.url)),
  '.codex-data',
);

export function ensureCodexHome(codexHome: string): void {
  mkdirSync(codexHome, { mode: 0o700, recursive: true });

  const configPath = join(codexHome, 'config.toml');
  const setting = 'forced_login_method = "api"';

  if (!existsSync(configPath)) {
    writeFileSync(configPath, `${setting}\n`, { mode: 0o600 });

    return;
  }

  const config = readFileSync(configPath, 'utf8');
  const firstTableIndex = config.search(/^[ \t]*\[\[?/m);
  const topLevelEnd = firstTableIndex === -1 ? config.length : firstTableIndex;
  const topLevel = config.slice(0, topLevelEnd);
  const existingSetting = /^[ \t]*forced_login_method[ \t]*=.*$/m;

  let updated: string;

  if (existingSetting.test(topLevel)) {
    updated = topLevel.replace(existingSetting, setting) + config.slice(topLevelEnd);
  } else {
    const lineEnding = config.includes('\r\n') ? '\r\n' : '\n';
    updated = config ? `${setting}${lineEnding}${lineEnding}${config}` : `${setting}${lineEnding}`;
  }

  if (updated !== config) {
    writeFileSync(configPath, updated);
  }
}
