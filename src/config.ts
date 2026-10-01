import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FormpilotConfig } from "./types.js";

const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "*.test", "*.localhost"];

export function loadConfig(): FormpilotConfig {
  const path = process.env.FORMPILOT_CONFIG ?? resolve(process.cwd(), "formpilot.config.json");
  let userConfig: Partial<FormpilotConfig> = {};
  if (existsSync(path)) {
    userConfig = JSON.parse(readFileSync(path, "utf-8"));
  }
  return {
    allowedHosts: [...DEFAULT_ALLOWED_HOSTS, ...(userConfig.allowedHosts ?? [])],
    profiles: userConfig.profiles ?? {},
    headless: userConfig.headless ?? false,
  };
}

function hostMatches(hostname: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".test"
    return hostname === pattern.slice(2) || hostname.endsWith(suffix);
  }
  return hostname === pattern;
}

export function assertHostAllowed(url: string, config: FormpilotConfig): void {
  const hostname = new URL(url).hostname;
  const allowed = config.allowedHosts.some((pattern) => hostMatches(hostname, pattern));
  if (!allowed) {
    throw new Error(
      `Refusing to run against host "${hostname}": not in allowedHosts. ` +
        `Add it to formpilot.config.json (allowedHosts) to permit this run. ` +
        `Currently allowed: ${config.allowedHosts.join(", ")}`
    );
  }
}
