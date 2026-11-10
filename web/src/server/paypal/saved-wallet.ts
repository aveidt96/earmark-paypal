import "server-only";
import { z } from "zod";
import type { PayPalCheckoutSettings } from "./config";
import {
  type Mandate,
  type PaymentInput,
  PaymentError,
  fingerprint,
  identitySchema,
  paypalMerchantSchema,
  paymentInputSchema,
} from "./domain";
import { merchantBinding } from "./test-config";

// A dedicated mandate and fixed key keep this purchase out of ordinary checkout.
export const savedWalletPurchaseKey = "paypal-wallet-once-v1";
export const isSavedWalletPurchase = (key: string) =>
  key === savedWalletPurchaseKey;

const savedWalletConsentSchema = z.strictObject({
  vaultId: z.string().regex(/^[0-9a-zA-Z_-]{1,255}$/),
  payerId: z.string().regex(/^[0-9a-zA-Z_-]{1,36}$/),
  appMerchantBinding: z.string().regex(/^[a-f0-9]{64}$/),
  ownerId: identitySchema,
  purchase: paymentInputSchema,
  evidence: z.literal("PAYPAL_APPROVED_AND_EXCHANGED"),
  usageType: z.literal("MERCHANT"),
  usagePattern: z.literal("IMMEDIATE"),
  approvedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

/** From a verified, private PayPal consent/exchange. Never accepted from an HTTP body. */
export type SavedWalletConsent = z.infer<typeof savedWalletConsentSchema>;
export type SavedWalletScope = Pick<
  SavedWalletConsent,
  "ownerId" | "purchase" | "expiresAt"
>;

export function checkSavedWalletWindow(expiresAt: string, now: number) {
  if (!(Date.parse(expiresAt) > now))
    throw new PaymentError("PAYPAL_SAVED_WALLET_CONSENT_EXPIRED");
}

export function validateSavedWalletConsent(
  raw: unknown,
  settings: PayPalCheckoutSettings,
  expectedPayerId: string,
  now: number,
) {
  const parsed = savedWalletConsentSchema.safeParse(raw);
  if (!parsed.success)
    throw new PaymentError("PAYPAL_SAVED_WALLET_CONSENT_REQUIRED");
  const consent = parsed.data;
  if (
    !settings.paymentsEnabled ||
    settings.orderOnlyPermission ||
    settings.captureOnlyPermission ||
    !settings.credentialSellerOnly ||
    !paypalMerchantSchema.safeParse(settings.merchantId).success ||
    consent.payerId !== expectedPayerId ||
    consent.purchase.merchantId !== settings.merchantId ||
    consent.appMerchantBinding !==
      merchantBinding(settings.clientId, settings.merchantId) ||
    !isSavedWalletPurchase(consent.purchase.purchaseKey) ||
    consent.purchase.currency !== "USD" ||
    Date.parse(consent.approvedAt) > now
  )
    throw new PaymentError("PAYPAL_SAVED_WALLET_BINDING_MISMATCH");
  checkSavedWalletWindow(consent.expiresAt, now);
  return consent;
}

export function checkSavedWalletPurchase(
  scope: SavedWalletScope | undefined,
  purchase: PaymentInput,
) {
  if (isSavedWalletPurchase(purchase.purchaseKey) !== !!scope)
    throw new PaymentError("PAYPAL_SAVED_WALLET_SCOPE_REQUIRED");
  if (scope && fingerprint(scope.purchase) !== fingerprint(purchase))
    throw new PaymentError("PAYPAL_SAVED_WALLET_PURCHASE_MISMATCH");
}

export function checkSavedWalletMandate(
  scope: SavedWalletScope,
  mandate: Mandate,
  now: number,
) {
  const p = scope.purchase;
  checkSavedWalletWindow(scope.expiresAt, now);
  if (
    mandate.id !== p.mandateId ||
    mandate.ownerId !== scope.ownerId ||
    mandate.merchants.length !== 1 ||
    mandate.merchants[0] !== p.merchantId ||
    mandate.currency !== p.currency ||
    mandate.capMinor !== p.amountMinor ||
    mandate.perTransactionMinor !== p.amountMinor ||
    Date.parse(scope.expiresAt) > Date.parse(mandate.expiresAt)
  )
    throw new PaymentError("PAYPAL_SAVED_WALLET_MANDATE_MISMATCH");
}
