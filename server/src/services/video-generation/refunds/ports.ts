/** Compatibility for persisted jobs that reserved credits before free validation. */
export interface RefundCreditsOptions {
  refundKey: string;
  reason?: string;
}

export interface CreditRefunder {
  refundCredits(
    userId: string,
    cost: number,
    options?: RefundCreditsOptions,
  ): Promise<boolean>;
}
