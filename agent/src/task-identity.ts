import { identity, hashSchema, addressSchema } from "./domain.js";
import { z } from "zod";
export const taskDescriptionSchema = z.string().trim().min(12).max(1000);
/** Versioned owner-text commitment shared by browser creation and server registration; not semantic proof. */
export function mandateTaskHash(
  vault: string,
  description: string,
  salt: string,
) {
  return identity(
    "flint-task-v1",
    addressSchema.parse(vault),
    taskDescriptionSchema.parse(description),
    hashSchema.parse(salt),
  );
}
