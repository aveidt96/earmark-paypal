import { it, expect } from "vitest";
import { toFunctionSelector, toEventSelector, type AbiParameter } from "viem";
import { readLocalArtifact } from "../../agent/dist/local/harness.js";
import { ownerAbi } from "../src/lib/abi";
function shape(p: AbiParameter): unknown {
  return {
    type: p.type,
    ...("components" in p
      ? {
          components: p.components.map((c) => ({
            name: c.name,
            ...(shape(c) as object),
          })),
        }
      : {}),
  };
}
it("curated owner ABI matches every compiled TaskVault function and tuple output", () => {
  const actual = readLocalArtifact("TaskVault").abi;
  for (const item of ownerAbi) {
    if (item.type !== "function") continue;
    const match = actual.find(
      (a) =>
        a.type === "function" &&
        toFunctionSelector(a) === toFunctionSelector(item),
    );
    expect(match, item.name).toBeDefined();
    if (match?.type === "function")
      expect(item.outputs.map(shape), item.name).toEqual(
        match.outputs.map(shape),
      );
  }
});
it("all displayed contract event signatures and indexed fields match the compiled ABI", () => {
  const actual = readLocalArtifact("TaskVault").abi;
  for (const item of ownerAbi) {
    if (item.type !== "event") continue;
    const match = actual.find(
      (a) => a.type === "event" && toEventSelector(a) === toEventSelector(item),
    );
    expect(match, item.name).toBeDefined();
    if (match?.type === "event")
      expect(
        item.inputs.map((p) => ({
          type: p.type,
          indexed: "indexed" in p ? Boolean(p.indexed) : false,
        })),
        item.name,
      ).toEqual(
        match.inputs.map((p) => ({
          type: p.type,
          indexed: "indexed" in p ? Boolean(p.indexed) : false,
        })),
      );
  }
});
