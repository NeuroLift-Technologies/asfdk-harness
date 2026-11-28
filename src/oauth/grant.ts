/**
 * The MCP grant for an accepted connection: the encrypted props every request
 * carries, and the agent ID issued at acceptance (THREAD-020, design PR #43 §6.1).
 *
 * Kept free of the OAuth provider library so it loads under Node for tests.
 */

import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { formatAgentId, platformFromClient } from "../a2a-identity.js";

/** What every authenticated MCP request carries in `ctx.props`. */
export interface McpAuthProps {
  /** Access user ID, or a fixed ID for the legacy static token. */
  sub: string;
  email?: string;
  name?: string;
  authMethod: "cloudflare-access" | "static-token";
  /**
   * A2A agent ID issued when the person accepted this connection (THREAD-020),
   * for example `claude-7f3a9c`. Absent on grants accepted before agent IDs
   * were issued, and for the static token.
   */
  agentId?: string;
  /** Platform part of `agentId`, from the client's metadata URL host or registered name. */
  agentPlatform?: string;
}

/** Issues a unique agent ID for a platform. The Worker reserves it in the A2AHub Durable Object. */
export type AgentIdIssuer = (platform: string) => Promise<string>;

export interface CallbackOptions {
  issueAgentId?: AgentIdIssuer;
}

/** Fallback when no hub is bound (tests): random, not reserved. */
export const unreservedAgentId: AgentIdIssuer = async (platform) => formatAgentId(platform);

/** The grant's encrypted props and plain audit metadata for an accepted connection. */
export function buildGrant(
  identity: { sub: string; email?: string; name?: string },
  agent: { agentId: string; platform: string },
): { props: McpAuthProps; metadata: { label: string; agentId: string } } {
  return {
    props: {
      sub: identity.sub,
      email: identity.email,
      name: identity.name,
      authMethod: "cloudflare-access",
      agentId: agent.agentId,
      agentPlatform: agent.platform,
    },
    metadata: { label: identity.email ?? identity.sub, agentId: agent.agentId },
  };
}

/** The platform an authorization request's agent ID will carry. */
export async function platformForAuthRequest(
  oauth: Pick<OAuthHelpers, "lookupClient">,
  clientId: string,
  clientName?: string,
): Promise<string> {
  if (/^https:\/\//i.test(clientId)) return platformFromClient({ clientId });
  const name = clientName ?? (await oauth.lookupClient(clientId))?.clientName;
  return platformFromClient({ clientId, clientName: name });
}

