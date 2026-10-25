"use client";
import {
  challengeRemaining,
  type PaymentRecord,
  type RecordedEvent,
  type RunView,
} from "../lib/model";
import { paymentProgress, paymentStages } from "../lib/payment-progress";
import { Icon } from "./glass";
export function PaymentLifecycle({
  run,
  payment,
  events = [],
  chainTime = 0,
  stage,
  failure,
  recorded = false,
}: {
  run?: RunView | undefined;
  payment?: PaymentRecord | undefined;
  events?: RecordedEvent[];
  chainTime?: number;
  stage?: number;
  failure?: string | undefined;
  recorded?: boolean;
}) {
  const index = stage ?? paymentProgress(run, payment, events);
  const stopped =
    failure ??
    (payment?.status === "REJECTED"
      ? "Rejected · reservation refunded"
      : payment?.status === "EXPIRED"
        ? "Expired · reservation refunded"
        : !payment &&
            (run?.status === "failed" || run?.status === "interrupted")
          ? "Blocked / needs review · no confirmed escrow"
          : undefined);
  return (
    <section className="payment-lifecycle" aria-label="Payment lifecycle">
      <ol className="progress-timeline five-stage">
        {paymentStages.map((label, i) => (
          <li
            key={label}
            className={i <= index ? "reached" : ""}
            aria-current={i === index ? "step" : undefined}
          >
            <span>{i < index ? <Icon name="check" /> : null}</span>
            <small>{label}</small>
          </li>
        ))}
      </ol>
      {stopped && (
        <p className="lifecycle-failure" role="status">
          {stopped}
        </p>
      )}
      {payment?.status === "ACCEPTED" && (
        <p className="challenge-note">
          <Icon name="clock" />
          {recorded ? "Historical acceptance: " : ""}
          {challengeRemaining(payment, chainTime) > 0
            ? `${challengeRemaining(payment, chainTime)} seconds until the contract challenge deadline${recorded ? " at this recorded block" : " according to the latest chain block"}.`
            : "Full challenge deadline reached. Funds remain reserved until confirmed settlement."}
        </p>
      )}
      {recorded && (
        <small className="micro">
          Original event order · compressed replay speed · no new transactions
          or artificial blockchain timestamps
        </small>
      )}
    </section>
  );
}
