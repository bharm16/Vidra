import { z } from "zod";
import type { CapabilityValues } from "@shared/capabilities";

const STORAGE_KEYS = {
  selectedMode: "prompt-optimizer:selectedMode",
  selectedModel: "prompt-optimizer:selectedModel",
  generationParams: "prompt-optimizer:generationParams",
  videoTier: "prompt-optimizer:videoTier",
} as const;

const CapabilityValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const CapabilityValuesSchema = z.record(z.string(), CapabilityValueSchema);
const SelectedModeSchema = z.string();
const SelectedModelSchema = z.string();
const VideoTierSchema = z.enum(["draft", "render"]);

const safeParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const loadSelectedModel = (): string => {
  if (typeof window === "undefined") return "";
  try {
    const value = window.localStorage.getItem(STORAGE_KEYS.selectedModel);
    if (!value) return "";
    const parsed = SelectedModelSchema.safeParse(value);
    return parsed.success ? parsed.data : "";
  } catch {
    return "";
  }
};

export const loadSelectedMode = (): string => {
  if (typeof window === "undefined") return "video";
  try {
    const value = window.localStorage.getItem(STORAGE_KEYS.selectedMode);
    if (!value) return "video";
    const parsed = SelectedModeSchema.safeParse(value);
    if (!parsed.success) return "video";
    return parsed.data.trim() ? parsed.data : "video";
  } catch {
    return "video";
  }
};

export const loadGenerationParams = (): CapabilityValues => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.generationParams);
    if (!raw) return {};
    const parsed = CapabilityValuesSchema.safeParse(safeParseJson(raw));
    return parsed.success ? (parsed.data as CapabilityValues) : {};
  } catch {
    return {};
  }
};

export const loadVideoTier = (): "draft" | "render" => {
  if (typeof window === "undefined") return "render";
  try {
    const value = window.localStorage.getItem(STORAGE_KEYS.videoTier);
    if (!value) return "render";
    const parsed = VideoTierSchema.safeParse(value);
    return parsed.success ? parsed.data : "render";
  } catch {
    return "render";
  }
};

export const persistSelectedMode = (value: string): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.selectedMode, value ?? "");
  } catch {
    // ignore
  }
};

export const persistSelectedModel = (value: string): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.selectedModel, value ?? "");
  } catch {
    // ignore
  }
};

export const persistGenerationParams = (value: CapabilityValues): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.generationParams,
      JSON.stringify(value ?? {}),
    );
  } catch {
    // ignore
  }
};
