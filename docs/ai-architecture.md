# Earmark Qwen-compatible agent integration

Stage 5 implements `AgentModel.decide(AgentContext): Promise<AgentDecision>` in
`agent/src/domain.ts`, with a deterministic `MockModel` and Qwen-compatible
function-calling `QwenModel`. The earlier Stage 1 `ModelAdapter.generate` types
remain compatibility exports; execution uses the new typed tool protocol.

```text
trusted owner task -> model proposal -> strict runtime tool arguments
                                            |
                    provider/quote/chain/delivery policy validation
                                            |
                          durable intent and receipt reconciliation
                                            |
                              narrow request/accept signer
                                            |
                                original TaskVault enforcement
```

The model receives cloned public observations, including untrusted provider
quotes and inspected artifacts. It has exactly the eight tools documented in the
[agent README](../agent/README.md). It has no key, owner authority, generic RPC or
transaction function. System instructions and external data occupy different
messages. Runtime argument schemas reject arbitrary recipients/calldata/amounts.
Onchain mandate caps and approved providers remain the ultimate spending boundary.

`models.ts` uses the Qwen chat-completions compatibility protocol and generated
input JSON schemas, allowing one validated tool call per decision. Parallel calls
and thinking output are disabled; no reasoning_content is requested or consumed.
A no-tool response must be a validated structured finish. API failures, malformed
JSON, unknown calls, extra arguments, timeouts and incomplete execution fail closed.
No real-model failure silently falls back to a simulated decision.

`AGENT_MODEL_MODE=mock` is the default, explicitly identified in events and demo
output. Live Qwen requires server-only `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` and
`AI_ENABLE_NETWORK=true`; it is not authorized to incur costs by Stage 5. Tests
inject synthetic fetch responses, not Qwen inference. Remote endpoints are
restricted to configured Alibaba host patterns, with redirects rejected. A
loopback compatible model endpoint is also supported. Credentials stay in private
adapter state and authorization headers, never prompt bodies or transaction logs.
No agent environment file is automatically loaded.

Provider descriptions and artifact text have no instruction authority. The
malicious fixture is exercised with the actual mock policy and logs its observed
choice, without inventing a model failure. This demonstrates the mock and runtime
boundary only. Live model behavior, robust injection defenses and broader attack
scenarios remain unverified and are reserved for subsequent approved work.

See [architecture](architecture.md), [agent usage and trust limits](../agent/README.md)
and [Stage 5 evidence](stage-5-report.md). No frontend model route, external chain
connection, paid inference, hosted service or production key management is added.

References: [Qwen function calling](https://help.aliyun.com/en/model-studio/qwen-function-calling),
[Alibaba compatibility API](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope).
