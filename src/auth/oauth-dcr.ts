/**
 * OAuth 2.0 Dynamic Client Registration (DCR) Module
 *
 * This module provides the infrastructure for OAuth 2.0 DCR as defined in RFC 7591.
 * DCR allows clients (agents) to dynamically register themselves with the Metrx auth server
 * and receive OAuth credentials (client_id, client_secret) for subsequent API access.
 *
 * STATUS: STUB — Requires server-side infrastructure
 *
 * The implementation is designed but not yet active because it requires:
 * 1. Metrx web app backend to implement POST /api/oauth/register endpoint
 * 2. OAuth authorization server with scoped token issuance
 * 3. Client credential storage and rotation
 *
 * See: https://tools.ietf.org/html/rfc7591
 */

/**
 * OAuth client registration request (RFC 7591)
 */
export interface OAuthClientRegistrationRequest {
  /** Human-readable name for the client (agent). */
  client_name: string;

  /** Requested OAuth scopes (space-separated).
   * Examples: "read:agents read:costs", "write:alerts", "admin:all"
   */
  scope: string;

  /** Redirect URI (if using authorization code flow). Not needed for agent scenarios. */
  redirect_uris?: string[];

  /** Optional: Grant types this client will use. Defaults to "client_credentials". */
  grant_types?: string[];

  /** Optional: Token endpoint auth method ("client_secret_basic" or "client_secret_post") */
  token_endpoint_auth_method?: 'client_secret_basic' | 'client_secret_post';

  /** Optional: Metadata about the requesting agent */
  metadata?: {
    agent_id?: string;
    organization_id?: string;
    environment?: 'production' | 'staging' | 'development';
  };
}

/**
 * OAuth client registration response (RFC 7591)
 */
export interface OAuthClientRegistrationResponse {
  /** Unique client identifier issued by the authorization server */
  client_id: string;

  /** Client secret (only shown once; store securely) */
  client_secret: string;

  /** Scopes granted to this client */
  scope: string;

  /** Token endpoint auth method used by this client */
  token_endpoint_auth_method: string;

  /** Grant types supported by this client */
  grant_types: string[];

  /** Timestamp when the client was registered */
  issued_at: number;

  /** Timestamp when the client secret expires (optional) */
  expires_in?: number;

  /** Optional: Other metadata echoed from request */
  client_metadata?: Record<string, unknown>;
}

/**
 * Placeholder for OAuth DCR initialization and registration.
 *
 * Currently returns a notice that DCR is not yet implemented.
 * Once the server-side /api/oauth/register endpoint is ready,
 * this can be replaced with actual DCR flow.
 *
 * TODO: Implement when Metrx web app has /api/oauth/register endpoint
 */
export function registerOAuthDCR(): {
  isImplemented: false;
  message: string;
} {
  console.warn(
    'OAuth 2.0 DCR is not yet implemented. ' +
      'The MCP server will continue using API key authentication. ' +
      'DCR support will be enabled once the web app backend is ready.'
  );

  return {
    isImplemented: false,
    message:
      'OAuth DCR not yet implemented — using API key auth. ' +
      'Contact support@metrx.ai to enable OAuth once server-side infrastructure is ready.',
  };
}

/**
 * Placeholder DCR implementation (to be activated when server is ready).
 *
 * This shows the architecture and flow that would be implemented:
 *
 * ```typescript
 * export async function registerOAuthClient(
 *   request: OAuthClientRegistrationRequest,
 *   registrationEndpoint: string = '/api/oauth/register'
 * ): Promise<OAuthClientRegistrationResponse> {
 *   // 1. Validate request
 *   if (!request.client_name || !request.scope) {
 *     throw new Error('client_name and scope are required');
 *   }
 *
 *   // 2. POST to registration endpoint
 *   const response = await fetch(registrationEndpoint, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       client_name: request.client_name,
 *       scope: request.scope,
 *       redirect_uris: request.redirect_uris || [],
 *       grant_types: request.grant_types || ['client_credentials'],
 *       token_endpoint_auth_method: request.token_endpoint_auth_method || 'client_secret_basic',
 *       metadata: request.metadata,
 *     }),
 *   });
 *
 *   if (!response.ok) {
 *     const error = await response.json();
 *     throw new Error(`DCR registration failed: ${error.error_description || error.error}`);
 *   }
 *
 *   // 3. Parse and return client credentials
 *   const registration = (await response.json()) as OAuthClientRegistrationResponse;
 *
 *   // 4. Store client_secret securely (e.g., environment variable, secure vault)
 *   // WARNING: The client_secret is only returned once. Store it immediately.
 *   console.log('Client registered. Store this secret securely:');
 *   console.log(`  METRX_OAUTH_CLIENT_ID=${registration.client_id}`);
 *   console.log(`  METRX_OAUTH_CLIENT_SECRET=${registration.client_secret}`);
 *
 *   return registration;
 * }
 *
 * export async function exchangeOAuthCredentials(
 *   clientId: string,
 *   clientSecret: string,
 *   scope: string,
 *   tokenEndpoint: string = '/oauth/token'
 * ): Promise<{ access_token: string; expires_in: number }> {
 *   // Client credentials flow (RFC 6749)
 *   const response = await fetch(tokenEndpoint, {
 *     method: 'POST',
 *     headers: {
 *       'Content-Type': 'application/x-www-form-urlencoded',
 *       Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
 *     },
 *     body: new URLSearchParams({
 *       grant_type: 'client_credentials',
 *       scope: scope,
 *     }).toString(),
 *   });
 *
 *   if (!response.ok) {
 *     const error = await response.json();
 *     throw new Error(`Token exchange failed: ${error.error_description}`);
 *   }
 *
 *   return response.json();
 * }
 * ```
 */

export const OAUTH_DCR_STATUS = {
  enabled: false,
  reason: 'Awaiting /api/oauth/register endpoint implementation',
  fallbackAuth: 'API key (Bearer token)',
  contact: 'support@metrx.ai for OAuth enablement',
};
