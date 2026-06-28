---
name: asfdk-harness
description: Use when working with the ASFDK Solidarity Layer enabled — governance preflight, ASFDK tool use, and escalation boundaries. Compatible with NeuroLift agent runtimes (Pi = first supported).
---

# ASFDK Harness

Use this skill when working with the ASFDK Solidarity Layer enabled. This harness is the Solidarity Framework runtime/control plane governing agent sessions, A2A delegation, MCP/tool surfaces, TOI/OTOI resolution, preflight checks, and escalation across NeuroLift agent runtimes. Pi is the first supported cofounder-agent runtime.

## Operating model

- Treat ASFDK as governance middleware between user intent, model reasoning, and tool execution.
- Run sensitive text, preference updates, and governance questions through the registered ASFDK tools.
- Do not hardcode an LLM provider or recommend provider lock-in.
- Do not claim ASFDK made a clinical diagnosis; crisis/emotional outputs are routing and safety signals.
- Escalate to the human when a decision changes architecture, deployment, safety thresholds, or external integrations.

## Available tools

- `asfdk_status` — inspect active ASFDK foundation mode and component health.
- `asfdk_protocol_status` — inspect local `.toi`/`.otoi` protocol loading and non-MCP integration state.
- `asfdk_interop_protocols` — inspect third-party protocol targets such as A2A, AG-UI, ACP, REST/OpenAPI, and MCP ownership boundaries.
- `asfdk_assess_text` — assess free text through active ASFDK components.
- `asfdk_update_preferences` — validate/update explicit user preferences through the TOI/OTOI path.

## Default posture

Start in observe/advisory mode unless the user explicitly asks for stronger enforcement. The harness blocks only high-risk local tool actions by default. Do not modify MCP transport, MCP tools, or MCP resources from this protocol lane; MCP is owned by THREAD-002.

## Third-party protocol posture

- Treat A2A as the primary agent-to-agent integration target.
- Treat AG-UI as the primary agent-to-user/front-end interaction target.
- Treat ACP as a REST-native compatibility adapter, especially for BeeAI/ACP environments.
- Treat REST/OpenAPI as enterprise compatibility, not autonomous agent delegation.
- Keep MCP work scoped to THREAD-002 and the MCP-owning agent.
