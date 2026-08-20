import type { Hooks, PluginInput, PluginOptions } from "@opencode-ai/plugin";
import {
  Channel,
  createFoundation,
  FoundationMode,
  InteractionType,
  type NeuroLiftFoundation,
} from "@neurolift-technologies/asfdk";

interface A2ATaskWatchOptions {
  hubUrl?: string;
  agentId?: string;
  agentName?: string;
  userId?: string;
  mode?: FoundationMode;
  sessionId?: string;
  intervalMs?: number;
  tasksPath?: string;
  maxInputLength?: number;
  logPrefix?: string;
}

const DEFAULT_OPTIONS: Required<A2ATaskWatchOptions> = {
  hubUrl: "",
  agentId: "opencode-asfdk-deploy",
  agentName: "OpenCode ASFDK Deploy",
  userId: "opencode-user",
  mode: FoundationMode.UNIFIED,
  sessionId: "opencode-session",
  intervalMs: 30000,
  tasksPath: "",
  maxInputLength: 4000,
  logPrefix: "a2a-task-watch",
};

interface HubInfo {
  url: string;
  health: string;
  agents: string;
  register: string;
}

export default async function a2aTaskWatch(_input: PluginInput, options: PluginOptions = {}): Promise<Hooks> {
  const opts = { ...DEFAULT_OPTIONS, ...options } as Required<A2ATaskWatchOptions>;
  const hubUrl = opts.hubUrl || process.env.ASFDK_A2A_HUB_URL || "";
  const tasksPath = opts.tasksPath || `/agents/${opts.agentId}/tasks`;

  const log = (...args: unknown[]): void => {
    console.error(`[${opts.logPrefix}]`, ...args);
  };

  let foundation: NeuroLiftFoundation | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const knownAgents = new Set<string>();

  async function foundationReady(): Promise<NeuroLiftFoundation | undefined> {
    if (foundation) return foundation;
    try {
      foundation = await createFoundation({ userId: opts.userId, mode: opts.mode });
      await foundation.initialize();
      log("foundation-ready", `mode=${opts.mode}`);
    } catch (error) {
      log("foundation-error", String(error));
      return undefined;
    }
    return foundation;
  }

  async function json(url: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function registerAgent(): Promise<void> {
    try {
      const body = {
        kind: "a2a-agent-card",
        protocolVersion: "0.3.0",
        id: opts.agentId,
        name: opts.agentName,
        description: "OpenCode runtime governed by the ASFDK Solidarity Framework.",
        version: "1.0.0",
        url: hubUrl,
        preferredTransport: "JSONRPC",
        defaultInputModes: ["text/plain", "application/json"],
        defaultOutputModes: ["text/plain", "application/json"],
        discovery: { protocol: "A2A", mechanism: "Agent Card" },
      };
      await json(hubUrl.replace(/\/$/, "") + "/register", { method: "POST", body: JSON.stringify(body) });
      log("registered", opts.agentId);
    } catch (error) {
      log("register-error", String(error));
    }
  }

  async function pollAgents(): Promise<void> {
    try {
      const result = (await json(hubUrl.replace(/\/$/, "") + "/agents")) as
        | Array<{ id?: string; name?: string }>
        | { agents?: Array<{ id?: string; name?: string }> };
      const agents = Array.isArray(result) ? result : (result?.agents ?? []);
      for (const agent of agents) {
        const id = agent.id ?? agent.name;
        if (id && !knownAgents.has(id)) {
          knownAgents.add(id);
          log("peer-discovered", `${id} (${agent.name ?? "unnamed"})`);
        }
      }
    } catch (error) {
      log("poll-agents-error", String(error));
    }
  }

  async function pollTasks(): Promise<void> {
    const foundationInstance = await foundationReady();
    if (!foundationInstance) return;
    try {
      const url = hubUrl.replace(/\/$/, "") + tasksPath;
      const result = (await json(url)) as Array<{ id?: string; message?: string; text?: string }>;
      if (!Array.isArray(result)) return;
      for (const task of result) {
        if (!task?.id || !remember(task.id)) continue;
        const text = String(task.message ?? task.text ?? "").slice(0, opts.maxInputLength);
        if (!text) continue;
        try {
          const interaction = await foundationInstance.processInteraction({
            timestamp: new Date(),
            interactionType: InteractionType.EMOTIONAL_ASSESSMENT,
            data: { text, source: `a2a:${task.id}` },
            userId: opts.userId,
            sessionId: opts.sessionId,
            channel: Channel.UNKNOWN,
          });
          log("task-assessment", `task=${task.id} success=${interaction?.success ?? false}`);
        } catch (error) {
          log("task-assessment-error", `task=${task.id} ${String(error)}`);
        }
      }
    } catch (error) {
      log("poll-tasks-error", String(error));
    }
  }

  const seen = new Set<string>();
  const seenOrder: string[] = [];

  function remember(id: string): boolean {
    if (seen.has(id)) return false;
    seen.add(id);
    seenOrder.push(id);
    if (seenOrder.length > 1000) {
      seen.delete(seenOrder.shift() as string);
    }
    return true;
  }

  async function watch(): Promise<void> {
    if (!hubUrl) {
      log("disabled", "no hub URL (set options.hubUrl or ASFDK_A2A_HUB_URL)");
      return;
    }
    await foundationReady();
    await registerAgent();
    await pollAgents();
    await pollTasks();
    timer = setInterval(async () => {
      try {
        await pollAgents();
        await pollTasks();
      } catch (error) {
        log("watch-error", String(error));
      }
    }, opts.intervalMs);
  }

  void watch();

  return {
    dispose: async () => {
      if (timer) clearInterval(timer);
      log("dispose", "a2a-task-watch shutting down");
    },
  };
}
