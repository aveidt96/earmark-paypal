# Earmark PayPal brand identity

The migrated application's public name is **Earmark PayPal**, for the PayPal AI
Hackathon. The crystal asset, glass dashboard, themes and product terminology are
preserved. Metadata, navigation, social preview and footer identify the new app.
The application labels PayPal Sandbox integration as preparation-only and the
existing wallet controls/payment records as legacy EVM functionality. No PayPal
payment capability is claimed. Stable internal protocol identifiers remain intact.

## Original Earmark brand reference

Approved in Stage 6.5, 9 October 2026.

- **Name:** Earmark
- **Tagline:** Every payment has a purpose.
- **Category:** Onchain financial authorization for autonomous AI agents.
- **Design:** preserve the existing light-blue liquid-glass workspace and layout.

## Approved artwork

Source: user-supplied Faceted Blue Crystal Arch Emblem.png.
The repository copy is web/public/brand/earmark-crystal.png, unchanged from the
approved original (1536 × 1024 PNG). Source SHA-256: 97a0f8e2207136144d088d7731cae51cadd61976cbe7124c550e079fc9be8d49.

Standard usage pairs the crystal with the Earmark wordmark. Compact usage shows
the crystal alone with an accessible Earmark label. Next image optimization serves
the navbar; CSS scales/centers the original image within its rounded white frame.
Native Next ImageResponse renders the 32 × 32 favicon, 180 × 180 Apple icon and
1200 × 630 social preview from this original, without redrawing or recoloring it.
The square icon crops empty side margins without cutting the crystal.
No new image model, asset subscription or paid service is used.

## Official homepage copy

### Give AI agents money with purpose.

Empower autonomous agents to purchase services, complete tasks, and make payments
within permissions you control. Every transaction is governed by task-specific
mandates and protected by onchain escrow.

Primary action: **Create a Mandate**. Secondary action: **Explore How It Works**.

### AI makes decisions. Earmark enforces boundaries.

Agents choose how to accomplish tasks. You decide what they can spend, who they
can pay, and when their authority expires.

### How It Works

1. **Define the Task:** Describe what your AI agent needs to accomplish.
2. **Set the Boundaries:** Specify its budget, approved providers, and authorization period.
3. **Let the Agent Work:** Your agent evaluates providers and requests payments autonomously.
4. **Protect the Payment:** Smart contracts validate spending permissions and hold authorized funds in escrow.
5. **Settle on Delivery:** Delivery is inspected and accepted. Payment settles after the challenge period if no valid dispute is raised.

### Core features

- **Task-Scoped Mandates:** Give agents financial authority for specific jobs—not unrestricted access to your money.
- **Onchain Spending Controls:** Budgets, provider restrictions, and expiration rules are enforced by smart contracts.
- **Delivery-Conditional Escrow:** Authorized payments remain protected until the required delivery and settlement conditions are satisfied.
- **Autonomous Execution:** Agents can discover approved providers, compare offers, and initiate permitted payments without constant supervision.
- **Real-Time Transparency:** Follow agent decisions, authorization checks, escrow states, and confirmed transactions.
- **Owner Control:** Revoke mandates, manage available funds, and challenge unsettled payments during the permitted window.

The complete feature copy and explanation are available in the How It Works dialog,
keeping the functional homepage spacious.

### What happens when an AI agent makes the wrong decision?

Earmark does not rely on the AI to enforce its own financial permissions.
The smart contract independently checks every payment request against the owner's
authorized mandate.

The **Explore Security Demos** action opens an honest explanation of existing local
test coverage and links to the Stage 7 local Security Demos viewer.
Mock behavior, backend blocks and onchain reverts are labelled separately; no successful injection is fabricated.

### Footer

**Earmark**

Purpose-bound payments for autonomous agents.

Built on Monad.

_All hackathon demonstration payments use testnet assets._

The footer additionally identifies the current environment as Local Anvil, mock
USDC and simulated services; it does not claim a Monad deployment.

## Product terminology

| Surface              | Approved label       |
| -------------------- | -------------------- |
| Main dashboard       | Workspace            |
| Mandate page         | Mandates             |
| Execution details    | Agent Activity       |
| Payment history      | Payments             |
| Transaction timeline | Live Activity        |
| Funding panel        | Vault Balance        |
| Task action          | Launch Task          |
| Payment protection   | Escrow Status        |
| Contract decisions   | Authorization Checks |

Trust boundary: **The agent chooses. The mandate constrains. Delivery settles.**

## Stable technical identifiers

The public rebrand deliberately leaves the following intact:

- Repository URL/path samuelid22/Flint and private flint / @flint package names.
- EIP-712 domain Flint Owner Launch, version 1. The wallet signing prompt may show
  this exact legacy domain; it is intentionally retained protocol identity.
- flint-task-v1, flint-ui-purchase-v1, flint-purchase-v1 and flint-request-v1 hash
  namespaces. Changing them could change task/request IDs or break idempotency.
- FLINT_STATE_DIR, FLINT_DEPLOYMENT_BLOCK and FLINT_WEB_ORIGIN configuration.
- flint-wallet, flint-pending and flint-mandate browser storage keys, preserving
  connection/pending-receipt recovery; internal singleton/test bridge names.
- TaskVault Solidity, ABI/storage, token/accounting, agent tools, journal format,
  wallet separation and owner authorization model.
- Existing file/route/screenshot names and historical report content. Historical
  references to other Flint projects remain original research, not Earmark claims.

No repository rename, package migration or business-logic migration is included.
Sharing metadata uses the existing FLINT_WEB_ORIGIN when configured, defaulting to
the local workspace origin. A future public origin must be configured at build
time after separate deployment authorization; no public domain is invented.
