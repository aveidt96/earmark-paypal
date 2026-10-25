"use client";
import { useState } from "react";
import { short } from "../lib/model";
import { Button } from "./glass";
export function TransactionReference({ hash }: { hash: string }) {
  const [status, setStatus] = useState("");
  return (
    <span className="transaction-reference">
      <code className="hash" title={hash}>
        {short(hash)}
      </code>
      <Button
        variant="ghost"
        aria-label={"Copy transaction hash " + short(hash)}
        onClick={() => {
          if (!navigator.clipboard) {
            setStatus(
              "Copy unavailable; inspect the full hash tooltip or explorer.",
            );
            return;
          }
          void navigator.clipboard.writeText(hash).then(
            () => setStatus("Copied"),
            () => setStatus("Copy unavailable"),
          );
        }}
      >
        Copy
      </Button>
      <small role="status">{status}</small>
    </span>
  );
}
