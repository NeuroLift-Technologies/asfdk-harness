import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AccessOidcError,
  base64UrlEncode,
  buildAccessAuthorizationUrl,
  createPkcePair,
  exchangeAccessCode,
  pkceChallenge,
  readAccessOidcConfig,
  secretsMatch,
  verifyAccessIdToken,
  type AccessOidcConfig,
} from "../src/oauth/access-oidc.ts";
import { escapeHtml, renderConsentPage } from "../src/oauth/consent-page.ts";

const TEAM = "https://example-team.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123";
const ENV = {
  ACCESS_CLIENT_ID: "client-123",
  ACCESS_CLIENT_SECRET: "not-a-real-secret",
  ACCESS_AUTHORIZATION_URL: `${TEAM}/authorization`,
  ACCESS_TOKEN_URL: `${TEAM}/token`,
  ACCESS_JWKS_URL: `${TEAM}/jwks`,
};
const NOW = 1_800_000_000;

function config(): AccessOidcConfig {
  const result = readAccessOidcConfig(ENV);
  assert.ok(result.ok);
  return result.config;
}

// ---------------------------------------------------------------------------
// Signing helpers: a real RSA key pair stands in for Cloudflare Access.
// ---------------------------------------------------------------------------

const keyPair = (await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;
const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
const jwks = { keys: [{ ...publicJwk, kid: "key-1", use: "sig", alg: "RS256" }] };

const otherKeyPair = (await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;

const encodeJson = (value: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));

async function signJwt(
  claims: Record<string, unknown>,
  { header = { alg: "RS256", kid: "key-1", typ: "JWT" }, key = keyPair.privateKey }: { header?: Record<string, unknown>; key?: CryptoKey } = {},
): Promise<string> {
  const signingInput = `${encodeJson(header)}.${encodeJson(claims)}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: TEAM,
    aud: ["client-123"],
    sub: "user-uuid-1",
    email: "person@example.com",
    name: "Example Person",
    iat: NOW - 10,
    exp: NOW + 300,
    ...overrides,
  };
}

const jwksFetch = async (url: string) => {
  assert.equal(url, ENV.ACCESS_JWKS_URL);
  return Response.json(jwks);
};

async function rejects(promise: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AccessOidcError, `expected AccessOidcError, got ${String(error)}`);
    assert.match(error.message, pattern);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

test("readAccessOidcConfig derives the Access issuer from the authorization URL", () => {
  assert.equal(config().issuer, TEAM);
});

test("readAccessOidcConfig reports every missing setting", () => {
  const result = readAccessOidcConfig({ ACCESS_CLIENT_ID: "x", ACCESS_TOKEN_URL: "  " });
  assert.equal(result.ok, false);
  assert.deepEqual(!result.ok && result.missing, [
    "ACCESS_CLIENT_SECRET",
    "ACCESS_AUTHORIZATION_URL",
    "ACCESS_TOKEN_URL",
    "ACCESS_JWKS_URL",
  ]);
});

test("readAccessOidcConfig honours ACCESS_ISSUER and needs it when the URL layout is unknown", () => {
  const custom = readAccessOidcConfig({ ...ENV, ACCESS_AUTHORIZATION_URL: "https://idp.example.com/auth" });
  assert.deepEqual(!custom.ok && custom.missing, ["ACCESS_ISSUER"]);

  const overridden = readAccessOidcConfig({ ...ENV, ACCESS_ISSUER: "https://issuer.example.com" });
  assert.ok(overridden.ok);
  assert.equal(overridden.config.issuer, "https://issuer.example.com");
});

test("readAccessOidcConfig refuses plain-http endpoints outside localhost", () => {
  assert.throws(() => readAccessOidcConfig({ ...ENV, ACCESS_TOKEN_URL: "http://idp.example.com/token" }), AccessOidcError);
  const local = readAccessOidcConfig({
    ...ENV,
    ACCESS_AUTHORIZATION_URL: "http://127.0.0.1:9999/oidc/authorization",
    ACCESS_TOKEN_URL: "http://127.0.0.1:9999/oidc/token",
    ACCESS_JWKS_URL: "http://localhost:9999/oidc/jwks",
  });
  assert.ok(local.ok);
});

// ---------------------------------------------------------------------------
// PKCE and the authorization redirect
// ---------------------------------------------------------------------------

test("pkceChallenge matches the RFC 7636 Appendix B test vector", async () => {
  assert.equal(
    await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("createPkcePair returns a 43-char verifier and its challenge", async () => {
  const { verifier, challenge } = await createPkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, await pkceChallenge(verifier));
});

test("buildAccessAuthorizationUrl sends an OIDC code request with PKCE", () => {
  const url = new URL(
    buildAccessAuthorizationUrl(config(), {
      redirectUri: "https://mcp.example.com/callback",
      state: "state-abc",
      codeChallenge: "challenge-xyz",
    }),
  );
  assert.equal(url.origin + url.pathname, ENV.ACCESS_AUTHORIZATION_URL);
  assert.equal(url.searchParams.get("client_id"), "client-123");
  assert.equal(url.searchParams.get("redirect_uri"), "https://mcp.example.com/callback");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("state"), "state-abc");
  assert.equal(url.searchParams.get("code_challenge"), "challenge-xyz");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("client_secret"), null, "the secret never goes through the browser");
});

// ---------------------------------------------------------------------------
// Code exchange
// ---------------------------------------------------------------------------

test("exchangeAccessCode posts the code, verifier and client credentials", async () => {
  let seen: { url: string; body: URLSearchParams } | undefined;
  const idToken = await exchangeAccessCode(
    config(),
    { code: "code-1", redirectUri: "https://mcp.example.com/callback", codeVerifier: "verifier-1" },
    async (url, init) => {
      seen = { url, body: new URLSearchParams(String(init?.body)) };
      return Response.json({ id_token: "header.payload.sig", access_token: "discarded" });
    },
  );
  assert.equal(idToken, "header.payload.sig");
  assert.equal(seen?.url, ENV.ACCESS_TOKEN_URL);
  assert.equal(seen?.body.get("grant_type"), "authorization_code");
  assert.equal(seen?.body.get("code"), "code-1");
  assert.equal(seen?.body.get("code_verifier"), "verifier-1");
  assert.equal(seen?.body.get("client_id"), "client-123");
  assert.equal(seen?.body.get("client_secret"), "not-a-real-secret");
  assert.equal(seen?.body.get("redirect_uri"), "https://mcp.example.com/callback");
});

test("exchangeAccessCode surfaces the OAuth error code but not the response body", async () => {
  await rejects(
    exchangeAccessCode(config(), { code: "c", redirectUri: "https://x/callback", codeVerifier: "v" }, async () =>
      Response.json({ error: "invalid_grant", error_description: "secret-ish detail" }, { status: 400 }),
    ),
    /HTTP 400 \(invalid_grant\)\.$/,
  );
  await rejects(
    exchangeAccessCode(config(), { code: "c", redirectUri: "https://x/callback", codeVerifier: "v" }, async () =>
      Response.json({ access_token: "only" }),
    ),
    /did not include an id_token/,
  );
  await rejects(
    exchangeAccessCode(config(), { code: "c", redirectUri: "https://x/callback", codeVerifier: "v" }, async () => {
      throw new TypeError("network down");
    }),
    /Could not reach/,
  );
});

// ---------------------------------------------------------------------------
// ID token verification
// ---------------------------------------------------------------------------

test("verifyAccessIdToken returns the identity for a valid Access ID token", async () => {
  const identity = await verifyAccessIdToken(config(), await signJwt(validClaims()), {
    fetchImpl: jwksFetch,
    nowSeconds: NOW,
  });
  assert.deepEqual(identity, { sub: "user-uuid-1", email: "person@example.com", name: "Example Person" });
});

test("verifyAccessIdToken accepts a string aud and tolerates small clock skew", async () => {
  const token = await signJwt(validClaims({ aud: "client-123", exp: NOW - 30, iat: NOW + 30 }));
  const identity = await verifyAccessIdToken(config(), token, { fetchImpl: jwksFetch, nowSeconds: NOW });
  assert.equal(identity.sub, "user-uuid-1");
});

test("verifyAccessIdToken rejects tokens for another application", async () => {
  const token = await signJwt(validClaims({ aud: ["some-other-client"] }));
  await rejects(verifyAccessIdToken(config(), token, { fetchImpl: jwksFetch, nowSeconds: NOW }), /aud mismatch/);
});

test("verifyAccessIdToken rejects the wrong issuer and names both issuers", async () => {
  const token = await signJwt(validClaims({ iss: "https://evil.example.com" }));
  await rejects(
    verifyAccessIdToken(config(), token, { fetchImpl: jwksFetch, nowSeconds: NOW }),
    /issuer mismatch: expected https:\/\/example-team.*got https:\/\/evil\.example\.com/,
  );
});

test("verifyAccessIdToken rejects expired and not-yet-valid tokens", async () => {
  await rejects(
    verifyAccessIdToken(config(), await signJwt(validClaims({ exp: NOW - 120 })), { fetchImpl: jwksFetch, nowSeconds: NOW }),
    /expired/,
  );
  await rejects(
    verifyAccessIdToken(config(), await signJwt(validClaims({ exp: undefined })), { fetchImpl: jwksFetch, nowSeconds: NOW }),
    /expired/,
  );
  await rejects(
    verifyAccessIdToken(config(), await signJwt(validClaims({ nbf: NOW + 600 })), { fetchImpl: jwksFetch, nowSeconds: NOW }),
    /not valid yet/,
  );
});

test("verifyAccessIdToken rejects a signature from a different key", async () => {
  const token = await signJwt(validClaims(), { key: otherKeyPair.privateKey });
  await rejects(verifyAccessIdToken(config(), token, { fetchImpl: jwksFetch, nowSeconds: NOW }), /signature is invalid/);
});

test("verifyAccessIdToken rejects a tampered payload", async () => {
  const [header, , signature] = (await signJwt(validClaims())).split(".");
  const forged = `${header}.${encodeJson(validClaims({ sub: "someone-else" }))}.${signature}`;
  await rejects(verifyAccessIdToken(config(), forged, { fetchImpl: jwksFetch, nowSeconds: NOW }), /signature is invalid/);
});

test("verifyAccessIdToken refuses alg=none and HMAC algorithm swaps", async () => {
  const unsigned = `${encodeJson({ alg: "none", kid: "key-1" })}.${encodeJson(validClaims())}.`;
  await rejects(verifyAccessIdToken(config(), unsigned, { fetchImpl: jwksFetch, nowSeconds: NOW }), /RS256/);
  const hs = await signJwt(validClaims(), { header: { alg: "HS256", kid: "key-1" } });
  await rejects(verifyAccessIdToken(config(), hs, { fetchImpl: jwksFetch, nowSeconds: NOW }), /RS256/);
});

test("verifyAccessIdToken rejects unknown key IDs and unreachable JWKS", async () => {
  const token = await signJwt(validClaims(), { header: { alg: "RS256", kid: "rotated-away" } });
  await rejects(verifyAccessIdToken(config(), token, { fetchImpl: jwksFetch, nowSeconds: NOW }), /No Cloudflare Access signing key/);
  await rejects(
    verifyAccessIdToken(config(), await signJwt(validClaims()), {
      fetchImpl: async () => new Response("nope", { status: 500 }),
      nowSeconds: NOW,
    }),
    /Could not load/,
  );
});

test("verifyAccessIdToken rejects malformed tokens and missing subjects", async () => {
  await rejects(verifyAccessIdToken(config(), "not-a-jwt", { fetchImpl: jwksFetch, nowSeconds: NOW }), /not a JWT/);
  await rejects(verifyAccessIdToken(config(), "e30.!!!.sig", { fetchImpl: jwksFetch, nowSeconds: NOW }), /malformed/);
  await rejects(
    verifyAccessIdToken(config(), await signJwt(validClaims({ sub: "" })), { fetchImpl: jwksFetch, nowSeconds: NOW }),
    /no subject/,
  );
});

// ---------------------------------------------------------------------------
// Shared-secret comparison and the consent page
// ---------------------------------------------------------------------------

test("secretsMatch compares secrets exactly", async () => {
  assert.equal(await secretsMatch("token-value", "token-value"), true);
  assert.equal(await secretsMatch("token-valuf", "token-value"), false);
  assert.equal(await secretsMatch("", "token-value"), false);
});

test("renderConsentPage escapes everything the client controls", () => {
  const html = renderConsentPage(
    {
      clientName: `<script>alert("x")</script>`,
      redirectHost: `evil.example.com"><img src=x onerror=alert(1)>`,
      redirectIsLoopback: false,
      scope: [`<b>scope</b>`],
    },
    `handle"><script>`,
    "ASFDK Harness",
  );
  assert.ok(!html.includes("<script>"), "no raw script tags");
  assert.ok(!html.includes("<img"), "no injected elements");
  assert.ok(html.includes(escapeHtml(`<script>alert("x")</script>`)));
  assert.ok(html.includes("This app registered itself"), "unverified clients are labelled");
  assert.ok(html.includes('name="decision" value="approve"'));
  assert.ok(html.includes('name="decision" value="deny"'));
});

test("renderConsentPage warns when tokens go to a local app and shows a verified domain", () => {
  const html = renderConsentPage(
    { clientName: "Claude", clientDomain: "claude.ai", redirectHost: "localhost", redirectIsLoopback: true, scope: [] },
    "h",
    "ASFDK Harness",
  );
  assert.ok(html.includes("app on your computer"));
  assert.ok(html.includes("Published by <strong>claude.ai</strong>"));
});
