import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  agentPreparationFixture,
  agentModelEnv,
} from "./fixtures/agent-checkout";
import {
  agentCheckoutCatalog,
  agentCheckoutMandateId,
  agentObjective,
} from "../src/server/paypal/agent-checkout";
import {
  createSyntheticGeminiBoundary,
  SYNTHETIC_CANARY,
} from "../src/server/paypal/gemini-boundary";
import {
  PAYPAL_AGENT_SYSTEM_INSTRUCTION,
  paypalAgentCustomTools,
  createPayPalGeminiModel,
} from "../src/server/paypal/agent";
import { runSyntheticAgentDiagnostic } from "../src/server/paypal/agent-diagnostic";
import type { AgentSyntheticDiagnostic } from "../src/lib/agent-checkout";

type Body = {
  debugDatabaseRow?: unknown;
  systemInstruction: { parts: [{ text: string }] };
  tools: [{ functionDeclarations: [{ description: string }] }];
  generationConfig: Record<string, unknown>;
  contents: {
    parts: [
      {
        text: string;
        databaseRecord?: unknown;
        thoughtSignature?: string;
        functionResponse: {
          id?: string;
          response: { result: Record<string, unknown> };
        };
      },
    ];
  }[];
};
const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("FIXTURE_REQUIRED");
  return value;
};

