"""ASFDK governance plugin — registers 8 tools under the ``asfdk`` toolset."""

from __future__ import annotations

from .tools import (
    _foundation_available,
    _handle_asfdk_assess,
    _handle_asfdk_health,
    _handle_asfdk_preferences,
    _handle_asfdk_status,
    _handle_asfdk_toi,
    _handle_hub_agent,
    _handle_hub_agents,
    _handle_hub_status,
    ASFDK_ASSESS_SCHEMA,
    ASFDK_HEALTH_SCHEMA,
    ASFDK_PREFERENCES_SCHEMA,
    ASFDK_STATUS_SCHEMA,
    ASFDK_TOI_SCHEMA,
    HUB_AGENT_SCHEMA,
    HUB_AGENTS_SCHEMA,
    HUB_STATUS_SCHEMA,
)

_TOOLS = (
    ("asfdk_status",      ASFDK_STATUS_SCHEMA,      _handle_asfdk_status,      "🛡"),
    ("asfdk_health",      ASFDK_HEALTH_SCHEMA,      _handle_asfdk_health,      "💚"),
    ("asfdk_assess",      ASFDK_ASSESS_SCHEMA,      _handle_asfdk_assess,      "🔍"),
    ("asfdk_preferences", ASFDK_PREFERENCES_SCHEMA, _handle_asfdk_preferences, "⚙️"),
    ("asfdk_toi",         ASFDK_TOI_SCHEMA,        _handle_asfdk_toi,         "📄"),
    ("hub_status",        HUB_STATUS_SCHEMA,       _handle_hub_status,        "🏢"),
    ("hub_agents",        HUB_AGENTS_SCHEMA,       _handle_hub_agents,        "👥"),
    ("hub_agent",         HUB_AGENT_SCHEMA,        _handle_hub_agent,         "👤"),
)


def register(ctx) -> None:
    """Register all ASFDK governance tools. Called once by the plugin loader."""
    for name, schema, handler, emoji in _TOOLS:
        ctx.register_tool(
            name=name,
            toolset="asfdk",
            schema=schema,
            handler=handler,
            check_fn=_foundation_available,
            is_async=True,
            emoji=emoji,
        )
