# Task 03A — applied Sandbox migration and PostgreSQL verification

Session: **2026-10-26**. Outcome: **complete**.

## Migration result and safety

The user explicitly authorized the migration on the verified dedicated Earmark
PayPal Sandbox database. The existing `scripts/paypal-migrate.ts --apply` runner
successfully committed the migration and checksum history in one transaction.
The exact SQL file was not changed. Applied SHA-256:

```text
eaa2680ae6a842456989b3895b944b73d4e1fd551a5ee66161ed836c42ba21ad
```

Preflight loaded `web/.env.local` and verified Sandbox mode, the intended direct
connection, alias/pooled target consistency, verified client TLS, database identity,
no original Earmark markers, and no existing `earmark_paypal` schema. The runner
rechecks identity and namespace absence under its transaction/advisory lock and
now rejects reapplication. Exceptions roll back; error reporting omits credentials.

No unrelated objects were altered or deleted. No connection string, host, username,
password or customer record was printed. The original repository was not modified.

## Actual structure verified

`scripts/paypal-db-verify.ts` independently reads PostgreSQL catalogs, column
types, environment records, migration history and row counts in a read-only
transaction. It does not rely on migration success output.

Eight tables exist in `earmark_paypal`:

- `schema_migrations`, `environment`
- `mandates`, `approved_merchants`, `attempts`
- `idempotency`, `webhook_events`, `audit`

Verified: **16 valid indexes; 8 primary keys; 6 unique constraints; 6 foreign keys;
21 CHECK constraints; 7 enabled application triggers; 6 PL/pgSQL functions**.
All constraints are validated. Both ledger triggers are initially deferred.
Exact `numeric(20,0)` spending counters, ACTIVE/REVOKED/CLOSED mandate states,
immutable financial terms/request IDs and append-only audit protections are present.
The Sandbox environment/version and version-1 checksum history match the approved SQL.

After all tests, persistent financial/audit tables still have **zero rows**; only
`environment` and `schema_migrations` contain one seed/history row each. There are
**zero disposable test schemas remaining** and **zero unrelated user tables**.

## Real PostgreSQL tests

All four previously skipped cases ran successfully, with four additional cases:
**8 real PostgreSQL tests passed**.

Each run creates a generated `earmark_paypal_test_<random UUID>` namespace using a
namespace-only copy of the unchanged migration. A test-only pool routes repository
SQL to that namespace without rewriting data parameters. Cleanup checks the exact
session-created name, owner and namespace OID before removing it. Persistent
`earmark_paypal` objects are never fixture write or cleanup targets.

Verified behaviors:

1. Ten concurrent 600-unit requests against a 1,000-unit cap admit exactly one
   reservation; the other nine fail with budget exhaustion.
2. Raw counter drift and cap violations fail real deferred/CHECK constraints and
   roll back without leaving accounting drift.
3. Concurrent duplicate intents through separate repositories reserve once;
   cancellation restores budget, confirmed capture consumes once, and durable
   idempotency/audit records exist.
4. Triggers reject policy edits, request-ID substitution and audit deletion.
5. Revocation rejects new reservations/captures, preserves in-flight obligations,
   permits trusted terminal reconciliation and cannot be undone.
6. Ambiguous create/capture and PENDING states retain reservations; retries never
   submit another operation; terminal reconciliation consumes once.
7. Concurrent capture callers share one durable claim and one mock capture call.
8. Confirmed rejection releases once; terminal financial records cannot reopen.

**Locks, transactions, triggers, constraints and concurrency were real PostgreSQL.**
PayPal transport remained mocked. These tests did not initiate a PayPal payment or
prove real provider integration.

## Regression results

`npm run paypal:test:db:all` executes the full root test command with isolated Neon
coverage enabled and payment/Sandbox-network/legacy-database activity disabled.

- Solidity: **176 passed**.
- Agent: **140 passed**.
- Web: **286 passed**, including the eight database cases; **6 skipped**.
- **Workspace total: 602 passed, 6 skipped.**
- Additional Node recovery/funding fixtures: **21 passed**.
- Additional read-only Gemini fixture cases: **4 passed**.
- **Combined distinct tests: 627 passed, 6 skipped**; repeat runs are not double-counted.
- Skips: five inherited Monad PostgreSQL cases and one opt-in Sandbox OAuth check.
- Agent/web/API TypeScript and strict standalone operational-script checks passed.
- Biome warnings-as-errors, Foundry formatting and production build passed.
- Dependency audit reported **zero vulnerabilities**.
- Read-only browser smoke passed seven routes, four original scenarios and mobile
  layout; external services/browser mutations were blocked.
- Browser boundary and actual database credential-value scan passed for **43 chunks**.
- Original HEAD, refs, status, diff and **305 source file hashes** match the baseline.

No migration or test failed. The first isolated test run emitted duplicate
test-client listener warnings; a WeakSet guard fixed the listener lifecycle and
the full rerun passed without that warning. One combined read-only post-check hit
its terminal timeout after printing successful catalog verification; the standalone
inspector rerun succeeded and reports `PAYPAL_DATABASE_ALREADY_MIGRATED`.
Inherited Solidity timestamp/loop notices remain. No contract or payment-runtime
logic was changed for this task.

## File changes

- Added `scripts/paypal-db-safety.ts`: approved checksum/target/TLS/isolation guards.
- Updated `scripts/paypal-migrate.ts`: same-connection checks, checksum pin,
  transaction and sanitized commit/rollback evidence.
- Added `scripts/paypal-db-verify.ts`: independent applied-schema/readiness verification.
- Added `scripts/paypal-db-test.ts`: explicit isolated Neon/full regression launcher.
- Added `web/test/fixtures/paypal-database.ts`: disposable namespace routing,
  sanitized errors and session-owned cleanup.
- Updated `web/test/paypal-database.integration.test.ts`: original four cases plus
  four additional real accounting/concurrency cases.
- Updated `scripts/paypal-db-inspect.ts`: actual installed-migration status.
- Updated `package.json`: verifier and real database test commands.
- Updated `README.md`, `docs/paypal-integration.md`, `docs/paypal-backend.md` and
  `HANDOFF-PAYPAL.md`; added this report.

No migration SQL, credential values, dependency versions, UI, agent tools or
original Earmark code/database was changed. Ignored build/test artifacts and
browser screenshots were regenerated in this checkout only.

## Readiness and remaining work

**The database is ready for controlled real PayPal Sandbox API testing.** Current
server configuration has no PayPal client ID, client secret, webhook ID or merchant
ID. Backend/payment execution flags remain disabled. No actual payment/API flow
has been verified.

Configure those server-only Sandbox settings, validate account/seller capability
and API responses, integrate verified owner identity and buyer approval, and obtain
separate authorization before executing payments. Standard Orders checkout needs
payer approval; no unattended payment capability is claimed. Financial HTTP routes
and autonomous agent payment tools remain unwired.

No PayPal Live access, AWS/Vercel deployment, commit or push was performed.

## Commands

```powershell
# Read-only verification of the applied schema:
npm run paypal:db:verify

# Eight real PostgreSQL cases in a disposable schema:
npm run paypal:test:db

# Full regression with isolated real PostgreSQL coverage:
npm run paypal:test:db:all
```

Ordinary `npm test` remains external-database-disabled unless explicitly opted in.
Do not rerun `--apply` against the installed schema; use the verifier. Future
schema changes require new versioned migrations and approval.
