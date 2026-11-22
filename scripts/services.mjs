#!/usr/bin/env node
/**
 * Windows service registration for the always-on ASFDK harness servers.
 *
 * Registers two auto-start services (start on boot, restart on crash):
 *   1. asfdk-a2a-hub       -> node dist\discovery-hub.js        (A2A discovery hub, 127.0.0.1:3001)
 *   2. asfdk-governance-mcp-> node dist\mcp-http-server.js      (asfdk-governance MCP over HTTP, 127.0.0.1:8788 /mcp)
 *
 * Node apps can't receive native SCM stop/param messages, so each service runs a tiny
 * .cmd launcher (generated into scripts\.svc\) that cd's to the repo and then invokes
 * the dist entrypoint directly with absolute node.exe. Invoking the entry JS directly as
 * argv[1] is what lets `entrypoint.ts#isMainModule` realpath-compare successfully; a
 * wrapper that imported the module would make the main-guard fall through and the server
 * would silently never boot.
 *
 * Zero dependencies (node:child_process, node:fs, node:os, node:path). Pure Node, one file.
 *
 * Usage (all safe by default - preview only; `--apply` performs the mutation):
 *   node scripts/services.mjs [preview]            show exact sc.exe commands (default)
 *   node scripts/services.mjs apply                create the services (auto-start + failure recovery)
 *   node scripts/services.mjs status               query current service state
 *   node scripts/services.mjs remove               sc delete both services (and stop them first)
 *
 * Governance (NLT-DEV-OTOI-1.0.4): preview is the default; mutation requires `apply`
 * (or `remove`) from an elevated terminal. Preview never writes files.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const svcDir = path.join(__dirname, ".svc");

/** Absolute node binary (services run under SYSTEM whose PATH differs from an interactive session). */
const nodeExe = process.execPath;
const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
const scExe = path.join(systemRoot, "System32", "sc.exe");

/** The two always-on servers. */
const SERVICES = [
  {
    name: "asfdk-a2a-hub",
    display: "ASFDK A2A Discovery Hub",
    description:
      "ASFDK A2A discovery + agent registry hub (alerts A2A task watchers). Auto-start on boot; restart on crash.",
    entry: path.join(repoRoot, "dist", "discovery-hub.js"),
    env: { ASFDK_A2A_HOST: "127.0.0.1", ASFDK_A2A_PORT: "3001" },
    healthHint: "http://127.0.0.1:3001/health",
  },
  {
    name: "asfdk-governance-mcp",
    display: "ASFDK Governance MCP (HTTP)",
    description:
      "asfdk-governance MCP server served over HTTP (Streamable HTTP, 127.0.0.1:8788, path /mcp). Auto-start on boot; restart on crash.",
    entry: path.join(repoRoot, "dist", "mcp-http-server.js"),
    env: { MCP_HTTP_HOST: "127.0.0.1", MCP_HTTP_PORT: "8788", MCP_HTTP_PATH: "/mcp" },
    healthHint: "http://127.0.0.1:8788/mcp (POST initialize) or GET /health if exposed",
  },
];

/** Log a timestamped, level-tagged message. */
function log(level, msg) {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`${stamp} [${level}] ${msg}`);
}

/** Locate the first existing executable from a list of names or absolute paths. */
function whichExe(candidates) {
  for (const c of candidates) {
    const full = path.isAbsolute(c) ? c : path.join(systemRoot, "System32", c);
    if (fs.existsSync(full)) return full;
    try {
      const res = spawnSync("where.exe", [c], { stdio: "ignore", windowsHide: true });
      if (res.status === 0 && res.stdout && res.stdout.length > 0) {
        return res.stdout.toString().split(/\r?\n/)[0].trim();
      }
    } catch {
      /* keep scanning */
    }
  }
  return null;
}

