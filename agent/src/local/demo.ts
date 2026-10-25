import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { startAnvil, createFixture } from "./harness.js";
import { EventStream } from "../domain.js";
import { createModel } from "../models.js";
import { AgentError } from "../errors.js";
export async function runLocalDemo(
  env: Record<string, string | undefined>,
  evidencePath?: string,
) {
  const model = createModel(env); // Missing Qwen configuration fails before starting any local chain.
  const stream = new EventStream((event) =>
    process.stdout.write(`${JSON.stringify(event)}\n`),
  );
  stream.emit("demo.mode", "application", {
    mode: model.mode,
    providers: "simulated",
    chain: "disposable-local-Anvil",
    inference:
      model.mode === "mock"
        ? "simulated-no-inference"
        : "configured-Qwen-endpoint",
  });
  const node = await startAnvil();
  try {
    const fixture = await createFixture(node, { events: stream });
    const result = await fixture.run(model);
    if (result.payment.status !== "ACCEPTED")
      throw new AgentError("DEMO_NOT_ACCEPTED");
    let earlyBlocked = false;
    try {
      await node.publicClient.simulateContract({
        address: fixture.vault,
        abi: fixture.vaultArtifact.abi,
        functionName: "settlePayment",
        args: [result.payment.id],
        account: fixture.observerWallet.account,
      });
    } catch {
      earlyBlocked = true;
    }
    if (!earlyBlocked) throw new AgentError("CHALLENGE_NOT_ENFORCED");
    const settlement = await fixture.settle(result.payment.id);
    const failure = await createFixture(node, {
      revoked: true,
      events: stream,
    });
    let failureCode = "";
    try {
      await failure.run(model);
    } catch (error) {
      failureCode =
        error instanceof AgentError ? error.code : "UNEXPECTED_FAILURE";
    }
    if (failureCode !== "MANDATE_INACTIVE_OR_EXPIRED")
      throw new AgentError("DEMO_AUTHORIZATION_FAILURE_MISSING");
    const evidence = {
      mode: model.mode,
      chainId: 31337,
      vault: fixture.vault,
      token: fixture.token,
      agent: fixture.chain.agent,
      owner: fixture.ownerWallet.account.address,
      selectedProvider:
        fixture.infos.find(
          (p) =>
            p.address.toLowerCase() === result.payment.provider.toLowerCase(),
        )?.id ?? "unknown",
      amount: result.payment.amount,
      paymentId: result.payment.id,
      settlementHash: settlement.hash,
      finalStatus: settlement.payment.status,
      earlySettlementBlocked: earlyBlocked,
      authorizationFailure: failureCode,
      events: stream.events,
    };
    stream.emit("demo.complete", "application", {
      paymentId: result.payment.id,
      status: settlement.payment.status,
      authorizationFailure: failureCode,
    });
    if (evidencePath) {
      await mkdir(dirname(evidencePath), { recursive: true });
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2), {
        mode: 0o600,
      });
    }
    return evidence;
  } finally {
    await node.close();
  }
}
