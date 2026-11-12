"use client";
import { useState } from "react";
import {
  formatResearchBudget,
  safeExternalOfferUrl,
  safePlanCheckoutUrl,
  type IncompleteComparison,
  type ManualCheckoutDecision,
  type OfferDiscoveryResult,
} from "../lib/offer-discovery";
import { Badge, Button } from "./glass";

const reasonLabels: Record<string, string> = {
  APPROVED_MERCHANT_REQUIRED: "The request requires an approved merchant",
  GROUNDED_SOURCE_NOT_LINKED: "No retrieved offer source matched the citation",
  CONFLICTING_PRICE_EVIDENCE: "Price evidence conflicts or is ambiguous",
  PRICE_OR_CURRENCY_UNKNOWN: "Price or currency lacks matching evidence",
  CURRENCY_MISMATCH: "Outside this USD comparison",
  RESEARCH_BUDGET_EXCEEDED: "Above the research budget",
  BILLING_TERMS_UNKNOWN: "Billing period could not be established",
  BILLING_PERIOD_MISMATCH: "Different billing period from the request",
  DELIVERY_SLA_UNKNOWN: "Requested delivery timing lacks evidence",
  OBJECTIVE_MISMATCH: "Exceeds requested delivery time",
  PAYPAL_NOT_LISTED: "The merchant’s accepted-method list omits PayPal",
  PAYPAL_ACCEPTANCE_UNVERIFIED: "PayPal acceptance is unverified",
};

const suitability = {
  matches: "Matches requirements",
  "needs-evidence": "More evidence needed",
  "does-not-match": "Does not match",
} as const;

