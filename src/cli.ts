#!/usr/bin/env node
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import asfdkPiHarness from "./index.js";

function usage(): never {
  console.log(`ASFDK Pi Harness\n\nUsage:\n  asfdk-harness "prompt"          Run one prompt through Pi with ASFDK hooks\n  asfdk-harness --cwd <path> ...   Set working directory\n\nEnvironment:\n  ASFDK_USER_ID  User id for ASFDK foundation (default: pi-user)\n  ASFDK_MODE     unified | crisis_only | continuity | framework | development\n`);
  process.exit(0);
}

const args = process.argv.slice(2);
let cwd = process.cwd();
const promptParts: string[] = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--help" || arg === "-h") usage();
  if (arg === "--cwd") {
    const next = args[index + 1];
    if (!next) throw new Error("--cwd requires a path");
    cwd = next;
    index += 1;
    continue;
  }
  promptParts.push(arg);
}

const prompt = promptParts.join(" ").trim();
if (!prompt) usage();

const resourceLoader = new DefaultResourceLoader({
  cwd,
  agentDir: getAgentDir(),
  extensionFactories: [asfdkPiHarness],
});
await resourceLoader.reload();

const { session } = await createAgentSession({
  cwd,
  resourceLoader,
  sessionManager: SessionManager.create(cwd),
});

try {
  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
  });

  await session.prompt(prompt);
  process.stdout.write("\n");
} finally {
  session.dispose();
}
