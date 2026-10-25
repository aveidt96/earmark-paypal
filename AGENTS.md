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
- PayPal currently has preparation-only configuration and a read-only status
  endpoint. No PayPal payments are implemented or verified.
- Deployment, real/Sandbox payment execution and Git publication are not standing
  authorizations; follow the user's explicit instructions for future tasks.
- Follow additional directory-specific instructions, including `web/AGENTS.md`,
  when working in those directories.