export function IncompleteOfferComparison({
  result,
}: {
  result: IncompleteComparison;
}) {
  return (
    <section className="offer-research" aria-label="Comparison incomplete">
      <header className="offer-research-meta">
        <strong>Comparison incomplete</strong>
        <p>
          {result.reason === "timeout"
            ? "Earmark AI ran out of time to compare offers."
            : "Earmark AI couldn’t compare offers right now."}{" "}
          Browse the search results below or try again in a moment. Prices,
          budget fit, and payment options still need verification.
        </p>
      </header>
      <div className="offer-research-sources">
        <ul aria-label="Unverified search results">
          {result.sources.map((url) => (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                {url.replace(/^https:\/\//, "")}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function OfferDiscovery({
  result,
  researchBudgetMinor = null,
  assistedCheckout = false,
  initialSelectedOfferId = null,
  initialDecisions,
}: {
  result: OfferDiscoveryResult;
  researchBudgetMinor?: number | null;
  assistedCheckout?: boolean;
  initialSelectedOfferId?: string | null;
  initialDecisions?: Record<string, ManualCheckoutDecision>;
}) {
  const resultKey = `${result.retrievedAt}:${result.instruction}`;
  const [selection, setSelection] = useState<{
    key: string;
    offerId: string | null;
  } | null>(() =>
    initialSelectedOfferId
      ? { key: resultKey, offerId: initialSelectedOfferId }
      : null,
  );
  const [decisions, setDecisions] = useState<
    Record<string, ManualCheckoutDecision>
  >(() => {
    if (!initialDecisions) return {};
    return Object.fromEntries(
      Object.entries(initialDecisions).map(([offerId, decision]) => [
        `${resultKey}:${offerId}`,
        decision,
      ]),
    );
  });

  const selectedOfferId =
    selection?.key === resultKey ? selection.offerId : null;

  function toggleOffer(offerId: string) {
    setSelection((current) =>
      current?.key === resultKey && current.offerId === offerId
        ? { key: resultKey, offerId: null }
        : { key: resultKey, offerId },
    );
  }

  function recordDecision(offerId: string, decision: ManualCheckoutDecision) {
    setDecisions((current) => ({
      ...current,
      [`${resultKey}:${offerId}`]: decision,
    }));
  }

  return (
    <section className="offer-research" aria-label="Online offer research">
      <header className="offer-research-meta">
        <strong>
          {result.source === "OFFLINE_SEARCH_FIXTURE"
            ? "Offline search fixture · no live research"
            : "Earmark AI · online research"}
        </strong>
        <p className="micro">
          Earmark cannot currently execute payments for discovered merchants.
        </p>
        {researchBudgetMinor !== null && (
          <p className="offer-research-budget">
            Research budget{" "}
            <strong>{formatResearchBudget(researchBudgetMinor)}</strong>
          </p>
        )}
        <p>
          Evidence retrieved{" "}
          <time dateTime={result.retrievedAt}>{result.retrievedAt}</time>.
          Confirm current terms on the merchant site.
        </p>
        {result.offers.length > 0 && result.reviewRecommendation === null && (
          <p>
            No comparable offer had enough evidence to recommend for review.
          </p>
        )}
      </header>
      <ul
        className="offer-research-list"
        aria-label="Discovered offer comparison"
      >
        {result.offers.map((offer, index) => {
          const citedUrls = offer.sources.flatMap((source) => {
            if (!source.cited) return [];
            const safe = safeExternalOfferUrl(source.url);
            return safe ? [safe] : [];
          });
          const safePricingUrl = offer.pricing.sourceUrl
            ? safeExternalOfferUrl(offer.pricing.sourceUrl)
            : null;
          const safePaypalUrl = offer.paypalSourceUrl
            ? safeExternalOfferUrl(offer.paypalSourceUrl)
            : null;
          const verifiedPaypalUrl =
            safePaypalUrl && citedUrls.includes(safePaypalUrl)
              ? safePaypalUrl
              : null;
          const planUrl = safeExternalOfferUrl(offer.officialMerchantUrl ?? "");
          const checkoutUrl = safePlanCheckoutUrl(
            offer.officialCheckoutUrl ?? "",
            offer.service,
          );
          const verifiedCheckoutUrl =
            checkoutUrl && citedUrls.includes(checkoutUrl) ? checkoutUrl : null;
          const merchantUrl =
            verifiedCheckoutUrl ??
            (planUrl && citedUrls.includes(planUrl) ? planUrl : null);
          const featureClaims =
            offer.features?.filter(({ sourceUrl }) =>
              citedUrls.includes(sourceUrl),
            ) ?? [];
          const billingEvidence =
            offer.billingEvidence &&
            citedUrls.includes(offer.billingEvidence.sourceUrl)
              ? offer.billingEvidence
              : null;
          const billingPeriod =
            offer.pricing.period ?? billingEvidence?.period ?? "Unknown";
          const researchReasons = offer.policy.reasons.flatMap((reason) => {
            if (reason === "BILLING_TERMS_UNKNOWN" && billingEvidence)
              return [];
            if (reason === "PAYPAL_ACCEPTANCE_UNVERIFIED") return [];
            return Object.hasOwn(reasonLabels, reason)
              ? [reasonLabels[reason]]
              : [];
          });
          const isSelected = assistedCheckout && selectedOfferId === offer.id;
          const decision = assistedCheckout
            ? decisions[`${resultKey}:${offer.id}`]
            : undefined;
          const listedPrice =
            offer.pricing.status === "source-matched" &&
            safePricingUrl &&
            citedUrls.includes(safePricingUrl) &&
            offer.priceMinor !== null &&
            offer.currency
              ? `${(Number(offer.priceMinor) / 100).toFixed(2)} ${offer.currency}`
              : null;

          return (
            <li key={offer.id} className="chat-proposal offer-research-card">
              <div className="norway-card-heading">
                <div>
                  <h4>{offer.provider}</h4>
                  <p>{offer.service}</p>
                </div>
                <Badge
                  tone={
                    offer.reviewFit === "does-not-match" ? "warning" : "info"
                  }
                >
                  {suitability[offer.reviewFit]}
                </Badge>
              </div>
              {result.reviewRecommendation === index && (
                <p className="offer-research-recommendation">
                  Recommended for review
                </p>
              )}
              <div className="offer-research-terms">
                <p className="offer-research-price">
                  Listed price:{" "}
                  {listedPrice ? (
                    <>
                      <strong className="offer-research-amount">
                        {listedPrice}
                      </strong>
                      {" · "}Source-matched
                    </>
                  ) : offer.pricing.status === "conflicting" ? (
                    "Unknown · conflicting evidence"
                  ) : (
                    "Unknown"
                  )}
                </p>
                <p>Billing period: {billingPeriod}</p>
              </div>
              <div className="offer-research-facts">
                <p>
                  Features:{" "}
                  {featureClaims.length
                    ? featureClaims.map(({ text }) => text).join(" · ")
                    : "Unknown"}
                </p>
              </div>
              <p className="offer-research-payment">
                Availability:{" "}
                {offer.availability
                  ? `${offer.availability} (reported)`
                  : "Unknown"}{" "}
                · Delivery:{" "}
                {offer.delivery ? `${offer.delivery} (reported)` : "Unknown"} ·
                SLA:{" "}
                {offer.slaMinutes === null
                  ? "unknown"
                  : `${offer.slaMinutes} minutes (claimed)`}
              </p>
              <p>
                PayPal acceptance: {offer.paypal} (
                {offer.paypal === "claimed"
                  ? "stated in a retrieved merchant-source snippet"
                  : offer.paypal === "not-listed"
                    ? "omitted from the merchant’s accepted-method list"
                    : "insufficient evidence"}
                ){offer.paypalEvidence ? ` · ${offer.paypalEvidence}` : ""}
                {verifiedPaypalUrl ? (
                  <>
                    {" "}
                    · Payment evidence:{" "}
                    <a
                      href={verifiedPaypalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                    >
                      {new URL(verifiedPaypalUrl).hostname}
                    </a>
                  </>
                ) : null}
                {offer.paypal === "claimed" &&
                  ". Checkout support has not been independently verified."}
              </p>
              {citedUrls.length > 0 ? (
                <details className="offer-research-sources">
                  <summary className="offer-research-source-toggle">
                    Sources ({citedUrls.length})
                  </summary>
                  <ul aria-label={`${offer.provider} sources`}>
                    {citedUrls.map((sourceUrl, sourceIndex) => (
                      <li key={sourceUrl}>
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                        >
                          {sourceUrl === safePricingUrl
                            ? "Pricing evidence"
                            : sourceUrl === verifiedPaypalUrl
                              ? "Payment evidence"
                              : sourceUrl === verifiedCheckoutUrl
                                ? "Checkout page evidence"
                                : sourceUrl === billingEvidence?.sourceUrl ||
                                    featureClaims.some(
                                      (claim) => claim.sourceUrl === sourceUrl,
                                    )
                                  ? "Plan details evidence"
                                  : `Source ${sourceIndex + 1}`}{" "}
                          · {new URL(sourceUrl).hostname}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <p>No matching source citation.</p>
              )}
              {researchReasons.length > 0 && (
                <p className="offer-research-reasons">
                  {researchReasons.join(" · ")}
                </p>
              )}
              {assistedCheckout && (
                <>
                  <div className="norway-assisted-bar">
                    {decision === "approved-manual" ? (
                      <Badge tone="info">
                        Manual checkout intent · not paid
                      </Badge>
                    ) : decision === "rejected" ? (
                      <Badge>Rejected · no action</Badge>
                    ) : (
                      <span>Manual external checkout review available</span>
                    )}
                    <Button
                      variant={isSelected ? "soft" : "primary"}
                      aria-expanded={isSelected}
                      onClick={() => toggleOffer(offer.id)}
                    >
                      {isSelected
                        ? "Hide manual checkout review"
                        : "Review for manual checkout"}
                    </Button>
                  </div>
                  {isSelected && (
                    <section
                      className="norway-assisted-checkout"
                      aria-label={`Assisted manual checkout for ${offer.provider} ${offer.service}`}
                    >
                      <div className="norway-card-heading">
                        <strong>
                          Assisted manual checkout · {offer.provider}
                        </strong>
                      </div>
                      <p>
                        {offer.service} · Listed price:{" "}
                        {listedPrice ?? "Unknown"} · Billing period:{" "}
                        {billingPeriod}.
                      </p>
                      <p>
                        {suitability[offer.reviewFit]}
                        {researchReasons.length
                          ? ` · ${researchReasons.join(" · ")}`
                          : ""}
                        .
                      </p>
                      <p>
                        Verify the price, taxes, availability and payment
                        methods on the merchant site. Never enter merchant
                        passwords or payment details in Earmark.
                      </p>
                      {merchantUrl ? (
                        <p>
                          <a
                            href={merchantUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                          >
                            {verifiedCheckoutUrl
                              ? "Continue to merchant checkout"
                              : "View plan on merchant site"}
                          </a>
                        </p>
                      ) : (
                        <p role="alert">
                          No verified merchant plan or checkout link was found.
                        </p>
                      )}
                      <p>
                        Return here to record your manual checkout intent.
                        Approval stays in this session and authorizes no
                        payment.
                      </p>
                      <div className="norway-assisted-actions">
                        <Button
                          variant="primary"
                          disabled={!merchantUrl}
                          aria-pressed={decision === "approved-manual"}
                          onClick={() =>
                            recordDecision(offer.id, "approved-manual")
                          }
                        >
                          Approve for manual checkout
                        </Button>
                        <Button
                          variant="soft"
                          aria-pressed={decision === "rejected"}
                          onClick={() => recordDecision(offer.id, "rejected")}
                        >
                          Reject
                        </Button>
                      </div>
                      {decision === "approved-manual" && merchantUrl && (
                        <div className="norway-assisted-status" role="status">
                          <p>
                            Manual checkout intent recorded for this session.
                            Any purchase must be completed on the merchant site.
                          </p>
                        </div>
                      )}
                      {decision === "rejected" && (
                        <div className="norway-assisted-status" role="status">
                          <p>Rejected for manual checkout.</p>
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {result.offers.length === 0 && (
        <p>No sufficiently structured offer evidence was returned.</p>
      )}
      {result.searchSuggestions && (
        <iframe
          title="Earmark AI search suggestions"
          sandbox="allow-popups"
          referrerPolicy="no-referrer"
          style={{ width: "100%", border: 0 }}
          srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https://www.gstatic.com; base-uri 'none'; form-action 'none'">${result.searchSuggestions}`}
        />
      )}
    </section>
  );
}
