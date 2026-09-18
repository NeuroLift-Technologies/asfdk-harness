#!/usr/bin/env node
/**
 * ASFDK Harness — universal runtime installer.
 *
 * Wires the ASFDK Solidarity Framework into an agent runtime with one command:
 *
 *   node scripts/install.mjs
 *
 * Default behavior:
 *   - Auto-detects installed runtimes and installs into each one found.
 *   - opencode / kilo: full automation (deps, plugin files, MCP server config).
 *   - hermes / openclaw / zed / pi: best-effort (runs the runtime's own install
 *     commands when the CLI is available, otherwise prints documented steps).
 *
 * Flags:
 *   --target <auto|opencode|kilo|hermes|openclaw|zed|pi|list>
 *   --config-dir <path>        Override the runtime config directory
 *   --repo <path>              asfdk-harness checkout root (default: this repo)
 *   --state-dir <path>         MCP working directory (default: ~/.asfdk)
 *   --tools-gate <approve|default>
 *   --dry-run                  Print the plan without changing anything
 *   --force                    Overwrite existing MCP config / plugin files
 *   --skip-build               Do not (re)build dist/ in the checkout
 *   --skip-deps                Do not run npm install in the config dir
 *   --verbose                  Print extra detail
 *
 * Requires Node 20+. No external dependencies.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const FLAGS = new Set([
  "--target", "--config-dir", "--repo", "--state-dir", "--tools-gate",
  "--dry-run", "--force", "--skip-build", "--skip-deps", "--verbose", "--help",
]);

function parseArgs(argv) {
  const opts = {
    target: "auto",
    configDir: null,
    repo: REPO_ROOT,
    stateDir: null,
    toolsGate: null,
    dryRun: false,
    force: false,
    skipBuild: false,
    skipDeps: false,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [name, inline] = arg.split("=");
    switch (name) {
      case "--target": opts.target = inline ?? argv[++i] ?? "auto"; break;
      case "--config-dir": opts.configDir = inline ?? argv[++i]; break;
      case "--repo": opts.repo = path.resolve(inline ?? argv[++i]); break;
      case "--state-dir": opts.stateDir = path.resolve(inline ?? argv[++i]); break;
      case "--tools-gate": opts.toolsGate = (inline ?? argv[++i]) === "approve" ? "approve" : "default"; break;
      case "--dry-run": opts.dryRun = true; break;
      case "--force": opts.force = true; break;
      case "--skip-build": opts.skipBuild = true; break;
      case "--skip-deps": opts.skipDeps = true; break;
      case "--verbose": opts.verbose = true; break;
      case "--help": printUsage(); process.exit(0); break;
      default:
    }
  }
  return opts;
}

function printUsage() {
  console.log(`ASFDK Harness universal installer

Usage: node scripts/install.mjs [flags]

Flags:
  --target <t>        auto (default) | opencode | kilo | hermes | openclaw | zed | pi | list
  --config-dir <p>    override the runtime config directory
  --repo <p>          asfdk-harness checkout root (default: this repo)
  --state-dir <p>     MCP working directory (default: ~/.asfdk)
  --tools-gate <g>    approve | default  — whether sensitive ASFDK tools are pre-approved
  --dry-run           print the plan without changing anything
  --force             overwrite existing MCP config / plugin files
  --skip-build        do not (re)build dist/ in the checkout
  --skip-deps         do not npm install in the config dir
  --verbose           extra detail
  --help              this message`);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const col = (n) => process.stdout.isTTY ? `\x1b[${n}m` : "";

function log(level, ...args) {
  const map = { info: "36", ok: "32", warn: "33", err: "31", dim: "90" };
  const color = map[level] ?? "";
  process.stdout.write(`${col(color)}[${level.toUpperCase()}]${col(0)} ${args.join(" ")}\n`);
}

function readJson(file, fallback = null) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}

function writeJson(file, obj) {
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

function stripJsonc(src) {
  let out = "";
  let inStr = false, esc = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; out += " "; continue; }
    if (c === ",") {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === "]" || src[j] === "}") { out += " "; i++; continue; }
    }
    out += c;
    i++;
  }
  return out;
}

function readJsonc(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(stripJsonc(readFileSync(file, "utf8"))); } catch (error) {
    return { __parseError: String(error) };
  }
}

function run(cmdString, opts = {}) {
  const res = spawnSync(cmdString, {
    cwd: opts.cwd ?? process.cwd(),
    encoding: "utf8",
    shell: true,
    env: { ...process.env, ...(opts.env ?? {}) },
    windowsHide: true,
  });
  return { ok: res.status === 0 && !res.error, status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "", error: res.error };
}

function which(bin) {
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";") : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir.trim(), bin + ext);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

function home() {
  return process.env.USERPROFILE || process.env.HOME || os.homedir();
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function backup(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${file}.bak-asfdk-${stamp}`;
  copyFileSync(file, dest);
  return dest;
}

/* ------------------------------------------------------------------ */
/* Repo preparation                                                    */
/* ------------------------------------------------------------------ */

