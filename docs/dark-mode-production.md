# Earmark — Dark UI production publication

Status: **published and verified** at https://earmark-omega-virid.vercel.app.

Approved UI: d9f1349de3a7375837141c48eacad6c86b1bba85. Existing Vercel project earmark uses dev for production, freshly confirmed in its overview. The previous Ready production deployment is G9jdmTPEAqJDArF4uqGEsAN3Bc7t, source f58c91de4ebcaca818e535a2dd90ba914d48c759, immutable URL https://earmark-5drpymqqx-samuelid22.vercel.app. It remains available for rollback. No main merge or force push is required.

## Published deployment

- Source: feaaf39cfabaaaa18dceb40b050dffb4cd295fc5
- Vercel production deployment: HERgfJiuWpiHKftYW2ULHdzCLyWP (Ready, 1m13s)
- Immutable URL: https://earmark-8yt7ux9n2-samuelid22.vercel.app
- Production branch pushed: dev, normal fast-forward from f58c91d; no main/force push.
- Existing previous G9 deployment remains Ready and available for rollback.

## Change

Missing/invalid theme preferences now use Dark in SSR, the first-paint bootstrap and client state. Existing explicit Light, Dark and System values are honored. Preference persistence, OS/cross-tab events, blocked-storage fallback and stable wallet/workspace provider identity are preserved. No redesign or financial logic change.

## Production pins

- Website: https://earmark-omega-virid.vercel.app
- Render: https://earmark-api-testnet.onrender.com (unchanged; auto-deploy Off)
- Network: Monad Testnet 10143
- TaskVault: 0x37c026c7207de8f202a06726eb02e6233ed06160
- Mock USDC: 0x8f4660ed18a3ba5ba9dbe64e18f06ef4a43c0136
- Existing completed six-USDC payment: 0x003be982f4f5ec1eceb497862bdeb8ac65c0d9a9f4e452324e9dc883af72c98e
- Settlement transaction: 0x95810b4c31144e9b044955d7fc9b4e9dc055fb6842aaab495ea677a9a0a66e25

No Vercel environment, backend service, Neon connection/state, contract address, key, signature or model configuration is changed. Public verification must not send a financial transaction or signed launch.

## Rollback

In the existing Vercel earmark project, select the saved previous successful deployment G9jdmTPEAqJDArF4uqGEsAN3Bc7t and use the production rollback/promotion flow. Verify its source f58c91d and the existing earmark-omega-virid.vercel.app domain before confirming. Do not recreate the project, change environment values, deploy a backend or force-push Git. Stop rather than accepting any paid-plan upgrade. After rollback, verify read-only workspace/history and backend readiness. Future small UI changes remain separate from contract/financial logic.

## Verification

Frontend lint/typecheck and production build passed. All 18 focused theme/verdict tests and seven local browser cases passed, covering default-first-load on a light OS, all saved choices, both OS System modes, persistence/navigation, stable wallet/form data, local mandate/escrow lifecycle and responsive views. Compiled credential boundary passed 42 chunks; source/history scans found zero configured-secret matches across 218 paths. The approved screenshots were restored after tests. Exact publication and live production verification passed. Five read-only public browser cases passed in 34.4s: Dark first visit despite a light OS, saved Light/Dark/System preferences, refresh/navigation, live mode switching, logo rendering, real completed six-USDC history, mobile overflow and read-only injected wallet connection/state preservation on Monad 10143. No critical browser errors were recorded. The original unrelated typing-file edit is protected, and approved local screenshot assets will be restored after browser testing.

## Live evidence and limitations

Public health/readiness returned 200 with 10143, PostgreSQL and mock mode. The live workspace uses the unchanged approved vault/token and shows the actual completed payment, 14 mock USDC available and zero reserved. Four public frontend routes returned 200 with Earmark branding and no visible Flint; fourteen served chunks contained zero actual configured credentials. No environment variables, paid settings or backend deployment action were changed. No new payment, signature or model inference was submitted.

The live wallet protocol test uses an explicitly synthetic read-only EIP-1193 provider restricted to accounts and chain ID; it is not a fresh interactive Rabby/MetaMask extension approval. Actual owner wallet authorization was verified during Stage 8A and its implementation is unchanged. Free Render wake-up behavior and blocked-browser-storage limitations remain. No blocking publication issue remains.

Live screenshots:

- [Production Dark default](screenshots/production-dark-default.png)
- [Production mobile Dark console](screenshots/production-dark-mobile.png)

Post-deployment evidence documentation is committed locally only, to avoid an unnecessary second deployment of unchanged application source. The live application source remains the exact commit above. No motion-design video work has started.
