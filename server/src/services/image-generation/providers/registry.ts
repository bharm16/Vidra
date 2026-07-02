import type {
  ImagePreviewProvider,
  ImagePreviewProviderId,
  ImagePreviewProviderSelection,
} from "./types";
import { IMAGE_PREVIEW_PROVIDER_IDS } from "./types";

const PROVIDER_ALIASES: Record<string, ImagePreviewProviderId> = {
  replicate: "replicate-flux-schnell",
  kontext: "replicate-flux-kontext-fast",
  "kontext-fast": "replicate-flux-kontext-fast",
  "replicate-kontext": "replicate-flux-kontext-fast",
  "replicate-kontext-fast": "replicate-flux-kontext-fast",
};

const PROVIDER_ID_SET = new Set<string>(IMAGE_PREVIEW_PROVIDER_IDS);

export interface ProviderPlanOptions {
  providers: ImagePreviewProvider[];
  requestedProvider: ImagePreviewProviderSelection;
  fallbackOrder?: ImagePreviewProviderId[];
  /** Whether the request carries an input image. Defaults to false. */
  hasInputImage?: boolean;
}

export function isImagePreviewProviderId(
  value: string,
): value is ImagePreviewProviderId {
  return PROVIDER_ID_SET.has(value);
}

function resolveProviderId(value: string): ImagePreviewProviderId | null {
  const normalized = value.trim().toLowerCase();
  const alias = PROVIDER_ALIASES[normalized];
  if (alias) {
    return alias;
  }
  return isImagePreviewProviderId(normalized) ? normalized : null;
}

export function resolveImagePreviewProviderSelection(
  value: string | undefined,
): ImagePreviewProviderSelection | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "auto") {
    return "auto";
  }

  return resolveProviderId(normalized);
}

export function parseImagePreviewProviderOrder(
  value: string | undefined,
): ImagePreviewProviderId[] {
  if (!value) {
    return [];
  }

  const order: ImagePreviewProviderId[] = [];
  const seen = new Set<ImagePreviewProviderId>();

  for (const entry of value.split(",")) {
    const resolved = resolveProviderId(entry);
    if (!resolved || seen.has(resolved)) {
      continue;
    }
    order.push(resolved);
    seen.add(resolved);
  }

  return order;
}

export function buildProviderPlan(
  options: ProviderPlanOptions,
): ImagePreviewProvider[] {
  const availableProviders = options.providers.filter((provider) =>
    provider.isAvailable(),
  );
  const providerById = new Map(
    availableProviders.map((provider) => [provider.id, provider]),
  );

  // An explicitly requested provider is honored as-is: if it can't serve
  // the request it fails with its own (clear) error.
  if (options.requestedProvider !== "auto") {
    const provider = providerById.get(options.requestedProvider);
    return provider ? [provider] : [];
  }

  // Auto plans only include providers capable of serving the request:
  // img2img-only providers are skipped for text-only requests so their
  // "input image required" errors never mask the real failure.
  const canServe = (provider: ImagePreviewProvider): boolean =>
    Boolean(options.hasInputImage) || !provider.requiresInputImage;

  if (options.fallbackOrder && options.fallbackOrder.length > 0) {
    return options.fallbackOrder
      .map((id) => providerById.get(id))
      .filter(
        (provider): provider is ImagePreviewProvider =>
          Boolean(provider) && canServe(provider as ImagePreviewProvider),
      );
  }

  return availableProviders.filter(canServe);
}