function repoInfo(opts) {
  const dist = path.join(opts.repo, "dist", "mcp-server.js");
  const toi = path.join(opts.repo, ".toi.default");
  const otoi = path.join(opts.repo, ".otoi");
  return {
    name: readJson(path.join(opts.repo, "package.json"), { name: "asfdk-harness" }).name,
    dist,
    toi: existsSync(toi) ? toi : null,
    otoi: existsSync(otoi) ? otoi : null,
    hasDist: existsSync(dist),
    hasNodeModules: existsSync(path.join(opts.repo, "node_modules")),
  };
}

function ensureRepoBuilt(opts, info) {
  if (opts.dryRun) return true;
  if (info.hasDist && !opts.force) return true;
  if (opts.skipBuild) {
    log("warn", `dist/mcp-server.js missing or stale and --skip-build set — MCP wiring will point at a missing file.`);
    return false;
  }
  if (!info.hasNodeModules) {
    log("info", `installing repo dependencies in ${opts.repo} ...`);
    const npm = run("npm install --no-audit --no-fund", { cwd: opts.repo });
    if (!npm.ok) { log("err", `npm install failed: ${npm.stderr || npm.error?.message}`); return false; }
  }
  log("info", `building ${opts.repo} dist/ ...`);
  const build = run("npm run build", { cwd: opts.repo });
  if (!build.ok) { log("err", `npm run build failed: ${build.stderr || build.error?.message}`); return false; }
  return true;
}

/* ------------------------------------------------------------------ */
/* MCP verify                                                          */
/* ------------------------------------------------------------------ */

function verifyMcp(command, cwd, env, verbose) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd, env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"],
    });
    let buf = "";
    let done = false;
    const finish = (ok, msg) => {
      if (done) return;
      done = true;
      try { child.kill(); } catch { /* noop */ }
      resolve({ ok, msg });
    };
    const timer = setTimeout(() => finish(false, "timeout waiting for initialize"), 120000);
    child.stdout.on("data", (data) => {
      buf += data.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1 && msg.result?.serverInfo) {
            clearTimeout(timer);
            finish(true, `initialize OK — ${msg.result.serverInfo.name} v${msg.result.serverInfo.version}`);
            return;
          }
          if (msg.id === 1 && msg.error) {
            clearTimeout(timer);
            finish(false, `initialize error: ${JSON.stringify(msg.error)}`);
            return;
          }
        } catch { /* partial line */ }
      }
    });
    child.on("error", (error) => { clearTimeout(timer); finish(false, `spawn error: ${error.message}`); });
    child.stderr.on("data", (data) => { if (verbose) process.stderr.write(`    [mcp] ${data}`); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "asfdk-installer", version: "1.0.0" } } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
  });
}

function platformGuardrails(opts) {
  const notes = [];
  if (process.platform === "win32") {
    notes.push(
      "Windows Defender real-time scanning can add 20-30s cold-start latency to the MCP server.",
      "If you see slow boots, run (elevated PowerShell): Add-MpPreference -ExclusionPath \"<repo>\"",
    );
  }
  notes.push(
    "If your runtime log shows \u201cserver unavailable\u201d on the FIRST attempt only, it is a boot-timing",
    "quirk: raise mcp_timeout / timeout (this installer sets 180000) and opencode retries automatically.",
  );
  return notes;
}

