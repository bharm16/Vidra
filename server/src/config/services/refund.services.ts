import type { DIContainer } from "@infrastructure/DIContainer";
import { LegacyCreditRefundService } from "@services/video-generation/refunds/LegacyCreditRefundService";
import { createCreditRefundSweeper } from "@services/video-generation/refunds/CreditRefundSweeper";
import {
  RefundFailureStore,
  setRefundFailureStore,
} from "@services/video-generation/refunds/RefundFailureStore";
import type { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import type { ServiceConfig } from "./service-config.types";

/** Retains existing refund keys, user balances and durable failed-refund recovery. */
export function registerRefundServices(container: DIContainer): void {
  container.register(
    "legacyCreditRefunder",
    (executor: FirestoreCircuitExecutor) =>
      new LegacyCreditRefundService(executor),
    ["firestoreCircuitExecutor"],
  );
  container.register(
    "refundFailureStore",
    (executor: FirestoreCircuitExecutor) => {
      const store = new RefundFailureStore(executor);
      setRefundFailureStore(store);
      return store;
    },
    ["firestoreCircuitExecutor"],
  );
  container.register(
    "creditRefundSweeper",
    (
      store: RefundFailureStore,
      refunder: LegacyCreditRefundService,
      config: ServiceConfig,
    ) =>
      createCreditRefundSweeper(
        store,
        refunder,
        undefined,
        config.credits.refundSweeper,
      ),
    ["refundFailureStore", "legacyCreditRefunder", "config"],
  );
}
