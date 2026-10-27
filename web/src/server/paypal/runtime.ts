import "server-only";
import { paypalSettings } from "./config";
import { PayPalClient } from "./client";
import {
  assertPayPalDatabase,
  paypalDatabase,
  PostgresPaymentRepository,
} from "./postgres";
import { PayPalPaymentService } from "./service";
import { PayPalWebhookService } from "./webhooks";

let instance: Promise<PayPalWebhookService> | undefined;
export function getPayPalWebhooks(): Promise<PayPalWebhookService> {
  if (!instance) {
    instance = (async () => {
      const settings = paypalSettings();
      const pool = paypalDatabase();
      try {
        await assertPayPalDatabase(pool);
        return new PayPalWebhookService(
          new PayPalPaymentService(
            new PostgresPaymentRepository(pool),
            new PayPalClient(settings),
            Date.now,
            settings.merchantId,
          ),
        );
      } catch (error) {
        await pool.end();
        throw error;
      }
    })();
    instance.catch(() => {
      instance = undefined;
    });
  }
  return instance;
}
