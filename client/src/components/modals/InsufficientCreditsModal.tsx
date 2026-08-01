import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@promptstudio/system/components/ui/dialog";
import { createCheckoutSession } from "@/features/billing/api/billingApi";
import { CREDIT_PACKS } from "@/features/billing/creditPacks";
import { cn } from "@/utils/cn";

interface InsufficientCreditsModalProps {
  open: boolean;
  onClose: () => void;
  required: number;
  available: number;
  operation: string;
}

const choosePack = (required: number, available: number) => {
  const deficit = Math.max(required - available, 0);
  const sorted = [...CREDIT_PACKS].sort((a, b) => a.credits - b.credits);
  const matched = sorted.find((pack) => pack.credits >= deficit);
  return matched ?? sorted[sorted.length - 1] ?? null;
};

export function InsufficientCreditsModal({
  open,
  onClose,
  required,
  available,
  operation,
}: InsufficientCreditsModalProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deficit = Math.max(required - available, 0);
  const pack = useMemo(
    () => choosePack(required, available),
    [available, required],
  );

  const handleCheckout = async (): Promise<void> => {
    if (!pack || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const { url } = await createCheckoutSession(pack.priceId);
      if (!url) {
        throw new Error("Missing checkout URL");
      }
      window.location.href = url;
    } catch (checkoutError) {
      const message =
        checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to start checkout. Please try again.";
      setError(message);
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent
        className={cn(
          "motion-presence-panel w-full max-w-md border border-tool-rail-border bg-tool-panel-inner p-0 text-white",
          "[&>button]:hidden",
        )}
        data-motion-state="entered"
      >
        <div className="flex items-center justify-between border-b border-tool-rail-border px-5 py-4">
          <DialogTitle className="text-ui font-semibold text-white">
            Insufficient Credits
          </DialogTitle>
          <DialogDescription className="sr-only">
            Your balance is below the required credits for this operation.
          </DialogDescription>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-ghost transition-colors hover:bg-tool-rail-border hover:text-white"
            aria-label="Close insufficient credits modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-2">
            <p className="text-body-sm text-ghost">
              You have{" "}
              <span className="font-semibold text-white">{available}</span>{" "}
              credits.
            </p>
            <p className="text-body-sm text-ghost">
              This {operation || "generation"} costs{" "}
              <span className="font-semibold text-white">{required}</span>{" "}
              credits.
            </p>
            <p className="text-body-sm text-ghost">
              You need{" "}
              <span className="font-semibold text-amber-400">{deficit}</span>{" "}
              more.
            </p>
          </div>

          {pack ? (
            <div className="rounded-lg border border-tool-rail-border bg-tool-surface-deep p-3">
              <p className="mb-2 text-meta uppercase tracking-wide text-tool-text-subdued">
                Quick Buy
              </p>
              <Button
                type="button"
                onClick={() => void handleCheckout()}
                disabled={isLoading}
                className="motion-pulse-once h-10 w-full rounded-md bg-[linear-gradient(135deg,#6C5CE7_0%,#8B5CF6_100%)] text-body-sm font-semibold text-white hover:opacity-90"
              >
                {isLoading
                  ? "Starting checkout..."
                  : `Buy ${pack.name} - ${pack.price} (${pack.credits} cr)`}
              </Button>
            </div>
          ) : null}

          <p className="text-meta text-ghost">
            Or subscribe from $19/mo for 500 credits/month.{" "}
            <Link
              to="/billing"
              className="text-white underline decoration-tool-text-subdued underline-offset-2"
            >
              View plans
            </Link>
          </p>

          {error ? (
            <p className="motion-shake-x text-meta text-amber-400">{error}</p>
          ) : null}
        </div>

        <div className="border-t border-tool-rail-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-meta font-medium text-ghost transition-colors hover:text-white"
          >
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
