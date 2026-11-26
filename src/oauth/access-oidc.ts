/**
 * Cloudflare Access for SaaS (OIDC) as the upstream identity provider for the
 * MCP server's OAuth flow.
 *
 * The Worker is the OAuth authorization server for MCP clients
 * (@cloudflare/workers-oauth-provider). It does not know who the user is, so its
 * /authorize page sends the browser to a Cloudflare Access for SaaS OIDC
 * application, which applies the Zero Trust policies (who may sign in, MFA,
 * device posture) and returns an ID token for the signed-in user.
 *
 * This module is platform-neutral (fetch + WebCrypto only) so it can be unit
 * tested under Node and run unchanged in the Worker.
 */

/** Settings for the Access for SaaS OIDC application (Zero Trust → Access → Applications → SaaS). */
export interface AccessOidcConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  /** Expected `iss` claim on Access ID tokens. */
  issuer: string;
}

/** The identity Cloudflare Access vouched for. */
export interface AccessIdentity {
  /** Stable Access user ID (`sub` claim). */
  sub: string;
  email?: string;
  name?: string;
}

/** Environment variable names read by {@link readAccessOidcConfig}. */
export const ACCESS_OIDC_ENV_KEYS = [
  "ACCESS_CLIENT_ID",
  "ACCESS_CLIENT_SECRET",
  "ACCESS_AUTHORIZATION_URL",
  "ACCESS_TOKEN_URL",
  "ACCESS_JWKS_URL",
] as const;

/** Scopes requested from Access. Only identity claims; no Access API access is requested. */
export const ACCESS_OIDC_SCOPES = ["openid", "email", "profile"] as const;

/** Allowed clock skew when checking `exp`, `nbf` and `iat`. */
const CLOCK_SKEW_SECONDS = 60;

/**
 * A sign-in failure whose message is safe to log and show: it never contains a
 * token, code, or secret.
 */
export class AccessOidcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessOidcError";
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Read the Access OIDC settings from the Worker environment.
 *
 * Returns the names of missing settings instead of throwing, so /authorize can
 * answer with a clear "not configured" page rather than a 500.
 *
 * `ACCESS_ISSUER` is optional: by default it is the authorization URL without
 * its trailing `/authorization`, which is how Access for SaaS lays out its OIDC
 * endpoints (`https://<team>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<client_id>`).
 */
export function readAccessOidcConfig(
  env: Record<string, unknown>,
): { ok: true; config: AccessOidcConfig } | { ok: false; missing: string[] } {
  const read = (key: string): string | undefined => {
    const value = env[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  const missing: string[] = ACCESS_OIDC_ENV_KEYS.filter((key) => !read(key));
  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const authorizationUrl = read("ACCESS_AUTHORIZATION_URL")!;
  const issuer = read("ACCESS_ISSUER") ?? deriveIssuer(authorizationUrl);
  if (!issuer) {
    return { ok: false, missing: ["ACCESS_ISSUER"] };
  }

  const config: AccessOidcConfig = {
    clientId: read("ACCESS_CLIENT_ID")!,
    clientSecret: read("ACCESS_CLIENT_SECRET")!,
    authorizationUrl,
    tokenUrl: read("ACCESS_TOKEN_URL")!,
    jwksUrl: read("ACCESS_JWKS_URL")!,
    issuer,
  };

  const insecure = [config.authorizationUrl, config.tokenUrl, config.jwksUrl, config.issuer].filter(
    (value) => !isSecureUrl(value),
  );
  if (insecure.length > 0) {
    throw new AccessOidcError(
      "Cloudflare Access OIDC URLs must use https (http is allowed only for localhost).",
    );
  }

  return { ok: true, config };
}

function deriveIssuer(authorizationUrl: string): string | undefined {
  const suffix = "/authorization";
  try {
    const url = new URL(authorizationUrl);
    if (!url.pathname.endsWith(suffix)) return undefined;
    return `${url.origin}${url.pathname.slice(0, -suffix.length)}`;
  } catch {
    return undefined;
  }
}

function isSecureUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Authorization request (browser → Access)
// ---------------------------------------------------------------------------

/** Create an RFC 7636 PKCE verifier and its S256 challenge. */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge: await pkceChallenge(verifier) };
}

