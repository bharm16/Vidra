/**
 * Payment Route Registration
 *
 * Registers Stripe payment and billing routes.
 * Auth + starter credits required.
 */

import type { Application } from "express";
import type { DIContainer } from "@infrastructure/DIContainer";
import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createStarterCreditsMiddleware } from "@middleware/starterCredits";
import { createPaymentRoutes } from "@routes/payment.routes";
import type { PaymentRouteServices } from "@routes/payment/types";
import type { PaymentConsistencyStore } from "@services/payment/PaymentConsistencyStore";
import { resolveOptionalService } from "./resolve-utils.ts";

/**
 * The one resolver for PaymentRouteServices — shared with app.ts's raw-body
 * webhook mount, which used to rebuild this by hand with a bare (throwing)
 * resolve of paymentConsistencyStore while this path degraded gracefully.
 */
export function resolvePaymentRouteServices(
  container: DIContainer,
): PaymentRouteServices {
  const paymentConsistencyStore =
    resolveOptionalService<PaymentConsistencyStore | null>(
      container,
      "paymentConsistencyStore",
      "payment",
    );
  return {
    paymentService:
      container.resolve<PaymentRouteServices["paymentService"]>(
        "paymentService",
      ),
    webhookEventStore: container.resolve<
      PaymentRouteServices["webhookEventStore"]
    >("stripeWebhookEventStore"),
    billingProfileStore: container.resolve<
      PaymentRouteServices["billingProfileStore"]
    >("billingProfileStore"),
    userCreditService:
      container.resolve<PaymentRouteServices["userCreditService"]>(
        "userCreditService",
      ),
    ...(paymentConsistencyStore ? { paymentConsistencyStore } : {}),
    firestoreCircuitExecutor: container.resolve<
      NonNullable<PaymentRouteServices["firestoreCircuitExecutor"]>
    >("firestoreCircuitExecutor"),
  };
}

export function registerPaymentRoutes(
  app: Application,
  container: DIContainer,
): void {
  const paymentRouteServices = resolvePaymentRouteServices(container);
  // Resolved separately: the starter-credits middleware needs the concrete
  // service's ensureStarterGrant, which the narrower route-facing port omits.
  const userCreditService = container.resolve("userCreditService");

  const starterCreditsMiddleware =
    createStarterCreditsMiddleware(userCreditService);
  const paymentRoutes = createPaymentRoutes(paymentRouteServices);
  app.use(
    "/api/payment",
    apiAuthMiddleware,
    starterCreditsMiddleware,
    paymentRoutes,
  );
}
