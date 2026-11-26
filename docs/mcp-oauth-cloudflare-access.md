# MCP OAuth with Cloudflare Access

The Worker's `/mcp` endpoint accepts OAuth 2.1 access tokens. MCP clients (Claude, Cursor, Zed, OpenCode, and others) discover the sign-in flow on their own. People sign in with **Cloudflare Access**, so your Zero Trust policies decide who gets in.

```
MCP client ──OAuth 2.1 + PKCE──▶ Worker (@cloudflare/workers-oauth-provider)
                                   │  /authorize: consent page
                                   ▼
                     Cloudflare Access for SaaS (OIDC) ── Zero Trust policies
                                   │  ID token (who signed in)
                                   ▼
                     Worker issues an MCP access token bound to https://<worker>/mcp
```

## Routes

| Path | Served by | Protected by |
|---|---|---|
| `/mcp` | MCP server | OAuth access token (or the legacy `ASFDK_API_TOKEN`) |
| `/authorize` | consent page, then redirect to Access | Cloudflare Access sign-in |
| `/callback` | Access returns here; ID token verified | single-use, browser-bound `state` |
| `/token`, `/register` | OAuth provider (token, refresh, revocation, Dynamic Client Registration) | OAuth client rules |
| `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server` | discovery metadata | public |
| `/agents/*` | Think governance agent | `ASFDK_API_TOKEN` (unchanged) |

## One-time setup

### 1. Create an Access for SaaS application (OIDC)

Zero Trust dashboard → **Access controls → Applications → Add an application → SaaS**.

1. Application: type a name, for example `ASFDK Harness MCP`. Authentication protocol: **OIDC**.
2. **Redirect URL:** `https://asfdk-governance-agent.joshdorsey.workers.dev/callback`. If you later add a custom domain, add `https://<custom-domain>/callback` too.
3. Scopes: `openid`, `email`, `profile`.
4. Leave PKCE on (the Worker always sends a PKCE challenge, plus the client secret).
5. Policies: attach the policy you want, for example the existing **Cloudflare account members** policy.
6. Save, then copy these values from the application's page: **Client ID**, **Client secret**, **Authorization endpoint**, **Token endpoint**, **Key endpoint** (JWKS).

Use the endpoints Cloudflare One shows for this SaaS app, not the ones from your upstream identity provider.

### 2. Make the OAuth paths public in the self-hosted Access application

The **`asfdk-governance-agent - Cloudflare Workers`** self-hosted application covers the whole Worker. MCP clients can't sign in through an Access login page, so the OAuth and MCP paths need to bypass it. They are still protected. `/mcp` needs an OAuth access token, or the legacy `ASFDK_API_TOKEN` while that secret is set (see [Legacy static token](#legacy-static-token)). The sign-in itself goes through the SaaS app.

Done on 2026-11-26: the app's Worker destination has **public overrides** for these paths only:

```
/mcp   /mcp/*   /authorize   /callback   /token   /register
/.well-known/oauth-protected-resource     /.well-known/oauth-protected-resource/*
/.well-known/oauth-authorization-server   /.well-known/oauth-authorization-server/*
```

Everything else, including `/agents/*`, `/` and any path added later, stays behind Access. To change the list: Zero Trust → Access controls → Applications → the self-hosted app → destination → path overrides. You can also use the API (`destinations[].overrides`).

### 3. Set the Worker secrets

```bash
npx wrangler secret put ACCESS_CLIENT_ID
npx wrangler secret put ACCESS_CLIENT_SECRET
npx wrangler secret put ACCESS_AUTHORIZATION_URL   # …/cdn-cgi/access/sso/oidc/<client_id>/authorization
npx wrangler secret put ACCESS_TOKEN_URL           # …/cdn-cgi/access/sso/oidc/<client_id>/token
npx wrangler secret put ACCESS_JWKS_URL            # …/cdn-cgi/access/sso/oidc/<client_id>/jwks
npx wrangler secret put RRT_BEHAVIORAL_TOKEN_KEY   # openssl rand -hex 32 — required, see below
```

