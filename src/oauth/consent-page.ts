/**
 * HTML for the MCP OAuth consent page and its error page.
 *
 * Every value that came from the MCP client (name, domain, redirect host,
 * scopes) is attacker-chosen through dynamic registration or a Client ID
 * Metadata Document, so all of it is escaped before rendering.
 */

/** The facts a consent page must show (a structural subset of the provider's `ConsentDescription`). */
export interface ConsentDetails {
  clientName: string;
  /** Verified domain of a Client ID Metadata Document client; absent for self-registered clients. */
  clientDomain?: string;
  /** Hostname the authorization code and tokens will be sent to. */
  redirectHost: string;
  /** True when tokens go to an app on the user's own machine (localhost). */
  redirectIsLoopback: boolean;
  scope: string[];
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

const PAGE_STYLE = `
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.5;
         max-width: 34rem; margin: 3rem auto; padding: 0 1.25rem; }
  h1 { font-size: 1.35rem; margin-bottom: 0.75rem; }
  .card { border: 1px solid #8884; border-radius: 0.75rem; padding: 1rem 1.25rem; margin: 1rem 0; }
  .warn { border-color: #c80; background: #c8801a14; }
  ul { padding-left: 1.25rem; }
  .actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
  button { font: inherit; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: 1px solid #8888;
           cursor: pointer; background: transparent; color: inherit; }
  button.primary { background: #2f6fde; border-color: #2f6fde; color: #fff; }
  small { opacity: 0.75; }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export interface ConsentPageOptions {
  /** Platform part of the agent ID this connection will be issued (for example `claude`). */
  agentIdPlatform?: string;
}

/** The consent page. `handle` is the single-use value from `beginConsent()`. */
export function renderConsentPage(
  details: ConsentDetails,
  handle: string,
  serverName: string,
  options: ConsentPageOptions = {},
): string {
  const name = escapeHtml(details.clientName);
  const origin = details.clientDomain
    ? `Published by <strong>${escapeHtml(details.clientDomain)}</strong>.`
    : "This app registered itself, so its name is not verified.";

  // This server defines no scopes of its own; show what the client asked for so nothing is hidden.
  const scopes =
    details.scope.length > 0
      ? `<p>It asked for these scopes:</p><ul>${details.scope
          .map((scope) => `<li><code>${escapeHtml(scope)}</code></li>`)
          .join("")}</ul>`
      : "";

  // The ID itself is issued after sign-in, so only its platform part is known here.
  const agentIdNotice = options.agentIdPlatform
    ? `<p>This connection will be issued its own agent ID, <code>${escapeHtml(options.agentIdPlatform)}-</code> followed by a
       random code, when you finish signing in. Agents on this connection use it to take part in the ASFDK A2A hub.</p>`
    : "";

  const loopbackWarning = details.redirectIsLoopback
    ? `<div class="card warn"><strong>This sends access to an app on your computer.</strong>
       Continue only if you just started connecting from it.</div>`
    : "";

  return page(
    `Connect ${details.clientName} to ${serverName}`,
    `<h1>Allow <strong>${name}</strong> to use ${escapeHtml(serverName)}?</h1>
<div class="card">
  <p>${origin}</p>
  <p>Access will be sent to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
  ${scopes}
  ${agentIdNotice}
</div>
${loopbackWarning}
<p>If you allow it, you'll sign in with Cloudflare Access next. You can revoke access by disconnecting the app.</p>
<form method="post">
  <input type="hidden" name="handle" value="${escapeHtml(handle)}">
  <div class="actions">
    <button class="primary" type="submit" name="decision" value="approve">Allow</button>
    <button type="submit" name="decision" value="deny">Deny</button>
  </div>
</form>`,
  );
}

/** A local error page, for failures where redirecting back to the client is not safe. */
export function renderErrorPage(title: string, message: string): string {
  return page(
    title,
    `<h1>${escapeHtml(title)}</h1>
<div class="card"><p>${escapeHtml(message)}</p></div>
<p><small>Start connecting again from your MCP client.</small></p>`,
  );
}
