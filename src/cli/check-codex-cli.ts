import { spawnSync } from "node:child_process";

export function checkCodexCli(): string {
  const version = spawnSync("codex", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (version.error || version.status !== 0) {
    throw new Error(
      "Codex CLI is not available. Install it and make sure `codex` is in PATH.",
    );
  }

  const login = spawnSync("codex", ["login", "status"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (login.error || login.status !== 0) {
    throw new Error("Codex CLI is not authenticated. Run `codex login` first.");
  }

  return version.stdout.trim();
}
