"use client";
import { useState } from "react";
import {
  safeExternalOfferUrl,
  selectVerifiedOfferSourceUrl,
  type DiscoveredOffer,
  type ManualCheckoutDecision,
  type OfferDiscoveryResult,
} from "../lib/offer-discovery";
import { Badge, Button } from "./glass";

const reasonLabels: Record<string, string> = {
  EXTERNAL_MERCHANT_NOT_BOUND: "Merchant is outside the approved catalog",
  APPROVED_MERCHANT_REQUIRED: "The request requires an approved merchant",
  IMMUTABLE_TERMS_UNVERIFIED: "Purchase terms are unverified",
  HUMAN_AUTHORIZATION_REQUIRED: "Human authorization would be required",
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

function unresolvedEvidence(offer: DiscoveredOffer): string[] {
  const items: string[] = [];
  if (offer.pricing.status === "conflicting")
    items.push("conflicting snippet prices");
  else if (offer.priceMinor === null || !offer.currency)
    items.push("verified price and currency");
  if (!offer.pricing.period) items.push("billing period");
  if (!offer.availability) items.push("plan availability");
  if (!offer.delivery) items.push("delivery terms");
  if (offer.slaMinutes === null) items.push("SLA timing");
  if (offer.paypal === "unknown") items.push("PayPal acceptance");
  else if (offer.paypal === "not-listed")
    items.push("PayPal omitted from published payment methods");
  else items.push("live PayPal checkout verification");
  return items;
}

export function OfferDiscovery({
  result,
  assistedCheckout = false,
  initialSelectedOfferId = null,
  initialDecisions,
}: {
  result: OfferDiscoveryResult;
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
      <strong>
        {result.source === "OFFLINE_SEARCH_FIXTURE"
          ? "Offline search fixture · no live research"
          : "Tavily Search + Gemini · online research"}
      </strong>
      <p>
        Compare real merchant offers for review. Earmark payments are
        unavailable for these offers.
      </p>
      <p>
        Evidence retrieved{" "}
        <time dateTime={result.retrievedAt}>{result.retrievedAt}</time>. Confirm
        current terms on the merchant site.
      </p>
      {result.offers.length > 0 && result.reviewRecommendation === null && (
        <p>No comparable offer had enough evidence to recommend for review.</p>
      )}
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
          const verifiedMerchantUrl = selectVerifiedOfferSourceUrl(offer);
          const isSelected = assistedCheckout && selectedOfferId === offer.id;
          const decision = assistedCheckout
            ? decisions[`${resultKey}:${offer.id}`]
            : undefined;
          const unknowns = unresolvedEvidence(offer);

          return (
            <li key={offer.id} className="chat-proposal offer-research-card">
              <div className="norway-card-heading">
                <div>
                  <h4>{offer.provider}</h4>
                  <p>{offer.service}</p>
                </div>
                <Badge tone="warning">Ineligible for Earmark payment</Badge>
              </div>
              <p>
                {result.reviewRecommendation === index ? (
                  <Badge tone="info">Recommended for review</Badge>
                ) : offer.reviewFit === "matches" ? (
                  "Matches the supported research criteria"
                ) : offer.reviewFit === "does-not-match" ? (
                  "Outside the requested criteria"
                ) : (
                  "More evidence needed"
                )}
              </p>
              <p className="offer-research-price">
                Listed price:{" "}
                {offer.priceMinor !== null && offer.currency ? (
                  <>
                    <strong className="offer-research-amount">
                      {(Number(offer.priceMinor) / 100).toFixed(2)}{" "}
                      {offer.currency}
                    </strong>
                    {" · "}Source-matched claim
                  </>
                ) : offer.pricing.status === "conflicting" ? (
                  "Unknown · conflicting evidence"
                ) : (
                  "Unknown"
                )}
              </p>
              <p>Billing period: {offer.pricing.period ?? "Unknown"}</p>
              <p>
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
                ) · {offer.paypalEvidence ?? "No supporting evidence"}
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
                . Checkout support has not been independently verified.
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
              <p>
                Independent policy: {offer.policy.canonicalVerdict}.{" "}
                {offer.policy.reasons
                  .map((reason) => reasonLabels[reason] ?? reason)
                  .join(" · ")}
              </p>
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
                        <Badge tone="warning">
                          Unapproved merchant · manual only
                        </Badge>
                      </div>
                      <p>
                        Merchant: {offer.provider} ({offer.service}) · External
                        merchant outside Earmark’s approved PayPal catalog.
                      </p>
                      <p>
                        Snippet price:{" "}
                        {offer.priceMinor !== null && offer.currency
                          ? `${(Number(offer.priceMinor) / 100).toFixed(2)} ${offer.currency} · source-matched claim`
                          : offer.pricing.status === "conflicting"
                            ? "Conflicting evidence (unknown)"
                            : "Unknown"}{" "}
                        · Currency: {offer.currency ?? "Unknown"} · Billing
                        period: {offer.pricing.period ?? "Unknown"}.
                      </p>
                      <p>
                        Restrictions: {offer.policy.canonicalVerdict}.{" "}
                        {offer.policy.reasons
                          .map((reason) => reasonLabels[reason] ?? reason)
                          .join(" · ")}
                      </p>
                      <p>
                        Unresolved or unverified details: {unknowns.join(", ")}.
                      </p>
                      <p>
                        Verify the price, taxes, availability and payment
                        methods on the merchant site. Never enter merchant
                        passwords or payment details in Earmark.
                      </p>
                      {verifiedMerchantUrl ? (
                        <p>
                          Official merchant page:{" "}
                          <a
                            href={verifiedMerchantUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                          >
                            Open official {offer.provider} page in new tab
                          </a>
                        </p>
                      ) : (
                        <p role="alert">
                          Official merchant link withheld: no cited, safe HTTPS
                          source URL passed provenance checks. Manual checkout
                          approval is unavailable for this offer.
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
                          disabled={!verifiedMerchantUrl}
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
                      {decision === "approved-manual" &&
                        verifiedMerchantUrl && (
                          <div className="norway-assisted-status" role="status">
                            <p>
                              Intention recorded (status: not paid · external
                              purchase unverified). No order, mandate, payment
                              intent, reservation, capture or accounting entry
                              was created, and {offer.provider} remains an
                              unapproved external merchant.
                            </p>
                            <p>
                              Next step: return to{" "}
                              <a
                                href={verifiedMerchantUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                referrerPolicy="no-referrer"
                              >
                                the official {offer.provider} website
                              </a>{" "}
                              in a new tab to complete registration and genuine
                              checkout manually on the merchant’s site.
                            </p>
                          </div>
                        )}
                      {decision === "rejected" && (
                        <div className="norway-assisted-status" role="status">
                          <p>
                            Rejected for manual checkout. No intention, order,
                            reservation or financial record was created.
                          </p>
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
          title="Google Search suggestions"
          sandbox="allow-popups"
          referrerPolicy="no-referrer"
          style={{ width: "100%", border: 0 }}
          srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https://www.gstatic.com; base-uri 'none'; form-action 'none'">${result.searchSuggestions}`}
        />
      )}
      <Button disabled>Payment execution disabled</Button>
    </section>
  );
}