The non-secret values (`ACCESS_CLIENT_ID` and the three URLs) can also be plain-text variables set in the dashboard. `wrangler.jsonc` sets `keep_vars: true` so deploys keep them.

Optional: `ACCESS_ISSUER`. By default the expected ID-token issuer is the authorization URL without `/authorization`. Set it only if sign-in fails with an "issuer mismatch" message in the Worker logs; that message names the issuer Access actually sent.

**`RRT_BEHAVIORAL_TOKEN_KEY` is required for the Worker to start.** `@neurolift-technologies/rrt-advocate@0.1.1` generates a random HMAC key at module load when this variable is unset. The Workers runtime forbids that, so without the secret the Worker fails to start and `wrangler deploy` is rejected. This is the case on `main` too, not only with OAuth. A fixed key also keeps behavioral hashing consistent across Worker isolates. The lasting fix is upstream in rrt-advocate (generate the key lazily).

### 4. Deploy

The repository is connected to the Worker through **Workers Builds** (production branch `main`). Merging to `main` runs `npm ci`, then `npm run build`, then `npm run cf:deploy`. `package.json` pins `"packageManager": "npm@11.21.3"` because npm 10, the build image's default, rejects this lockfile with ERESOLVE.

To deploy by hand instead:

```bash
npm ci            # npm 11; on npm 10 use: npm ci --force
npm run cf:typegen
npm test
npm run cf:deploy
```

Grants, tokens and registered clients live in the `OAUTH_KV` namespace (`asfdk-governance-OAUTH`, pinned by `id` in `wrangler.jsonc`). Tokens are stored only as hashes, and grant props are encrypted.

## Connecting a client

Point the client at `https://asfdk-governance-agent.joshdorsey.workers.dev/mcp` and remove any `Authorization` header from its config. On first use the client opens a browser:

1. A consent page names the client and where access will be sent. Choose **Allow**.
2. Sign in with Cloudflare Access.
3. The browser hands control back to the client, which now has a token.

### When the Access policy is checked

The Access policy is checked **only when someone signs in** through `/authorize`. After that:

- Access tokens last 1 hour. The client refreshes them from the stored grant without going back to Access.
- A grant lasts **7 days from sign-in**, however often it is refreshed. That matches the Access application's 168h session. When it ends, the client asks the person to sign in again, and the policy is checked again.

So **someone removed from the Access policy keeps MCP access until their grant expires**, up to 7 days after their last sign-in. To cut them off sooner, delete their keys in the `OAUTH_KV` namespace:

- `grant:<user-id>:…`
- `token:<user-id>:…`

`<user-id>` is their Cloudflare Access user ID (the ID token's `sub`), URL-encoded. Every access token is checked against `OAUTH_KV`, so this takes effect within about a minute (KV propagation).

The legacy static token isn't tied to a person. To cut off its holders, rotate or delete `ASFDK_API_TOKEN`.

## Legacy static token

Clients already configured with `Authorization: Bearer <ASFDK_API_TOKEN>` (see `docs/opencode-setup-complete.md`, `docs/zed-setup-complete.md`, `docs/codex-claude-setup-complete.md`) keep working on `/mcp`. To make `/mcp` OAuth-only, remove that support in `resolveExternalToken` in `src/server.ts`. Deleting the secret would also lock `/agents/*`.

## Local development

`wrangler dev` serves everything on `http://localhost:8787`. Copy `.dev.vars.example` to `.dev.vars` and fill it in. Plain `http` is accepted only for loopback hosts. A local sign-in needs a SaaS app with `http://localhost:8787/callback` as an extra redirect URL.

## Where the code is

- `src/server.ts`: `OAuthProvider` wiring (routes, token lifetimes, DCR + CIMD, legacy token).
- `src/oauth/access-handler.ts`: `/authorize` (consent) and `/callback` (Access sign-in).
- `src/oauth/access-oidc.ts`: PKCE, Access authorization URL, code exchange, ID-token verification (RS256 via JWKS, `iss`, `aud`, `exp`).
- `src/oauth/consent-page.ts`: consent and error pages; everything the client controls is escaped.
- `test/oauth-access.test.ts`: unit tests.