/* ------------------------------------------------------------------ */
/* opencode / kilo adapter (full automation)                           */
/* ------------------------------------------------------------------ */

function opencodeConfigDir(opts) {
  if (opts.configDir) return opts.configDir;
  const envDir = process.env.OPENCODE_CONFIG_DIR;
  if (envDir) return envDir;
  if (process.platform === "darwin") return path.join(home(), "Library", "Application Support", "opencode");
  return path.join(home(), ".config", "opencode");
}

async function installOcodeFamily(opts, { label, configDir }) {
  const done = [];
  const info = repoInfo(opts);

  if (!existsSync(path.join(configDir))) {
    ensureDir(configDir);
    done.push(`created config dir ${configDir}`);
  }

  const pluginsDir = path.join(configDir, "plugins");
  ensureDir(pluginsDir);
  const pluginFiles = ["asfdk-deploy.ts", "a2a-task-watch.ts", "index.ts"];
  const srcDir = path.join(opts.repo, "opencode-plugin");
  for (const file of pluginFiles) {
    const src = path.join(srcDir, file);
    const dest = path.join(pluginsDir, file);
    if (existsSync(dest) && !opts.force) {
      log("dim", `  existing plugin ${file} kept (--force to overwrite)`);
      continue;
    }
    if (opts.dryRun) { done.push(`would copy ${file} -> ${dest}`); continue; }
    copyFileSync(src, dest);
    done.push(`installed plugin ${file}`);
  }

  const cfgNM = (dir) => ({
    asfdk: existsSync(path.join(dir, "node_modules", "@neurolift-technologies", "asfdk")),
    plugin: existsSync(path.join(dir, "node_modules", "@opencode-ai", "plugin")),
  });
  const needDeps = (() => {
    const s = cfgNM(configDir);
    return !s.asfdk || !s.plugin;
  })();
  if (!opts.dryRun && !opts.skipDeps && needDeps) {
    const pkgFile = path.join(configDir, "package.json");
    const pkg = readJson(pkgFile, {});
    pkg.dependencies = { ...(pkg.dependencies ?? {}), "@neurolift-technologies/asfdk": ">=0.2.4" };
    pkg.devDependencies = { ...(pkg.devDependencies ?? {}), "@opencode-ai/plugin": ">=1.18.0", "@types/node": ">=22" };
    if (!pkg.type) pkg.type = "module";
    if (!pkg.private) pkg.private = true;
    writeJson(pkgFile, pkg);
    log("info", `installing deps in ${configDir} (this may take a minute) ...`);
    const npm = run("npm install --no-audit --no-fund", { cwd: configDir });
    if (!npm.ok) log("warn", `npm install in ${configDir} failed: ${npm.stderr || npm.error?.message}`);
    else done.push(`installed runtime deps (@neurolift-technologies/asfdk, @opencode-ai/plugin, @types/node)`);
  } else if (!opts.dryRun && !needDeps) {
    done.push(`runtime deps already present`);
  }

  if (!ensureRepoBuilt(opts, info)) {
    log("warn", `MCP server dist/ not available — skipping MCP wiring.`);
    return { done, configDir };
  }

  const stateDir = opts.stateDir ?? (existsSync(info.toi) ? path.join(home(), ".asfdk") : configDir);
  if (!opts.dryRun) ensureDir(stateDir);
  const cfgFile = path.join(configDir, "opencode.jsonc");
  const hadCfg = existsSync(cfgFile);
  const backupPath = hadCfg && !opts.dryRun ? backup(cfgFile) : null;

  const cfg = hadCfg ? readJsonc(cfgFile, {}) : { $schema: "https://opencode.ai/config.json" };
  if (hadCfg && cfg.__parseError) {
    log("err", `cannot parse ${cfgFile} (${cfg.__parseError}) — skipping config merge.`);
    return { done, configDir, configWarn: true };
  }

  const mcpCommand = [process.execPath, info.dist];
  const environment = {
    ASFDK_GOVERNANCE_TOOLS: opts.toolsGate === "default" ? "default" : "approved",
  };
  if (info.toi) environment.ASFDK_TOI_PATH = info.toi;
  if (info.otoi) environment.ASFDK_OTOI_PATH = info.otoi;

  const mcpEntry = {
    type: "local",
    command: mcpCommand,
    enabled: true,
    timeout: 180000,
    ...(environment ? { environment } : {}),
    ...(stateDir ? { cwd: stateDir } : {}),
  };

  const mcpKey = "asfdk-governance";
  const hadMcp = cfg.mcp?.[mcpKey];
  if (hadMcp && !opts.force) {
    log("dim", `  existing mcp.${mcpKey} kept (--force to overwrite)`);
  } else {
    cfg.mcp = { ...(cfg.mcp ?? {}), [mcpKey]: mcpEntry };
    done.push(`wired mcp.${mcpKey} -> node ${info.dist} (cwd=${stateDir})`);
  }

  const pluginRel = ["./plugins/asfdk-deploy.ts", "./plugins/a2a-task-watch.ts", "./plugins/index.ts"];
  const pluginList = Array.isArray(cfg.plugin) ? cfg.plugin : (typeof cfg.plugin === "string" ? [cfg.plugin] : []);
  let changed = false;
  for (const ref of pluginRel) {
    if (!pluginList.includes(ref)) { pluginList.push(ref); changed = true; }
  }
  if (changed || !Array.isArray(cfg.plugin)) {
    cfg.plugin = cfg.plugin === undefined || changed ? pluginList : cfg.plugin;
  }
  if (changed) done.push(`registered plugins in config: ${pluginRel.join(", ")}`);

  cfg.experimental = { ...(cfg.experimental ?? {}), mcp_timeout: 180000 };
  if (!cfg.lsp || cfg.lsp === true) {
    // Leave LSP untouched. Tuning LSP servers is machine-specific;
    // see INSTALL.md for the recommended hardening.
  }

  if (!opts.dryRun) writeJson(cfgFile, cfg);
  done.push(hadCfg && !opts.dryRun
    ? `updated ${cfgFile} (backup: ${path.basename(backupPath)}) — comments normalized to JSON`
    : `wrote ${cfgFile}`);

  if (!opts.dryRun) {
    log("info", `verifying ${label} MCP server over stdio ...`);
    const check = await verifyMcp(mcpCommand, stateDir, environment, opts.verbose);
    if (check.ok) done.push(`verified: ${check.msg}`);
    else log("warn", `verification failed: ${check.msg}`);
  } else {
    done.push(`[dry-run] would verify MCP server ${info.dist}`);
  }

  return { done, configDir, pluginsDir };
}

