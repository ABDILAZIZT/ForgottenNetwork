# Phase 5: PostgreSQL and real authentication

Status: implementation complete; production credentials and infrastructure required  
Last updated: 2026-09-08

## Delivered

- PostgreSQL pool configuration with bounded connections and TLS controls
- Ordered SQL migration runner with checksums and an advisory lock
- PostgreSQL-backed chunk, entity, asset, ownership, and idempotency operations
- Row locking and expected-version checks for chunk writes
- Transaction rollback and client-release guarantees
- PostgreSQL-backed server sessions
- Secure production cookie defaults (`HttpOnly`, `Secure`, `SameSite=Lax`)
- Provider-neutral OpenID Connect Authorization Code flow with PKCE and state
- Immutable provider-subject account identity and login-time profile refresh
- Publishing suspension enforcement on every authenticated request
- Read-only visitor controls in the frontend
- Sign-in, sign-out, session restoration, and named account status
- Development JSON storage and bearer-token fallback retained outside production

## Local PostgreSQL setup

Start the included database if Docker is installed:

```bash
docker compose up -d postgres
```

Set the server environment:

```env
DATABASE_URL=postgresql://forgotten_network:local-development-password@localhost:5432/forgotten_network
DATABASE_SSL=false
SESSION_SECRET=replace-with-at-least-32-random-characters
MIGRATE_ON_START=true
```

Alternatively run migrations as a release step:

```bash
pnpm --dir server migrate
```

The API selects PostgreSQL whenever `DATABASE_URL` is present. Without it, local development and automated tests continue using `server/db.json`.

## OpenID Connect setup

Create a regular confidential web application in the selected identity provider and configure:

```env
APP_ORIGIN=https://your-domain.example
OIDC_ISSUER_URL=https://your-provider.example
OIDC_CLIENT_ID=provider-client-id
OIDC_CLIENT_SECRET=provider-client-secret
SESSION_SECRET=at-least-32-random-characters
```

Register this exact callback URL:

```text
https://your-domain.example/api/v1/auth/callback
```

Production requires HTTPS. The application uses server-side sessions; provider tokens are not exposed to the React application.

## Production startup order

1. Provision PostgreSQL and inject secrets through the hosting platform.
2. Run `pnpm --dir server migrate` as a release command.
3. Start the API with `NODE_ENV=production`.
4. Build the client with `VITE_WORLD_MODE=remote` and `VITE_API_BASE_URL=/api/v1`.
5. Verify `/api/v1/health/ready` returns `storage: postgresql` before sending traffic.

## Security boundaries

- `DEV_AUTH_TOKEN` is ignored by the PostgreSQL authorization path in production.
- Production startup fails without a strong session secret and database-backed session store.
- Return URLs are restricted to same-origin paths.
- Session IDs are stored only in signed, HTTP-only cookies.
- Every request reloads role and publishing-suspension state from PostgreSQL.
- Ownership comes from the authenticated actor, never request payloads.

## Remaining infrastructure work

Phase 5 supplies the production code boundaries but cannot provision third-party accounts or credentials from the repository. Before launch, the operator must create the PostgreSQL database and OIDC application, configure HTTPS/DNS, and run a staging login and backup/restore rehearsal.
