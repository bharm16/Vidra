/** A phrase the creator kept fixed while their words were expanded. */
export interface LockedSpan {
  id: string;
  text: string;
  leftCtx?: string;
  rightCtx?: string;
  category?: string;
  source?: string;
  confidence?: number;
}
