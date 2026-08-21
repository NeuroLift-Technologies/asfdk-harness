# ASFDK Governance Hermes Plugin

A Python plugin for Hermes Agent exposing ASFDK governance operations as native agent tools.

## Installation

```bash
cp -r hermes-plugin ~/.hermes/plugins/asfdk-governance
hermes gateway restart
```

## Tools

| Tool | Source | Description |
|---|---|---|
| `asfdk_status` | Python pkg | Foundation mode, user, per-component status |
| `asfdk_health` | Python pkg | Structured health check across all components |
| `asfdk_assess` | Python pkg | Emotional assessment via Sleepwalker (RRT handoff) |
| `asfdk_preferences` | Python pkg | Validate + merge TOI preference updates |
| `asfdk_toi` | Python pkg | Show active TOI document |
| `hub_status` | REST `/health` | Discovery hub uptime + agent count |
| `hub_agents` | REST `/a2a/agents` | List registered A2A agents (optional `filter`) |
| `hub_agent` | REST `/a2a/agents/:id` | Get one agent by ID |

## Requirements

- `asfdk` Python package installed in the Hermes venv
- Discovery hub running at `http://127.0.0.1:3001` (hub tools only)