function setup() {
  const t = agentPreparationFixture();
  const config = {
    ...t.config,
    ownerId: "paypal-test-owner-synthetic-model",
    agentId: "agent05a-synthetic-model",
    merchantId: "SYNTHETICDIAG1",
  };
  const mandate = {
    ...t.mandate,
    id: agentCheckoutMandateId(config),
    ownerId: config.ownerId,
    agentId: config.agentId,
    merchants: [config.merchantId],
    createdAt: new Date(t.now).toISOString(),
    expiresAt: new Date(t.now + 3600000).toISOString(),
  };
  const context = {
    mandate,
    objective: agentObjective(mandate),
    catalog: agentCheckoutCatalog(config.merchantId),
    forbidden: [SYNTHETIC_CANARY],
  };
  const make = () => {
    const b = createSyntheticGeminiBoundary(
      context,
      PAYPAL_AGENT_SYSTEM_INSTRUCTION,
      paypalAgentCustomTools,
      agentModelEnv.GEMINI_API_KEY,
      agentModelEnv.GEMINI_MODEL,
    );
    for (const p of t.responses)
      b.observeResponse({
        candidates: [{ content: { role: "model", parts: [p] } }],
      });
    return b;
  };
  return { ...t, context, make };
}
describe("final synthetic Gemini transport policy", () => {
  it("allows slow synthetic turns beyond 15s with a fresh deadline for each turn", async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      const env: Record<string, string | undefined> = { ...agentModelEnv };
      delete env.AI_TIMEOUT_MS;
      const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        await new Promise<void>((resolve) => setTimeout(resolve, 20000));
        return t.fetcher(input, init);
      });
      const result = runSyntheticAgentDiagnostic(
        env,
        fetcher,
        "MOCKED_TRANSPORT_TEST",
        () => t.now,
      );
      for (let turn = 0; turn < 6; turn++)
        await vi.advanceTimersByTimeAsync(20000);
      const diagnostic = await result;
      expect(fetcher).toHaveBeenCalledTimes(6);
      expect(diagnostic.policyValidated).toBe(true);
      expect(diagnostic.policyChecks.every((check) => check.passed)).toBe(true);
      expect(diagnostic.proposal.amountMinor).toBe("600");
      expect(diagnostic.outboundBoundary).toMatchObject({
        accepted: 6,
        rejected: 0,
        toolResponsesValidated: 15,
        canaryRejected: 33,
      });
      expect(diagnostic.persisted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([
    { override: undefined, deadline: 60000 },
    { override: "15000", deadline: 15000 },
  ])(
    "cancels a stalled turn at the default or explicit deadline $deadline ms",
    async ({ override, deadline }) => {
      vi.useFakeTimers();
      try {
        const t = setup();
        const env: Record<string, string | undefined> = { ...agentModelEnv };
        if (override === undefined) delete env.AI_TIMEOUT_MS;
        else env.AI_TIMEOUT_MS = override;
        let signal: AbortSignal | null | undefined;
        const fetcher = vi.fn<typeof fetch>((_input, init) => {
          signal = init?.signal;
          return new Promise<Response>(() => {});
        });
        const model = createPayPalGeminiModel(env, fetcher, t.context);
        const rejected = expect(
          model.decide({
            task: { ...t.context.objective, maxPriceMinor: "600" },
            observations: {},
          }),
        ).rejects.toThrow("MODEL_TIMEOUT");
        await vi.advanceTimersByTimeAsync(deadline - 1);
        expect(signal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await rejected;
        expect(signal?.aborted).toBe(true);
        expect(fetcher).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it("retains HTTP headers and cancels a stalled synthetic success body", async () => {
    const cancel = vi.fn();
    const p: Pick<AgentSyntheticDiagnostic, "requests" | "outboundBoundary"> = {
      requests: [],
      outboundBoundary: {
        version: "synthetic-payload-v1",
        accepted: 0,
        rejected: 0,
        toolResponsesValidated: 0,
        canaryRejected: 0,
      },
    };
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(new ReadableStream({ cancel }), { status: 200 }),
    );
    await expect(
      runSyntheticAgentDiagnostic(
        {
          ...agentModelEnv,
          AI_TIMEOUT_MS: "50",
          GEMINI_HTTP_MAX_ATTEMPTS: "1",
        },
        fetcher,
        "MOCKED_TRANSPORT_TEST",
        Date.now,
        p,
      ),
    ).rejects.toThrow("MODEL_TIMEOUT");
    expect(p.requests).toMatchObject([
      { httpStatus: 200, category: "LOCAL_TIMEOUT" },
    ]);
    expect(p.outboundBoundary).toMatchObject({
      accepted: 1,
      rejected: 0,
      canaryRejected: 3,
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not turn a remote HTTP error with a hanging body into MODEL_TIMEOUT", async () => {
    const t = setup(),
      cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(new ReadableStream({ cancel }), { status: 503 }),
    );
    const model = createPayPalGeminiModel(
      { ...agentModelEnv, GEMINI_HTTP_MAX_ATTEMPTS: "1" },
      fetcher,
      t.context,
    );
    await expect(
      model.decide({
        task: {
          ...t.context.objective,
          maxPriceMinor: t.context.objective.maxPriceMinor.toString(),
        },
        observations: {},
      }),
    ).rejects.toThrow("MODEL_API_ERROR");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retains sanitized boundary and HTTP classifications when inference fails", async () => {
    const t = setup();
    const progress: Pick<
      AgentSyntheticDiagnostic,
      "requests" | "outboundBoundary"
    > = {
      requests: [],
      outboundBoundary: {
        version: "synthetic-payload-v1",
        accepted: 0,
        rejected: 0,
        toolResponsesValidated: 0,
        canaryRejected: 0,
      },
    };
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 503 }),
    );
    await expect(
      runSyntheticAgentDiagnostic(
        agentModelEnv,
        fetcher,
        "MOCKED_TRANSPORT_TEST",
        () => t.now,
        progress,
      ),
    ).rejects.toThrow("MODEL_API_ERROR");
    expect(progress.outboundBoundary).toMatchObject({
      accepted: 2,
      rejected: 0,
      canaryRejected: 6,
    });
    expect(progress.requests.map((r) => r.httpStatus)).toEqual([503, 503]);
    expect(JSON.stringify(progress)).not.toContain(
      agentModelEnv.GEMINI_API_KEY,
    );
  });
  it("rejects unknown records in approved context and sensitive catalog prose before model creation", () => {
    const t = setup();
    const variants = [
      { ...t.context, unapprovedRecord: { value: SYNTHETIC_CANARY } },
      {
        ...t.context,
        objective: {
          ...t.context.objective,
          databaseRecord: { value: SYNTHETIC_CANARY },
        },
      },
      {
        ...t.context,
        catalog: t.context.catalog.map((o) => ({
          ...o,
          deliveryTerms: {
            ...o.deliveryTerms,
            accountNumber: SYNTHETIC_CANARY,
          },
        })),
      },
      {
        ...t.context,
        catalog: t.context.catalog.map((o) => ({
          ...o,
          untrustedDescription: "C:\\synthetic\\private",
        })),
      },
    ];
    for (const context of variants) {
      expect(() =>
        createPayPalGeminiModel(agentModelEnv, t.fetcher, context),
      ).toThrow("GEMINI_OUTBOUND_POLICY_REJECTED");
    }
    expect(t.fetcher).not.toHaveBeenCalled();
  });
  it("checks every complete native turn and proves canaries without network transmission", async () => {
    const t = setup();
    const diagnostic = await runSyntheticAgentDiagnostic(
      agentModelEnv,
      t.fetcher,
      "MOCKED_TRANSPORT_TEST",
      () => t.now,
    );
    expect(diagnostic.outboundBoundary).toMatchObject({
      version: "synthetic-payload-v1",
      accepted: 6,
      rejected: 0,
      toolResponsesValidated: 15,
      canaryRejected: 33,
    });
    expect(t.fetcher).toHaveBeenCalledTimes(6);
    expect(
      t.fetcher.mock.calls.every(
        ([, init]) => !String(init?.body).includes(SYNTHETIC_CANARY),
      ),
    ).toBe(true);
  });
  it("rejects unapproved envelope, initial policy, system, schema, native history and every tool result before fetch", async () => {
    const t = setup();
    await t.infer();
    const cases: Array<[number, (body: Body) => void]> = [
      [
        0,
        (b) => {
          b.debugDatabaseRow = { accountNumber: SYNTHETIC_CANARY };
        },
      ],
      [
        0,
        (b) => {
          b.systemInstruction.parts[0].text += SYNTHETIC_CANARY;
        },
      ],
      [
        0,
        (b) => {
          b.tools[0].functionDeclarations[0].description = SYNTHETIC_CANARY;
        },
      ],
      [
        0,
        (b) => {
          b.generationConfig.internalPath = "C:\\synthetic\\private";
        },
      ],
      [
        0,
        (b) => {
          const p = JSON.parse(required(b.contents[0]).parts[0].text);
          p.observationsIncludingUntrustedProviderData = {
            privatePrompt: SYNTHETIC_CANARY,
          };
          required(b.contents[0]).parts[0].text = JSON.stringify(p);
        },
      ],
      [
        1,
        (b) => {
          required(b.contents[1]).parts[0].databaseRecord = {
            secret: SYNTHETIC_CANARY,
          };
        },
      ],
      [
        1,
        (b) => {
          required(b.contents[2]).parts[0].functionResponse.id =
            SYNTHETIC_CANARY;
        },
      ],
      ...Array.from(
        { length: 5 },
        (_, i) =>
          [
            i + 1,
            (b: Body) => {
              required(
                b.contents.at(-1),
              ).parts[0].functionResponse.response.result.historicalImmutableAnchor =
                { orderId: SYNTHETIC_CANARY };
            },
          ] as [number, (body: Body) => void],
      ),
    ];
    for (const [index, mutate] of cases) {
      const call = t.fetcher.mock.calls[index];
      if (!call) throw Error("FIXTURE_REQUIRED");
      const init = required(call[1]);
      const body = JSON.parse(String(init.body)) as Body;
      mutate(body);
      const network = vi.fn();
      const boundary = t.make();
      const send = () => {
        boundary.validate(String(call[0]), {
          ...init,
          body: JSON.stringify(body),
        });
        network();
      };
      expect(send).toThrow("GEMINI_OUTBOUND_POLICY_REJECTED");
      expect(network).not.toHaveBeenCalled();
      expect(boundary.evidence.rejected).toBe(1);
    }
  });
  it.each([
    SYNTHETIC_CANARY,
    "C:\\Users\\synthetic\\private.env",
    "postgresql://synthetic:password@invalid/db",
    "synthetic@example.invalid",
    "routing number 123456789",
    "client_secret=synthetic-secret",
    encodeURIComponent("C:\\Users\\synthetic\\private.env"),
    Buffer.from(SYNTHETIC_CANARY).toString("base64"),
  ])("rejects sensitive prose canary %# in a tool response", async (value) => {
    const t = setup();
    await t.infer();
    const call = required(t.fetcher.mock.calls[4]);
    const body = JSON.parse(String(call[1]?.body));
    body.contents.at(-1).parts[0].functionResponse.response.result.reason =
      value;
    const network = vi.fn();
    expect(() => {
      t.make().validate(String(call[0]), {
        ...call[1],
        body: JSON.stringify(body),
      });
      network();
    }).toThrow("GEMINI_OUTBOUND_POLICY_REJECTED");
    expect(network).not.toHaveBeenCalled();
  });
  it("preserves authentic call IDs and thought signatures, rejecting substituted history", async () => {
    const t = setup();
    t.responses[0] = {
      functionCall: {
        name: "readSpendingMandate",
        args: {},
        id: "synthetic-call-1",
      },
      thoughtSignature: "c3ludGhldGljLXNpZ25hdHVyZQ==",
    };
    await t.infer();
    const call = required(t.fetcher.mock.calls[1]);
    const body = JSON.parse(String(call[1]?.body));
    expect(body.contents[1].parts[0].thoughtSignature).toBe(
      "c3ludGhldGljLXNpZ25hdHVyZQ==",
    );
    expect(body.contents[2].parts[0].functionResponse.id).toBe(
      "synthetic-call-1",
    );
    t.make().validate(String(call[0]), required(call[1]));
    body.contents[1].parts[0].thoughtSignature = "dW5hcHByb3ZlZC1zaWduYXR1cmU=";
    expect(() =>
      t
        .make()
        .validate(String(call[0]), { ...call[1], body: JSON.stringify(body) }),
    ).toThrow("GEMINI_OUTBOUND_POLICY_REJECTED");
  });
  it("revalidates retry headers and cannot send a poisoned second request", async () => {
    const t = setup();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      (required(init).headers as Record<string, string>)[
        "x-unapproved-account"
      ] = SYNTHETIC_CANARY;
      return new Response("{}", { status: 503 });
    });
    const model = createPayPalGeminiModel(agentModelEnv, fetcher, t.context);
    await expect(
      model.decide({
        task: {
          ...t.context.objective,
          maxPriceMinor: t.context.objective.maxPriceMinor.toString(),
        },
        observations: {},
      }),
    ).rejects.toThrow("GEMINI_OUTBOUND_POLICY_REJECTED");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("requires an explicit approved context before a PayPal Gemini network call", async () => {
    const network = vi.fn();
    const model = createPayPalGeminiModel(agentModelEnv, network);
    await expect(model.decide({ task: {}, observations: {} })).rejects.toThrow(
      "GEMINI_OUTBOUND_POLICY_REQUIRED",
    );
    expect(network).not.toHaveBeenCalled();
  });
});
