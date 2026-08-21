"""ASFDK governance tools for Hermes — registered via plugins/asfdk-governance."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from tools.registry import tool_error, tool_result

# ---------------------------------------------------------------------------
# Lazy foundation singleton — created on first tool call
# ---------------------------------------------------------------------------

_foundation: Any = None


async def _get_foundation():
    global _foundation
    if _foundation is not None:
        return _foundation
    from asfdk import create_foundation, FoundationMode

    _foundation = await create_foundation(
        "hermes-agent",
        FoundationMode.UNIFIED,
    )
    return _foundation


def _foundation_available() -> bool:
    try:
        import asfdk  # noqa: F401

        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# Tool: asfdk_status — foundation system status
# ---------------------------------------------------------------------------

ASFDK_STATUS_SCHEMA = {
    "type": "object",
    "properties": {},
    "description": "Return the ASFDK foundation's current mode, user, and per-component status.",
}


async def _handle_asfdk_status(args: dict, **kw) -> str:
    foundation = await _get_foundation()
    status = foundation.get_system_status()
    # Serialize dataclasses / enums for JSON output
    return tool_result(_serialize(status))


# ---------------------------------------------------------------------------
# Tool: asfdk_health — health check
# ---------------------------------------------------------------------------

ASFDK_HEALTH_SCHEMA = {
    "type": "object",
    "properties": {},
    "description": "Run a structured health check across all ASFDK components.",
}


async def _handle_asfdk_health(args: dict, **kw) -> str:
    foundation = await _get_foundation()
    result = await foundation.health_check()
    return tool_result(_serialize(result))


# ---------------------------------------------------------------------------
# Tool: asfdk_assess — emotional assessment via sleepwalker
# ---------------------------------------------------------------------------

ASFDK_ASSESS_SCHEMA = {
    "type": "object",
    "properties": {
        "text": {
            "type": "string",
            "description": "The text to assess for emotional state and crisis signals.",
        }
    },
    "required": ["text"],
    "description": "Assess text through the ASFDK Sleepwalker Protocol — detects emotional state and crisis signals.",
}


async def _handle_asfdk_assess(args: dict, **kw) -> str:
    text = str(args.get("text", "")).strip()
    if not text:
        return tool_error("text is required")
    from asfdk.types import UserInteraction, InteractionType

    foundation = await _get_foundation()
    interaction = UserInteraction(
        timestamp=datetime.now(timezone.utc),
        interaction_type=InteractionType.EMOTIONAL_ASSESSMENT,
        data={"text": text, "source": "hermes-plugin"},
        user_id="hermes-agent",
        session_id="hermes-cli",
    )
    result = await foundation.process_interaction(interaction)
    return tool_result(_serialize(result))


# ---------------------------------------------------------------------------
# Tool: asfdk_preferences — update TOI preferences
# ---------------------------------------------------------------------------

ASFDK_PREFERENCES_SCHEMA = {
    "type": "object",
    "properties": {
        "preferences": {
            "type": "object",
            "description": "A partial TOI preferences object to validate and merge.",
        }
    },
    "required": ["preferences"],
    "description": "Validate and apply a TOI preference update through the ASFDK TOI-OTOI framework.",
}


async def _handle_asfdk_preferences(args: dict, **kw) -> str:
    prefs = args.get("preferences")
    if not isinstance(prefs, dict):
        return tool_error("preferences must be an object")
    from asfdk.types import UserInteraction, InteractionType

    foundation = await _get_foundation()
    interaction = UserInteraction(
        timestamp=datetime.now(timezone.utc),
        interaction_type=InteractionType.PREFERENCE_UPDATE,
        data={"toi": prefs},
        user_id="hermes-agent",
        session_id="hermes-cli",
    )
    result = await foundation.process_interaction(interaction)
    return tool_result(_serialize(result))


# ---------------------------------------------------------------------------
# Tool: asfdk_toi — show active TOI document
# ---------------------------------------------------------------------------

ASFDK_TOI_SCHEMA = {
    "type": "object",
    "properties": {},
    "description": "Return the foundation's active TOI (Terms of Interaction) document.",
}


async def _handle_asfdk_toi(args: dict, **kw) -> str:
    foundation = await _get_foundation()
    toi = foundation.get_active_toi()
    return tool_result(_serialize(toi))


# ---------------------------------------------------------------------------
# Hub tools — discovery hub REST
# ---------------------------------------------------------------------------

HUB_URL = "http://127.0.0.1:3001"


async def _hub_get(path: str) -> dict:
    import urllib.request
    import urllib.error

    url = f"{HUB_URL}{path}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.URLError as e:
        return {"status": "offline", "error": str(e)}


HUB_STATUS_SCHEMA = {
    "type": "object",
    "properties": {},
    "description": "Get the ASFDK discovery hub status (uptime, agent count).",
}


async def _handle_hub_status(args: dict, **kw) -> str:
    data = await _hub_get("/health")
    return tool_result(data)


HUB_AGENTS_SCHEMA = {
    "type": "object",
    "properties": {
        "filter": {
            "type": "string",
            "description": "Optional: filter by name/description substring.",
        }
    },
    "description": "List all agents registered with the ASFDK discovery hub.",
}


async def _handle_hub_agents(args: dict, **kw) -> str:
    path = "/a2a/agents"
    if args.get("filter"):
        path += f"?filter={urllib.parse.quote(str(args['filter']))}"
    data = await _hub_get(path)
    return tool_result(data)


HUB_AGENT_SCHEMA = {
    "type": "object",
    "properties": {
        "agent_id": {
            "type": "string",
            "description": "The ID of the agent to retrieve.",
        }
    },
    "required": ["agent_id"],
    "description": "Get full details for a specific registered agent.",
}


async def _handle_hub_agent(args: dict, **kw) -> str:
    agent_id = str(args.get("agent_id", "")).strip()
    if not agent_id:
        return tool_error("agent_id is required")
    import urllib.parse

    data = await _hub_get(f"/a2a/agents/{urllib.parse.quote(agent_id)}")
    return tool_result(data)


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


def register_tools(ctx) -> None:
    """Register all ASFDK governance tools. Called once by the plugin loader."""
    ctx.register_tool(
        name="asfdk_status",
        toolset="asfdk",
        schema=ASFDK_STATUS_SCHEMA,
        handler=_handle_asfdk_status,
        check_fn=_foundation_available,
        description="Foundation system status — mode, user, per-component status.",
        emoji="🛡",
        is_async=True,
    )
    ctx.register_tool(
        name="asfdk_health",
        toolset="asfdk",
        schema=ASFDK_HEALTH_SCHEMA,
        handler=_handle_asfdk_health,
        check_fn=_foundation_available,
        description="Run a structured health check across all ASFDK components.",
        emoji="💚",
        is_async=True,
    )
    ctx.register_tool(
        name="asfdk_assess",
        toolset="asfdk",
        schema=ASFDK_ASSESS_SCHEMA,
        handler=_handle_asfdk_assess,
        check_fn=_foundation_available,
        description="Assess text for emotional state and crisis signals.",
        emoji="🔍",
        is_async=True,
    )
    ctx.register_tool(
        name="asfdk_preferences",
        toolset="asfdk",
        schema=ASFDK_PREFERENCES_SCHEMA,
        handler=_handle_asfdk_preferences,
        check_fn=_foundation_available,
        description="Validate and apply TOI preference updates.",
        emoji="⚙️",
        is_async=True,
    )
    ctx.register_tool(
        name="asfdk_toi",
        toolset="asfdk",
        schema=ASFDK_TOI_SCHEMA,
        handler=_handle_asfdk_toi,
        check_fn=_foundation_available,
        description="Show the active TOI document.",
        emoji="📄",
        is_async=True,
    )
    ctx.register_tool(
        name="hub_status",
        toolset="asfdk",
        schema=HUB_STATUS_SCHEMA,
        handler=_handle_hub_status,
        description="Discovery hub status (uptime, agent count).",
        emoji="🏢",
        is_async=True,
    )
    ctx.register_tool(
        name="hub_agents",
        toolset="asfdk",
        schema=HUB_AGENTS_SCHEMA,
        handler=_handle_hub_agents,
        description="List all registered A2A agents.",
        emoji="👥",
        is_async=True,
    )
    ctx.register_tool(
        name="hub_agent",
        toolset="asfdk",
        schema=HUB_AGENT_SCHEMA,
        handler=_handle_hub_agent,
        description="Get a specific registered agent by ID.",
        emoji="👤",
        is_async=True,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize(obj: Any) -> Any:
    """Recursively serialize enums, dataclasses, and datetime objects to JSON-safe types."""
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, datetime):
        return obj.isoformat()
    # Enum
    if hasattr(obj, "value") and hasattr(obj, "name"):
        return obj.value
    # Dataclass
    import dataclasses

    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {f.name: _serialize(getattr(obj, f.name)) for f in dataclasses.fields(obj)}
    if isinstance(obj, dict):
        return {str(k): _serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_serialize(v) for v in obj]
    return str(obj)


import urllib.parse  # needed for hub path building