/* ------------------------------------------------------------------ */
/* Best-effort adapters                                                */
/* ------------------------------------------------------------------ */

function installHermes(opts) {
  const notes = [];
  const src = path.join(opts.repo, "hermes-plugin");
  const base = process.env.HERMES_CONFIG_DIR || path.join(home(), ".hermes");
  const pluginsDir = process.env.HERMES_PLUGIN_DIR || path.join(base, "plugins");
  notes.push(`hermes: hermes-plugin sources at ${src}`);
  if (existsSync(pluginsDir) || opts.configDir) {
    const dest = opts.configDir || pluginsDir;
    if (!opts.dryRun) ensureDir(dest);
    for (const file of ["plugin.yaml", "tools.py", "__init__.py"]) {
      const srcFile = path.join(src, file);
      if (!existsSync(srcFile)) continue;
      const destFile = path.join(dest, file);
      if (existsSync(destFile) && !opts.force) continue;
      if (!opts.dryRun) copyFileSync(srcFile, destFile);
      notes.push(`  copied ${file} -> ${dest}`);
    }
    notes.push(`  run: hermes plugins reload`);
  } else {
    notes.push(`  no hermes config dir found at ${base}`);
  }
  return { done: notes, notes: ["hermes: requires the asfdk Python package (pip install @neurolift-technologies/asfdk) per docs"] };
}

