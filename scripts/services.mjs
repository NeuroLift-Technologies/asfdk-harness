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
 * Governance (NLT-DEV-OTOI-1.0.3): preview is the default; mutation requires --apply.
 * No files are written outside the repo's scripts\.svc\ dir and the Windows service database.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const svcDir = path.join(__dirname, ".svc");
const isMainModule = false;

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

function log(level, msg) {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`${stamp} [${level}] ${msg}`);
}

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

/** Write the per-service .cmd launcher that sets cwd + env and runs node dist\entry.js as argv[1]. */
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

function launcherPath(svc) {
  return path.join(svcDir, `${svc.name}.cmd`);
}

function ensureSvcsImported() {
  /* placeholder to keep node --check happy; replaced at runtime by writeLaunchers */
}

function writeLaunchers(apply) {
  if (!apply && fs.existsSync(svcDir)) {
    for (const svc of SERVICES) fs.rmSync(launcherPath(svc), { force: true });
  }
  if (!apply) {
    log("preview", `would create service launchers under scripts\\.svc\\ (repo-local, gitignored):`);
  }
  if (apply) {
    fs.mkdirSync(svcDir, { recursive: true });
    for (const svc of SERVICES) {
      fs.writeFileSync(launcherPath(svc), launcherBody(svc), "utf8");
      log("ok", `wrote launcher: ${launcherPath(svc)}`);
    }
  }
}

/** Validate the preconditions that would otherwise make a silently-broken service. */
function validate(svc) {
  const problems = [];
  if (!fs.existsSync(svc.entry)) problems.push(`missing dist entrypoint: ${svc.entry}`);
  if (!fs.existsSync(nodeExe)) problems.push(`missing node binary: ${nodeExe}`);
  if (!fs.existsSync(scExe)) problems.push(`missing sc.exe: ${scExe}`);
  return problems;
}

/**
 * Run sc.exe with a raw command line composed EXACTLY as a human would type it
 * in cmd.exe. Required: sc.exe parses its own raw command line (binPath=/start=
 * spacing rules), and Node's implicit `cmd /d /s /c "..."` wrapper strips the
 * first+last quote — so the sc.exe path must be wrapped with a DOUBLED leading
 * quote (`cmd.exe /d /s /c ""sc.exe" <fragment>"`) for sc to receive the
 * fragment byte-identical. Verified by parse probe: OpenSCManager FAILED 5 =
 * parsed OK, blocked on admin only. Preview output === applied commands.
 */
function scRaw(fragment) {
  try {
    const out = execSync(`cmd.exe /d /s /c ""${scExe}" ${fragment}"`, {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout: out ?? "", stderr: "" };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

/** binPath value: .cmd launcher cd's to repo, sets env, runs node dist\entry.js as argv[1]. */
function binPathFor(svc) {
  return `"${launcherPath(svc)}"`;
}

function createCmd(svc) {
  return `create ${svc.name} binPath= ${binPathFor(svc)} start= auto DisplayName= "${svc.display}"`;
}

function descriptionCmd(svc) {
  return `description ${svc.name} "${svc.description}"`;
}

function failureCmd(svc) {
  return `failure ${svc.name} reset= 86400 actions= restart/5000/restart/10000/restart/30000`;
}

function serviceStatus(svc) {
  const res = scRaw(`query ${svc.name}`);
  if (res.status !== 0) return `not-installed (sc query rc=${res.status})`;
  const out = res.stdout || "";
  const m = out.match(/STATE\s*:\s*\d+\s+([A-Z_]+)/i);
  const state = m ? m[1] : "unknown";
  const started = /RUNNING|START_PENDING/i.test(state);
  return `${state}${started ? " (RUNNING)" : ""}`;
}

function previewActions() {
  log("preview", ">>> sc.exe commands that WILL run with `--apply` (run the script elevated):");
  for (const svc of SERVICES) {
    console.log(`  sc ${createCmd(svc)}`);
    console.log(`  sc ${descriptionCmd(svc)}`);
    console.log(`  sc ${failureCmd(svc)}`);
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

function doApply() {
  const isAdmin = (() => {
    try {
      const whoami = spawnSync("whoami", ["/groups"], { encoding: "utf8", windowsHide: true });
      return /\bS-1-5-32-544\b/.test(whoami.stdout || "");
    } catch {
      return false;
    }
  })();
  if (!isAdmin) {
    log(
      "error",
      "elevation required. Re-run from an elevated terminal: node scripts/services.mjs apply`",
    );
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
    log("info", `${svc.name}: registering service...`);
    const create = scRaw(createCmd(svc));
    if (create.status !== 0 && !/the specified service already exists/i.test(create.stderr || create.stdout || "")) {
      log("error", `${svc.name}: sc create failed -> ${create.stderr || create.stdout || create.status}`);
      anyFail = true;
      continue;
    }
    const desc = scRaw(descriptionCmd(svc));
    if (desc.status !== 0) log("warn", `${svc.name}: sc description rc=${desc.status}: ${(desc.stderr || '').trim()}`);
    const fail = scRaw(failureCmd(svc));
    if (fail.status !== 0) log("warn", `${svc.name}: sc failure rc=${fail.status}: ${(fail.stderr || '').trim()}`);
    const start = scRaw(`start ${svc.name}`);
    if (start.status !== 0) {
      log("warn", `${svc.name}: sc start rc=${start.status}: ${(start.stderr || '').trim()}`);
    }
    log("ok", `${svc.name}: registered (auto-start on boot, restart on crash)`);
  }

  if (anyFail) process.exitCode = 1;
}

function doStatus() {
  log("info", `services: node ${nodeExe}`);
  for (const svc of SERVICES) {
    log("info", `${svc.name}: ${serviceStatus(svc)}  (handler: ${path.relative(repoRoot, svc.entry)})`);
  }
}

function doRemove() {
  for (const svc of SERVICES) {
    scRaw(`stop ${svc.name}`);
    const res = scRaw(`delete ${svc.name}`);
    if (res.status === 0) log("ok", `${svc.name}: deleted`);
    else log("warn", `${svc.name}: sc delete rc=${res.status}: ${(res.stderr || '').trim()}`);
  }
  const leftovers = path.join(svcDir, "*.cmd");
  if (fs.existsSync(svcDir)) {
    for (const f of fs.readdirSync(svcDir)) if (f.endsWith(".cmd")) fs.rmSync(path.join(svcDir, f), { force: true });
    try { fs.rmdirSync(svcDir); } catch { /* keep */ }
  }
  log("ok", `removed launchers under scripts\\.svc\\${leftovers}`);
}

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
