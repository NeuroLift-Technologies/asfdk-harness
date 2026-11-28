/**
 * The MCP OAuth authorization endpoint (/authorize) and the Cloudflare Access
 * callback (/callback).
 *
 * Flow:
 *   1. GET  /authorize  — validate the MCP client's request, show the consent page.
 *   2. POST /authorize  — on Allow, send the browser to Cloudflare Access (PKCE, browser-bound state).
 *   3. GET  /callback   — exchange Access's code, verify the ID token, issue the MCP grant.
 *
 * Consent comes before the redirect to Access because every MCP client reaches
 * Access through this one OAuth application (MCP "confused deputy" guidance).
 */

import {
  AuthorizationError,
  CimdFetchError,
  authorizationErrorRedirect,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import {
  AccessOidcError,
  buildAccessAuthorizationUrl,
  createPkcePair,
  exchangeAccessCode,
  readAccessOidcConfig,
  verifyAccessIdToken,
} from "./access-oidc.js";
import { renderConsentPage, renderErrorPage } from "./consent-page.js";
import {
  buildGrant,
  platformForAuthRequest,
  unreservedAgentId,
  type CallbackOptions,
} from "./grant.js";

export { buildGrant, platformForAuthRequest, type AgentIdIssuer, type CallbackOptions, type McpAuthProps } from "./grant.js";

export const AUTHORIZE_PATH = "/authorize";
export const CALLBACK_PATH = "/callback";

const SERVER_NAME = "ASFDK Harness";

/** Environment the handlers need: the provider's helpers plus the ACCESS_* settings. */
export type OAuthHandlerEnv = { OAUTH_PROVIDER: OAuthHelpers };

interface UpstreamData {
  verifier: string;
}

export async function handleAuthorize(request: Request, env: OAuthHandlerEnv): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  try {
    const access = readAccessOidcConfig(env as unknown as Record<string, unknown>);

    if (request.method === "GET") {
      if (!access.ok) return notConfigured(access.missing);
      const authRequest = await oauth.parseAuthRequest(request);
      // describeConsent first: a failed client lookup then leaves nothing in KV.
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      consent.headers.set("Content-Type", "text/html; charset=utf-8");
      const agentIdPlatform = await platformForAuthRequest(oauth, authRequest.clientId, details.clientName);
      return new Response(renderConsentPage(details, consent.handle, SERVER_NAME, { agentIdPlatform }), {
        headers: consent.headers,
      });
    }

    if (request.method === "POST") {
      const form = await request.formData();
      const handle = String(form.get("handle") ?? "");

      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(request, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }

      if (!access.ok) return notConfigured(access.missing);
      // The approved request comes from server-side storage, never from the form.
      const approved = await oauth.approveConsent(request, handle);
      const pkce = await createPkcePair();
      const { state, headers } = await oauth.beginUpstream(approved.request, {
        data: { verifier: pkce.verifier } satisfies UpstreamData,
        headers: approved.headers,
      });
      headers.set(
        "Location",
        buildAccessAuthorizationUrl(access.config, {
          redirectUri: callbackUrl(request),
          state,
          codeChallenge: pkce.challenge,
        }),
      );
      return new Response(null, { status: 302, headers });
    }

    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  } catch (error) {
    return authorizationFailure(error);
  }
}

export async function handleCallback(
  request: Request,
  env: OAuthHandlerEnv,
  options: CallbackOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  }
  const oauth = env.OAUTH_PROVIDER;

  let resumed: Awaited<ReturnType<OAuthHelpers["finishUpstream"]>>;
  try {
    // Checks `state` against this browser's binding cookie; single use.
    resumed = await oauth.finishUpstream<UpstreamData>(request);
  } catch (error) {
    return authorizationFailure(error);
  }

  const { request: original, headers } = resumed;
  const data = resumed.data as UpstreamData;
  const params = new URL(request.url).searchParams;
  const redirectToClient = (code: "access_denied" | "server_error", description: string) => {
    headers.set("Location", authorizationErrorRedirect(original, code, description));
    return new Response(null, { status: 302, headers });
  };

  if (params.get("error")) {
    return redirectToClient("access_denied", "Sign-in with Cloudflare Access was not completed.");
  }
  const code = params.get("code");
  if (!code) {
    return redirectToClient("server_error", "Cloudflare Access returned no authorization code.");
  }

  try {
    const access = readAccessOidcConfig(env as unknown as Record<string, unknown>);
    if (!access.ok) {
      return redirectToClient("server_error", "Cloudflare Access sign-in is not configured.");
    }
    const idToken = await exchangeAccessCode(access.config, {
      code,
      redirectUri: callbackUrl(request),
      codeVerifier: data.verifier,
    });
    const identity = await verifyAccessIdToken(access.config, idToken);

    // The connection is accepted and the person is verified: issue its agent ID
    // (design PR #43 §6.1). One per authorization; agents on this connection
    // tell themselves apart by agentName.
    const platform = await platformForAuthRequest(oauth, original.clientId);
    const agentId = await (options.issueAgentId ?? unreservedAgentId)(platform);
    const { props, metadata } = buildGrant(identity, { agentId, platform });
    const { redirectTo } = await oauth.completeAuthorization({
      request: original,
      // Grant user IDs may not contain ':'.
      userId: encodeURIComponent(identity.sub),
      metadata,
      scope: original.scope,
      props,
    });
    headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    if (error instanceof AccessOidcError) {
      console.warn(`[asfdk-oauth] Cloudflare Access sign-in failed: ${error.message}`);
      return redirectToClient("server_error", "Sign-in with Cloudflare Access could not be verified.");
    }
    throw error;
  }
}

function callbackUrl(request: Request): string {
  return new URL(CALLBACK_PATH, request.url).toString();
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
    },
  });
}

function notConfigured(missing: string[]): Response {
  console.warn(`[asfdk-oauth] Cloudflare Access sign-in is not configured; missing: ${missing.join(", ")}`);
  return htmlResponse(
    renderErrorPage(
      "Sign-in is not set up yet",
      "This MCP server's Cloudflare Access sign-in has not been configured. Ask its administrator to finish the setup.",
    ),
    503,
  );
}

/**
 * Map helper failures to responses, following the provider's guidance:
 * redirect to the client only when the library validated its redirect URI,
 * otherwise render locally. Anything unexpected is a bug or outage → 500.
 */
function authorizationFailure(error: unknown): Response {
  if (error instanceof AuthorizationError && error.redirectTo) {
    return new Response(null, {
      status: 302,
      headers: { Location: error.redirectTo, "Cache-Control": "no-store" },
    });
  }
  if (error instanceof AuthorizationError) {
    return htmlResponse(renderErrorPage("This sign-in link can't be used", error.description), 400);
  }
  if (error instanceof CimdFetchError) {
    return htmlResponse(renderErrorPage("This app could not be verified", "Its client metadata could not be fetched."), 400);
  }
  if (error instanceof AccessOidcError) {
    console.warn(`[asfdk-oauth] ${error.message}`);
    return htmlResponse(renderErrorPage("Sign-in is misconfigured", error.message), 503);
  }
  throw error;
}