function installOpenclaw(opts) {
  const notes = [];
  if (which("openclaw")) {
    notes.push(`openclaw CLI detected — run: openclaw plugin add ${path.join(opts.repo, "openclaw-plugin")}`);
  } else {
    notes.push(`openclaw: install via CLI: openclaw plugin add ${path.join(opts.repo, "openclaw-plugin")}`);
  }
  return { done: notes, notes: [] };
}

function installZed(opts) {
  return {
    done: [
      `zed: build the dev extension first (see zed-extension/README.md):`,
      `  cargo run --release -p zed-extension-asfdk (or npm run build in zed-extension/)`,
      `  extension path: ~/.local/share/zed/extensions/dev/...`,
      `  Then add to ~/.config/zed/settings.json:`,
      `    "context_servers": { "asfdk-harness": { "command": "<node abs>", "args": ["<abs>/dist/mcp-server.js"] } }`,
      `  Use ABSOLUTE paths — Zed's WASM sandbox cannot resolve relative dist/ reliably (THREAD-012).`,
    ],
    notes: [],
  };
}

function installPi(opts) {
  return {
    done: [
      `pi: asfdk-harness is a Pi cofounder-agent package (skills + prompt + extension):`,
      `  pi package add ${opts.repo}`,
      `  pi skill enable asfdk-harness`,
      `  See skills/asfdk-harness/SKILL.md and prompts/asfdk-harness.md`,
    ],
    notes: [],
  };
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.target === "list") {
    console.log("Supported targets: opencode, kilo, hermes, openclaw, zed, pi (auto detects installed runtimes)");
    return;
  }

  const info = repoInfo(opts);
  log("info", `asfdk-harness installer`);
  log("info", `  repo: ${opts.repo} (${info.name})`);
  log("info", `  target: ${opts.target}${opts.dryRun ? " [dry-run]" : ""}`);
  log("info", `  node: ${process.version}`);

  if (!opts.repo || !existsSync(path.join(opts.repo, "package.json"))) {
    log("err", `not an asfdk-harness checkout: ${opts.repo}`);
    process.exit(1);
  }
  if (!info.hasDist && !opts.skipBuild && !opts.dryRun) {
    log("info", `building MCP server (dist/) ...`);
    if (!ensureRepoBuilt(opts, info)) { log("err", "build failed; re-run --skip-build to continue without MCP."); process.exit(1); }
  }

  const targets = opts.target === "auto"
    ? ["opencode", "kilo", "hermes", "openclaw", "zed", "pi"]
    : [opts.target];

  const results = [];
  for (const target of targets) {
    log("info", `--- ${target} ---`);
    if (target === "opencode" || target === "kilo") {
      const cfgDir = target === "opencode" ? opencodeConfigDir(opts) : opts.configDir || path.join(home(), ".config", "kilo");
      const res = await installOcodeFamily(opts, { label: target, configDir: cfgDir });
      results.push({ target, res });
    } else if (target === "hermes") results.push({ target, res: installHermes(opts) });
    else if (target === "openclaw") results.push({ target, res: installOpenclaw(opts) });
    else if (target === "zed") results.push({ target, res: installZed(opts) });
    else if (target === "pi") results.push({ target, res: installPi(opts) });
    else { log("err", `unknown target: ${target}`); process.exit(1); }
  }

  log("info", `--- summary ---`);
  for (const { target, res } of results) {
    log("ok", `${target}:`);
    for (const line of res.done) log("dim", `  ${line}`);
    for (const note of res.notes ?? []) log("warn", `  ${note}`);
  }
  log("info", `--- next steps ---`);
  log("info", "  1. Restart your agent runtime (opencode / kilo / etc.).");
  log("info", "  2. Run `opencode mcp list` — expect `asfdk-governance connected`.");
  log("info", "  3. Type /mcp in a session to confirm 10 tools register.");
  for (const note of platformGuardrails(opts)) log("warn", `  ${note}`);
}

main().catch((error) => {
  log("err", `installer failed: ${error?.stack ?? error}`);
  process.exit(1);
});