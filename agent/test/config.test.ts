import { describe, expect, it } from "vitest";
import { parseAgentConfig } from "../src/config.js";

describe("agent configuration boundary", () => {
  it("works without provider credentials or network access", () => {
    expect(parseAgentConfig({})).toEqual({
      MONAD_TESTNET_RPC_URL: "https://testnet-rpc.monad.xyz",
      AI_MODEL: "qwen-plus",
      GEMINI_MODEL: "gemini-3.8-flash",
      EARMARK_GEMINI_ENABLED: "false",
    });
  });

  it("does not propagate unrelated or secret environment values", () => {
    expect(
      parseAgentConfig({
        AI_API_KEY: "synthetic-test-value",
        OTHER: "ignored",
      }),
    ).not.toHaveProperty("AI_API_KEY");
  });

  it("reports invalid fields without echoing their values", () => {
    expect(() =>
      parseAgentConfig({ AI_BASE_URL: "synthetic-invalid-sensitive-value" }),
    ).toThrow(/^Invalid agent configuration fields: AI_BASE_URL$/);
  });
});
