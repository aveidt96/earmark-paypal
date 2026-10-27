# Earmark PayPal repository instructions

## Required handoff and change documentation

The user requires every change to be documented continuously.

- Read `HANDOFF-PAYPAL.md` before making changes and use it as the active project
  handoff. The inherited `HANDOFF` file is historical Monad source material.
- Update `HANDOFF-PAYPAL.md` during every work session that changes this repository,
  including application code, dependencies, configuration, tests, scripts,
  documentation and these instructions. Finish the log before the final response.
- Append a dated entry describing the request, every added/modified/deleted/moved
  file, the reason for the changes, behavior or compatibility effects, checks
  actually run and their results, failures/skips, blockers and next steps.
- Group related files when useful, but explicitly identify all affected paths.
  Record documentation-only changes too. Do not log the handoff's own routine
  updates recursively; describe the documentation change once in its entry.
- Keep the current-state summary accurate and preserve earlier chronological
  entries. Correct earlier mistakes explicitly rather than silently changing
  historical outcomes. Distinguish previously recorded results from fresh checks.
- Never put credentials, tokens, private keys, actual secret environment values
  or private customer data in the handoff. Use names and placeholders only.
- Document known limitations honestly. Do not claim deployment, GitHub publication,
  database connectivity or a working payment flow without actual verification.

## Project boundaries

- Work in this repository only. Do not modify the original `../project-flint`
  checkout or its environment, database, deployments or generated files.
- Preserve useful authorization, budget, provider-validation, delivery-inspection,
  idempotency and recovery logic when adapting the legacy EVM implementation.
- PayPal has a server-only Sandbox backend with isolated schema, authorization,
  approval-gated orders/capture, strict webhook verification and read-only recovery.
  A loopback-only allowlisted-owner `/paypal-test` exposes a fixed $10/$6 checkout;
  normal profiles keep it disabled and autonomous agent payment tools remain unwired.
  Task 03D adds a distinct US-merchant campaign on port3031. Task03E/03G's exact
  order/capture permissions are consumed: order 72936380818559054 and capture
  52C23729CU714125M are authoritatively COMPLETED; US ledger is consumed600/
  reserved0/available400 USD minor units. No further payment is authorized.
  Preserve both mandates and the unresolved
  original $6 reservation; an order GET 404 is not non-capture evidence. Original
  order reads require matching original credentials. Human buyer approval is
  mandatory. Mocked tests/order creation alone do not prove capture success.
  Read the active handoff before any future payment execution.
- Deployment, real/Sandbox payment execution and Git publication are not standing
  authorizations; follow the user's explicit instructions for future tasks.
- Follow additional directory-specific instructions, including `web/AGENTS.md`,
  when working in those directories.
