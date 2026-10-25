import { bounded, AgentError } from "./errors.js";
import {
  decisionSchema,
  toolSchemas,
  type AgentModel,
  type AgentContext,
  type AgentDecision,
  type Quote,
} from "./domain.js";
import type { AgentTools } from "./tools.js";
import type { VaultChain } from "./chain.js";
/** Shared decision validation; models never get authority through unvalidated arguments. */
export async function validatedDecision(
  model: AgentModel,
  context: AgentContext,
  timeoutMs: number,
) {
  const raw = await bounded(
    () => model.decide(structuredClone(context)),
    timeoutMs,
    "MODEL_TIMEOUT",
  );
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) throw new AgentError("INVALID_MODEL_RESPONSE");
  if (
    parsed.data.kind === "tool" &&
    !toolSchemas[parsed.data.name].safeParse(parsed.data.args).success
  )
    throw new AgentError("INVALID_TOOL_ARGUMENTS");
  return parsed.data;
}

/** Only uses a signer-free fixture. Stops at the independently validated proposal. */
export async function runReadOnlyAgent(
  model: AgentModel & { toolResult(name: string, result: unknown): void },
  fixture: Awaited<
    ReturnType<typeof import("./read-only.js").createReadOnlyTools>
  >,
  options: {
    enabled: () => boolean;
    cancelled: () => boolean;
    authorize?: () => Promise<void>;
    emit: (
      type: string,
      data: Record<string, string | number | boolean>,
    ) => Promise<void>;
  },
) {
  const started = Date.now();
  for (let step = 0; step < 10 && Date.now() - started < 240000; step++) {
    if (options.cancelled()) throw new AgentError("INFERENCE_CANCELLED");
    if (!options.enabled()) throw new AgentError("GEMINI_DISABLED");
    await options.authorize?.();
    await options.emit("gemini.waiting", { step });
    const decision: AgentDecision = await validatedDecision(
      model,
      fixture.tools.context,
      60000,
    );
    if (options.cancelled()) throw new AgentError("INFERENCE_CANCELLED");
    if (!options.enabled()) throw new AgentError("GEMINI_DISABLED");
    await options.authorize?.();
    await options.emit("gemini.decision", {
      summary: decision.summary,
      action: decision.kind === "tool" ? decision.name : "finish",
    });
    if (decision.kind === "finish")
      throw new AgentError("READ_ONLY_PROPOSAL_REQUIRED");
    await options.emit("gemini.tool", {
      name: decision.name,
      args: JSON.stringify(decision.args),
    });
    let result: unknown;
    try {
      result = {
        result: await fixture.tools.call(decision.name, decision.args),
      };
    } catch (error) {
      const code = error instanceof AgentError ? error.code : "TOOL_FAILURE";
      await options.emit("gemini.tool.result", {
        name: decision.name,
        result: JSON.stringify({ error: code }),
      });
      if (
        decision.name === "requestMandatePayment" &&
        code === "READ_ONLY_FINANCIAL_EXECUTION_DISABLED"
      ) {
        const args = toolSchemas.requestMandatePayment.parse(decision.args);
        const quote = fixture.tools.context.observations.quotes.find(
          (q) => q.quoteId === args.quoteId,
        );
        if (
          !quote ||
          fixture.counters.preparationAttempts !== 1 ||
          fixture.counters.broadcasts !== 0
        )
          throw new AgentError("READ_ONLY_BOUNDARY_FAILED");
        const provider = fixture.tools.context.observations.providers?.find(
          (p) => p.id === quote.providerId,
        );
        if (!provider) throw new AgentError("UNAPPROVED_PROVIDER");
        await options.emit("gemini.validated", {
          providerId: provider.id,
          recipient: provider.address,
          amount: quote.price,
          reason: args.reason,
          broadcast: false,
        });
        return {
          quote: quote as Quote,
          recipient: provider.address,
          reason: args.reason,
        };
      }
      throw new AgentError(code);
    }
    await options.emit("gemini.tool.result", {
      name: decision.name,
      result: JSON.stringify(result),
    });
    model.toolResult(decision.name, result);
  }
  throw new AgentError("MODEL_STEP_LIMIT");
}
export async function runAgent(
  model: AgentModel,
  tools: AgentTools,
  chain: VaultChain,
  options: { maxSteps?: number; modelTimeoutMs?: number } = {},
) {
  return tools.store.exclusive(async () => {
    await chain.verify();
    tools.events.emit("task.started", "application", {
      taskHash: tools.context.task.taskHash,
      mode: model.mode,
      simulatedModel: model.mode === "mock",
    });
    await tools.events.flush();
    await tools.resume();
    await tools.events.flush();
    for (let step = 0; step < (options.maxSteps ?? 24); step++) {
      const decision = await validatedDecision(
        model,
        tools.context,
        options.modelTimeoutMs ?? 20000,
      );
      tools.events.emit("model.decision", "model", {
        mode: model.mode,
        summary: decision.summary,
        action: decision.kind === "tool" ? decision.name : "finish",
      });
      await tools.events.flush();
      if (decision.kind === "finish") {
        const p = tools.context.observations.payment;
        if (
          !p ||
          !["ACCEPTED", "COMPLETED", "REJECTED", "EXPIRED"].includes(p.status)
        )
          throw new AgentError("PREMATURE_MODEL_FINISH");
        return { mode: model.mode, payment: p, events: tools.events.events };
      }
      if (!toolSchemas[decision.name].safeParse(decision.args).success)
        throw new AgentError("INVALID_TOOL_ARGUMENTS");
      try {
        await tools.call(decision.name, decision.args);
        await tools.events.flush();
      } catch (error) {
        const code = error instanceof AgentError ? error.code : "TOOL_FAILURE";
        tools.events.emit("task.failed", "application", { code });
        throw new AgentError(code);
      }
    }
    throw new AgentError("MODEL_STEP_LIMIT");
  });
}
