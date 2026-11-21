export interface BoundSandboxOffer {
  id: string;
  provider: string;
  service: string;
  priceMinor: number;
  currency: "USD";
  billing: "month";
  features: readonly string[];
}

export const MAX_SANDBOX_CHECKOUT_MINOR = 600;

export const BOUND_SANDBOX_OFFERS: readonly BoundSandboxOffer[] = [
  {
    id: "sandbox-weather-starter",
    provider: "Earmark Sandbox Weather API",
    service: "Starter Plan (Bound Sandbox Merchant)",
    priceMinor: 400,
    currency: "USD",
    billing: "month",
    features: [
      "100,000 API calls per month",
      "Current weather & 5-day forecast",
      "Direct PayPal Sandbox Checkout",
    ],
  },
  {
    id: "sandbox-weather-pro",
    provider: "Earmark Sandbox Weather API",
    service: "Pro Plan (Bound Sandbox Merchant)",
    priceMinor: 600,
    currency: "USD",
    billing: "month",
    features: [
      "1,000,000 API calls per month",
      "Hourly forecasts, marine & air quality",
      "Direct PayPal Sandbox Checkout",
    ],
  },
] as const;

export function findBoundSandboxOffer(
  id: string,
): BoundSandboxOffer | undefined {
  return BOUND_SANDBOX_OFFERS.find((offer) => offer.id === id);
}

export function formatUsdMinor(minor: number): string {
  return `$${(minor / 100).toFixed(2)} USD`;
}
