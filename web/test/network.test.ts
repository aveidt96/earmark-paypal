import { describe, expect, it } from "vitest";
import { protocolChain, validateChainId } from "../src/lib/network";

describe("network configuration", () => {
  it("uses Monad Testnet with no RPC request", () => {
    expect(protocolChain.id).toBe(10143);
    expect(protocolChain.testnet).toBe(true);
    expect(validateChainId(undefined)).toBe(10143);
    expect(validateChainId("10143")).toBe(10143);
  });

  it.each(["1", "143", "", "10143abc"])(
    "rejects unintended chain %s",
    (value) => {
      expect(() => validateChainId(value)).toThrow(
        "Monad Testnet (10143) only",
      );
    },
  );
});
