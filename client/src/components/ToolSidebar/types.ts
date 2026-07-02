import type { ReactNode } from "react";
import type { User, PromptHistoryEntry } from "@features/prompt-optimizer";
import type { Asset, AssetType } from "@shared/types/asset";
import type { AppIcon } from "@/types";
import type {
  DraftModel,
  GenerationOverrides,
  KeyframeTile,
  SidebarUploadedImage,
  StartImage,
  VideoTier,
} from "@features/generation-controls";

export type ToolPanelType = "sessions" | "studio" | "characters" | "styles";
export type {
  DraftModel,
  GenerationOverrides,
  KeyframeTile,
  SidebarUploadedImage,
  StartImage,
  VideoTier,
} from "@features/generation-controls";

export interface ToolSidebarSessionsDomain {
  history: PromptHistoryEntry[];
  filteredHistory: PromptHistoryEntry[];
  isLoadingHistory: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onLoadFromHistory: (entry: PromptHistoryEntry) => void;
  onCreateNew: () => void;
  onDelete: (id: string) => void;
  onDuplicate?: (entry: PromptHistoryEntry) => void;
  onRename?: (entry: PromptHistoryEntry, title: string) => void;
  currentPromptUuid?: string | null;
  currentPromptDocId?: string | null;
  activeStatusLabel?: string;
  activeModelLabel?: string;
}

export interface ToolSidebarPromptInteractionDomain {
  onInsertTrigger: (trigger: string) => void;
  onCreateFromTrigger?: (trigger: string) => void;
  isProcessing?: boolean;
}

export interface ToolSidebarGenerationDomain {
  onDraft: (model: DraftModel, overrides?: GenerationOverrides) => void;
  onRender: (model: string, overrides?: GenerationOverrides) => void;
  onImageUpload?: (file: File) => void | Promise<void>;
  onStartFrameUpload?: (file: File) => void | Promise<void>;
  onUploadSidebarImage?: (file: File) => Promise<SidebarUploadedImage | null>;
  onStoryboard: () => void;
}

export interface ToolSidebarAssetsDomain {
  assets: Asset[];
  assetsByType: Record<AssetType, Asset[]>;
  isLoadingAssets: boolean;
  onEditAsset: (assetId: string) => void;
  onCreateAsset: (type: AssetType) => void;
}

export type OptionalToolSidebarSessionsDomain =
  ToolSidebarSessionsDomain | null;
export type OptionalToolSidebarPromptInteractionDomain =
  ToolSidebarPromptInteractionDomain | null;
export type OptionalToolSidebarGenerationDomain =
  ToolSidebarGenerationDomain | null;
export type OptionalToolSidebarAssetsDomain = ToolSidebarAssetsDomain | null;

export interface ToolSidebarProps {
  user: User | null;
  forceDefaultPanel?: boolean | undefined;
}

export interface ToolRailProps {
  activePanel: ToolPanelType;
  onPanelChange: (panel: ToolPanelType) => void;
  user: User | null;
}

export interface ToolPanelProps {
  activePanel: ToolPanelType;
  children: ReactNode;
}

export interface ToolNavItem {
  id: ToolPanelType;
  icon: AppIcon;
  label: string;
  variant: "header" | "default";
}
