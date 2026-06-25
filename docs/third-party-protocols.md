# Third-Party Protocol Targets

This document tracks third-party agent interoperability protocols for Codex-owned protocol work. MCP work is handled by another active agent/thread and is not part of this Codex lane.

## Priority order

| Priority | Protocol | Layer | Harness posture | Why |
|---|---|---|---|---|
| 1 | Agent2Agent (A2A) | Agent-to-agent | Primary target | A2A is the clearest fit for governed delegation between independent agents. |
| 2 | AG-UI | Agent-to-user | Primary target | AG-UI is the best fit for frontend state, interrupts, approvals, and user steering. |
| 3 | Agent Communication Protocol (ACP) | Agent-to-agent | Compatibility adapter | ACP is REST-native and now positioned as part of A2A; useful for BeeAI/REST ecosystems. |
| 4 | OpenAPI / REST facade | Agent-to-api | Compatibility adapter | Useful for enterprise gateways, audit/status endpoints, and non-agent systems. |
| 5 | NLIP / Open Floor | Conversation | Watchlist | Relevant for voice/conversational interop, but not needed until a concrete host exists. |
| Separate owner | MCP | Agent-to-tool | THREAD-002 / Vibe | MCP is being handled by another agent; Codex should not modify that implementation. |

## A2A target shape

Use A2A when `asfdk-harness` needs to act as a governed remote agent or delegate to another remote agent.

Adapter responsibilities:

- Publish an Agent Card that advertises ASFDK harness capabilities without leaking private `.toi` contents.
- Accept task/message requests only after ASFDK policy preflight.
- Map A2A task lifecycle to Pi session lifecycle where practical.
- Preserve A2A's agent-to-agent boundary; do not treat remote A2A agents as tools.
- Surface OTOI enforcement, escalation posture, and privacy constraints as agent metadata.

Initial A2A skills to advertise:

- `asfdk.status`
- `asfdk.protocol_status`
- `asfdk.assess_text`
- `asfdk.preference_update`
- `asfdk.governed_pi_task`

## AG-UI target shape

Use AG-UI when a user-facing app needs live interaction with the harness.

Adapter responsibilities:

- Stream protocol state, task state, tool results, and policy decisions as typed frontend events.
- Support interrupts for approval, escalation, cancellation, and preference clarification.
- Filter events through the resolved `.toi` privacy floor before frontend delivery.
- Avoid exposing raw chain-of-thought or private governance artifacts.

Initial event families:

- protocol loaded
- preflight started/completed
- tool policy allowed/blocked
- escalation requested
- handoff written

## ACP target shape

Use ACP as a REST-native compatibility adapter for environments that already speak ACP.

Adapter responsibilities:

- Expose manifest/discovery metadata with the same governance posture as A2A.
- Provide synchronous and asynchronous run endpoints only after ASFDK preflight.
- Treat ACP as a compatibility layer while tracking its migration into A2A.
- Do not use ACP's MCP adapter path in this harness.

## OpenAPI / REST target shape

Use OpenAPI for conventional enterprise integration, not agent delegation.

Initial endpoints:

- `GET /status`
- `GET /protocols`
- `POST /assess-text`
- `POST /policy/review-tool-call`

These endpoints should be boring, authenticated, auditable, and explicit. They should not create hidden autonomous execution paths.

## MCP ownership boundary

MCP is owned by `THREAD-002 — MCP Server Integration`.

For Codex third-party protocol work:

- Do not edit `src/mcp-server.ts`.
- Do not change MCP package scripts, dependencies, tool definitions, or documentation.
- Do not use A2A/AG-UI/ACP work to override MCP behavior.
- Coordinate with the MCP-owning agent through `docs/active-threads.md` and handoff records.

## Current implementation

The current repo includes a registry, not full network adapters:

- `src/protocols.ts` exposes `getThirdPartyProtocolProfiles()`.
- `asfdk_interop_protocols` returns the registry inside Pi.
- `/asfdk-interop` shows the registry from the Pi command surface.
- `asfdk_protocol_status` includes the registry alongside local `.toi`/`.otoi` protocol state.
- MCP appears in the registry only as a separate-owner boundary marker.

Next implementation step: add an A2A adapter module that can generate an Agent Card from the registry and resolved `.otoi` policy.
