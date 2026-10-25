import type { PaymentRecord, RunView } from "./model";
export function contractVerdict(
  payment: PaymentRecord | undefined,
  run: RunView | undefined,
  chainTime: number,
) {
  switch (payment?.status) {
    case "COMPLETED":
      return {
        title: "PAYMENT SETTLED",
        tone: "success",
        detail:
          "Confirmed transfer to the original approved provider. This payment is terminal.",
      };
    case "REJECTED":
      return {
        title: "OWNER REJECTED",
        tone: "danger",
        detail:
          "The owner rejected this payment. Its reservation is released; settled spending is unchanged.",
      };
    case "EXPIRED":
      return {
        title: "RESERVATION REFUNDED",
        tone: "warning",
        detail:
          "Confirmed timeout refund. Task headroom and available vault liquidity are restored.",
      };
    case "ACCEPTED":
      return chainTime >= payment.challengeDeadline
        ? {
            title: "READY TO SETTLE",
            tone: "warning",
            detail:
              "The full challenge period has elapsed onchain. Funds remain reserved until a confirmed settlement.",
          }
        : {
            title: "CHALLENGE ACTIVE",
            tone: "warning",
            detail:
              "Delivery accepted. Funds remain escrowed through the mandatory owner challenge period.",
          };
    case "SUBMITTED":
      return {
        title: "DELIVERY SUBMITTED",
        tone: "warning",
        detail:
          "Provider commitment recorded. Agent inspection and acceptance are still required.",
      };
    case "FUNDED":
      return {
        title: "PAYMENT IN ESCROW",
        tone: "warning",
        detail:
          "Authorization confirmed. Funds stay in the vault pending delivery, acceptance and the full challenge period.",
      };
    default:
      return run?.status === "failed" || run?.status === "interrupted"
        ? {
            title: "REVIEW REQUIRED",
            tone: "danger",
            detail:
              "The workflow stopped. No successful contract authorization is assumed; inspect recorded tool results and receipts.",
          }
        : {
            title: "AWAITING AUTHORIZATION",
            tone: "neutral",
            detail:
              "An agent proposal is not payment approval. Only a confirmed funded receipt establishes contract authorization.",
          };
  }
}