/** True when a value would be reinterpreted by cmd.exe inside a generated launcher. */
function unsafeForCmd(value) {
  return /["%&^!|<>\r\n]/.test(String(value));
}

/** Build the .cmd launcher body: set cwd + env and run node dist\entry.js as argv[1]. */
function launcherBody(svc) {
  const lines = ["@echo off", "setlocal"];
  lines.push(`cd /d "${repoRoot}"`);
  for (const [k, v] of Object.entries(svc.env)) {
    lines.push(`set "${k}=${v}"`);
  }
  lines.push(`"${nodeExe}" "${svc.entry}"`);
  lines.push("endlocal");
  return lines.join("\r\n") + "\r\n";
}

/** Absolute path of a service's generated launcher. */
function launcherPath(svc) {
  return path.join(svcDir, `${svc.name}.cmd`);
}

/**
 * Write launchers when applying; preview only logs what would be written.
 * Preview must never delete or overwrite an existing launcher: registered
 * services depend on these files for their next start.
 */
function writeLaunchers(apply) {
  if (!apply) {
    log("preview", `would create service launchers under scripts\\.svc\\ (repo-local, gitignored):`);
    for (const svc of SERVICES) log("preview", `  ${launcherPath(svc)}`);
    return;
  }
  fs.mkdirSync(svcDir, { recursive: true });
  for (const svc of SERVICES) {
    fs.writeFileSync(launcherPath(svc), launcherBody(svc), "utf8");
    log("ok", `wrote launcher: ${launcherPath(svc)}`);
  }
}

/** Validate preconditions that would otherwise make a silently-broken service. */
function validate(svc) {
  const problems = [];
  if (!fs.existsSync(svc.entry)) problems.push(`missing dist entrypoint: ${svc.entry}`);
  if (!fs.existsSync(nodeExe)) problems.push(`missing node binary: ${nodeExe}`);
  if (!fs.existsSync(scExe)) problems.push(`missing sc.exe: ${scExe}`);
  for (const value of [repoRoot, nodeExe, svc.entry]) {
    if (unsafeForCmd(value)) problems.push(`path contains cmd.exe metacharacters: ${value}`);
  }
  return problems;
}

/**
 * Run sc.exe directly with an argument array (no cmd.exe string layer).
 * Passing arguments as separate argv entries keeps user-chosen checkout paths
 * from being reinterpreted as command syntax and preserves sc.exe's `key= value`
 * spacing rules.
 */
function scRaw(args) {
  try {
    const res = spawnSync(scExe, args, {
      encoding: "utf8",
      shell: false,
      windowsVerbatimArguments: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (res.error) return { status: 1, stdout: res.stdout ?? "", stderr: res.error.message };
    return { status: res.status ?? 1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
  } catch (error) {
    return { status: 1, stdout: "", stderr: String(error?.message ?? error) };
  }
}

/** Render sc.exe arguments for the read-only preview output. */
function formatScCommand(args) {
  return args.map((arg) => (/[\s]/.test(arg) && !/^".*"$/.test(arg) ? `"${arg}"` : arg)).join(" ");
}

/** binPath value: .cmd launcher cd's to repo, sets env, runs node dist\entry.js as argv[1]. */
function binPathFor(svc) {
  return `"${launcherPath(svc)}"`;
}

/** Arguments for `sc create` (service is initially stopped; failure actions set below). */
function createArgs(svc) {
  return ["create", svc.name, "binPath=", binPathFor(svc), "start=", "auto", "DisplayName=", svc.display];
}

/** Arguments for `sc config` (refresh an already-registered service's executable). */
function configArgs(svc) {
  return ["config", svc.name, "binPath=", binPathFor(svc), "start=", "auto", "DisplayName=", svc.display];
}

/** Arguments for `sc description`. */
function descriptionArgs(svc) {
  return ["description", svc.name, svc.description];
}

/** Arguments for `sc failure` (auto-restart on crash). */
function failureArgs(svc) {
  return ["failure", svc.name, "reset=", "86400", "actions=", "restart/5000/restart/10000/restart/30000"];
}

/** True when Windows already has a service registration with this name (locale-independent). */
function serviceExists(svc) {
  return scRaw(["query", svc.name]).status === 0;
}

/** Human-readable service state from `sc query`. */
function serviceStatus(svc) {
  const res = scRaw(["query", svc.name]);
  if (res.status !== 0) return `not-installed (sc query rc=${res.status})`;
  const out = res.stdout || "";
  const m = out.match(/STATE\s*:\s*\d+\s+([A-Z_]+)/i);
  const state = m ? m[1] : "unknown";
  const started = /RUNNING|START_PENDING/i.test(state);
  return `${state}${started ? " (RUNNING)" : ""}`;
}

/** Print the exact sc.exe commands and preflight results without changing anything. */
function previewActions() {
  log("preview", ">>> sc.exe commands that WILL run with `apply` (run the script elevated):");
  for (const svc of SERVICES) {
    // Match apply(): an existing registration is refreshed with `sc config`, not recreated.
    console.log(`  sc ${formatScCommand(serviceExists(svc) ? configArgs(svc) : createArgs(svc))}`);
    console.log(`  sc ${formatScCommand(descriptionArgs(svc))}`);
    console.log(`  sc ${formatScCommand(failureArgs(svc))}`);
  }
  for (const svc of SERVICES) {
    const probs = validate(svc);
    if (probs.length) {
      log("warn", `${svc.name}: ${probs.join("; ")}`);
    } else {
      log("info", `${svc.name}: entrypoint ${path.relative(repoRoot, svc.entry)} exists; node ${nodeExe}`);
    }
  }
}

/** True when the current process has the Windows Administrators group in its token. */
function isElevated() {
  try {
    const whoami = spawnSync("whoami", ["/groups"], { encoding: "utf8", windowsHide: true });
    return /\bS-1-5-32-544\b/.test(whoami.stdout || "");
  } catch {
    return false;
  }
}

/** Register (or reconfigure), describe, and start both services; set exit code on failure. */
function doApply() {
  if (!isElevated()) {
    log("error", "elevation required. Re-run from an elevated terminal: node scripts/services.mjs apply");
    process.exitCode = 2;
    return;
  }

  writeLaunchers(true);

  let anyFail = false;
  for (const svc of SERVICES) {
    const probs = validate(svc);
    if (probs.length) {
      log("error", `${svc.name}: ${probs.join("; ")} -> skipping`);
      anyFail = true;
      continue;
    }
    const exists = serviceExists(svc);
    log("info", `${svc.name}: ${exists ? "reconfiguring" : "registering"} service...`);
    if (exists) {
      // A moved checkout or a different node.exe leaves a stale binPath behind.
      const config = scRaw(configArgs(svc));
      if (config.status !== 0) {
        log("error", `${svc.name}: sc config rc=${config.status}: ${(config.stderr || "").trim()}`);
        anyFail = true;
        continue;
      }
    } else {
      const create = scRaw(createArgs(svc));
      if (create.status !== 0) {
        log("error", `${svc.name}: sc create failed -> ${create.stderr || create.stdout || create.status}`);
        anyFail = true;
        continue;
      }
    }
    const desc = scRaw(descriptionArgs(svc));
    if (desc.status !== 0) log("warn", `${svc.name}: sc description rc=${desc.status}: ${(desc.stderr || "").trim()}`);
    const fail = scRaw(failureArgs(svc));
    if (fail.status !== 0) log("warn", `${svc.name}: sc failure rc=${fail.status}: ${(fail.stderr || "").trim()}`);

    const start = scRaw(["start", svc.name]);
    const output = `${start.stderr || ""} ${start.stdout || ""}`;
    const alreadyRunning = start.status === 1056 || /\b1056\b|already running/i.test(output);
    if (start.status !== 0 && !alreadyRunning) {
      log("error", `${svc.name}: sc start rc=${start.status}: ${(start.stderr || "").trim()}`);
      anyFail = true;
      continue;
    }
    log("ok", `${svc.name}: registered (auto-start on boot, restart on crash)`);
  }

  if (anyFail) process.exitCode = 1;
}

/** Print the current state of both services. */
function doStatus() {
  log("info", `services: node ${nodeExe}`);
  for (const svc of SERVICES) {
    log("info", `${svc.name}: ${serviceStatus(svc)}  (handler: ${path.relative(repoRoot, svc.entry)})`);
  }
}

/** Stop and delete both services; only remove launchers whose service was actually deleted. */
function doRemove() {
  if (!isElevated()) {
    log("error", "elevation required. Re-run from an elevated terminal: node scripts/services.mjs remove");
    process.exitCode = 2;
    return;
  }

  const removed = [];
  const failed = [];
  for (const svc of SERVICES) {
    scRaw(["stop", svc.name]);
    const res = scRaw(["delete", svc.name]);
    if (res.status === 0) {
      removed.push(svc);
      log("ok", `${svc.name}: deleted`);
    } else {
      failed.push(svc.name);
      log("warn", `${svc.name}: sc delete rc=${res.status}: ${(res.stderr || "").trim()} (launcher kept)`);
    }
  }

  for (const svc of removed) fs.rmSync(launcherPath(svc), { force: true });
  if (fs.existsSync(svcDir) && fs.readdirSync(svcDir).length === 0) {
    try { fs.rmdirSync(svcDir); } catch { /* keep */ }
  }

  log("ok", `removed ${removed.length}/${SERVICES.length} service(s); deleted launchers for successful removals`);
  if (failed.length) {
    log("warn", `failed to delete: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}

/** Dispatch the requested service action (preview by default). */
function main() {
  const cmd = process.argv[2] ?? "preview";
  switch (cmd) {
    case "preview":
    case "--preview":
      writeLaunchers(false);
      previewActions();
      break;
    case "apply":
    case "--apply":
      doApply();
      break;
    case "status":
    case "--status":
      doStatus();
      break;
    case "remove":
    case "--remove":
      doRemove();
      break;
    default:
      log("error", `unknown action "${cmd}" (expected preview|apply|status|remove)`);
      process.exitCode = 2;
  }
}

main();
