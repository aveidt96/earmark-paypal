import { AgentTools } from "../agent/dist/tools.js";
import { EventStream, identity } from "../agent/dist/domain.js";
import { AgentError } from "../agent/dist/errors.js";

/** Existing AgentTools over explicitly synthetic state, with no wallet, RPC or disk journal. */
export function readOnlyFixture(context) {
  const records = new Map();
  const counters = { preparationAttempts: 0, broadcasts: 0 };
  const refuse = async () => {
    counters.preparationAttempts += 1;
    throw new AgentError("READ_ONLY_FINANCIAL_EXECUTION_DISABLED");
  };
  const chain = {
    chainId: 31337,
    vault: "0x4400000000000000000000000000000000000001",
    agent: context.observations.mandate.agent,
    token: context.observations.mandate.token,
    mandate: async () => structuredClone(context.observations.mandate),
    providers: async () => context.observations.providers.map((p) => p.address),
    balance: async () => context.observations.balance,
    now: async () => context.observations.mandate.now,
    genesis: async () => identity("read-only-synthetic-genesis"),
    prepareRequest: refuse,
    prepareAcceptance: refuse,
    broadcast: async () => {
      counters.broadcasts += 1;
      throw new AgentError("READ_ONLY_FINANCIAL_EXECUTION_DISABLED");
    },
    payment: async () => {
      throw new AgentError("NO_READ_ONLY_PAYMENT");
    },
    receipt: async () => {
      throw new AgentError("NO_READ_ONLY_TRANSACTION");
    },
  };
  const store = {
    exclusive: async (work) => work(),
    get: async (key) => records.get(key),
    put: async (record) => {
      records.set(record.key, structuredClone(record));
    },
  };
  const providers = context.observations.providers.map((info) => ({
    info,
    getQuote: async () =>
      structuredClone(
        context.observations.quotes.find((q) => q.providerId === info.id),
      ),
    getDelivery: async () => {
      throw new AgentError("NO_READ_ONLY_PAYMENT");
    },
  }));
  const tools = new AgentTools(
    context.task,
    chain,
    store,
    providers,
    new EventStream(),
  );
  tools.context.observations = structuredClone(context.observations);
  return { tools, counters };
}