/** The S256 code challenge for a PKCE verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/** The Access authorization URL to send the browser to. */
export function buildAccessAuthorizationUrl(
  config: AccessOidcConfig,
  params: { redirectUri: string; state: string; codeChallenge: string },
): string {
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ACCESS_OIDC_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// ---------------------------------------------------------------------------
// Code exchange (Worker → Access, back channel)
// ---------------------------------------------------------------------------

/**
 * Exchange the authorization code Access returned for an ID token.
 * Only the ID token is kept; the Access access token is discarded.
 */
export async function exchangeAccessCode(
  config: AccessOidcConfig,
  params: { code: string; redirectUri: string; codeVerifier: string },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: params.codeVerifier,
  });

  let response: Response;
  try {
    response = await fetchImpl(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
  } catch {
    throw new AccessOidcError("Could not reach the Cloudflare Access token endpoint.");
  }

  const payload = (await response.json().catch(() => undefined)) as
    | { id_token?: unknown; error?: unknown }
    | undefined;

  if (!response.ok) {
    const code = typeof payload?.error === "string" ? ` (${payload.error.slice(0, 64)})` : "";
    throw new AccessOidcError(
      `Cloudflare Access rejected the code exchange with HTTP ${response.status}${code}.`,
    );
  }
  if (typeof payload?.id_token !== "string" || !payload.id_token) {
    throw new AccessOidcError("Cloudflare Access token response did not include an id_token.");
  }
  return payload.id_token;
}

// ---------------------------------------------------------------------------
// ID token verification
// ---------------------------------------------------------------------------

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
}

interface AccessIdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
  email?: unknown;
  name?: unknown;
}

interface Jwk {
  kty?: string;
  kid?: string;
  n?: string;
  e?: string;
  use?: string;
}

/**
 * Verify an Access ID token: RS256 signature against the application's JWKS,
 * issuer, audience (the client ID), and expiry. Returns the user's identity.
 */
export async function verifyAccessIdToken(
  config: AccessOidcConfig,
  idToken: string,
  options: { fetchImpl?: FetchLike; nowSeconds?: number } = {},
): Promise<AccessIdentity> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new AccessOidcError("Access ID token is not a JWT.");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
  const header = decodeJsonSegment<JwtHeader>(encodedHeader, "header");
  const claims = decodeJsonSegment<AccessIdTokenClaims>(encodedPayload, "payload");

  if (header.alg !== "RS256") {
    throw new AccessOidcError("Access ID token must be signed with RS256.");
  }

  const key = await loadVerificationKey(config.jwksUrl, header.kid, fetchImpl);
  let signature: Uint8Array;
  try {
    signature = base64UrlDecode(encodedSignature);
  } catch {
    throw new AccessOidcError("Access ID token signature is malformed.");
  }
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) {
    throw new AccessOidcError("Access ID token signature is invalid.");
  }

  if (claims.iss !== config.issuer) {
    // Issuers are public identifiers, so naming both helps fix a misconfiguration.
    throw new AccessOidcError(
      `Access ID token issuer mismatch: expected ${config.issuer}, got ${String(claims.iss)}. ` +
        "Set ACCESS_ISSUER if your Access application uses a different issuer.",
    );
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.clientId)) {
    throw new AccessOidcError("Access ID token was not issued for this application (aud mismatch).");
  }

  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) {
    throw new AccessOidcError("Access ID token has expired.");
  }
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_SECONDS > now) {
    throw new AccessOidcError("Access ID token is not valid yet.");
  }
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_SECONDS > now) {
    throw new AccessOidcError("Access ID token was issued in the future.");
  }

  if (typeof claims.sub !== "string" || !claims.sub) {
    throw new AccessOidcError("Access ID token has no subject.");
  }

  return {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    name: typeof claims.name === "string" ? claims.name : undefined,
  };
}

async function loadVerificationKey(
  jwksUrl: string,
  kid: unknown,
  fetchImpl: FetchLike,
): Promise<CryptoKey> {
  let keys: Jwk[];
  try {
    const response = await fetchImpl(jwksUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { keys?: unknown };
    keys = Array.isArray(body.keys) ? (body.keys as Jwk[]) : [];
  } catch {
    throw new AccessOidcError("Could not load the Cloudflare Access signing keys (JWKS).");
  }

  const rsaKeys = keys.filter((key) => key.kty === "RSA" && key.n && key.e && key.use !== "enc");
  const jwk =
    typeof kid === "string"
      ? rsaKeys.find((key) => key.kid === kid)
      : rsaKeys.length === 1
        ? rsaKeys[0]
        : undefined;
  if (!jwk) {
    throw new AccessOidcError("No Cloudflare Access signing key matches the ID token.");
  }

  // Import only the public modulus and exponent so stray JWK fields cannot change the algorithm.
  return crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

function decodeJsonSegment<T>(segment: string, label: string): T {
  try {
    const value = JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
    if (value && typeof value === "object" && !Array.isArray(value)) return value as T;
  } catch {
    /* fall through */
  }
  throw new AccessOidcError(`Access ID token ${label} is malformed.`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new Error("invalid base64url");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Constant-time comparison of two secrets. Both sides are hashed first so the
 * comparison length (and timing) does not depend on the presented value.
 */
export async function secretsMatch(presented: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(presented)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}
