import type { ReactElement } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@promptstudio/system/components/ui/dialog";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import { MediaThumbnail } from "@/features/project-workspace/components/MediaThumbnail";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import "../imports.css";

export interface SavedImportSheetProps {
  ownerId: string;
  projectId: string;
  projectName: string;
  version: MediaVersion;
  access(versionId: string): Promise<{ url: string }>;
  onUseInput(version: MediaVersion): void;
  onClose(): void;
  readOnly?: boolean;
}

/** An explicit review of stored media, independent of the upload-progress lifecycle. */
export function isSavedImportVersion(version: MediaVersion, ownerId: string, projectId: string): boolean {
  return version.ownerId === ownerId && version.projectId === projectId && version.origin.kind === "upload" && (version.kind === "image" || version.kind === "video") && version.object.identity === "verified" && version.metadata.state === "verified" && version.association === "linked";
}

export function SavedImportSheet({ ownerId, projectId, projectName, version, access, onUseInput, onClose, readOnly = false }: SavedImportSheetProps): ReactElement | null {
  if (!isSavedImportVersion(version, ownerId, projectId)) return null;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="vf vf-saved-import-sheet" overlayClassName="vf-saved-import-backdrop" hideClose>
    <DialogTitle className="sr-only">{version.kind === "image" ? "Image added" : "Clip added"}</DialogTitle>
    <header><FreshIconButton icon="close" label="Close saved import" onClick={onClose} /></header>
    <MediaThumbnail className="vf-saved-import-preview" version={version} access={access} />
    <p className="vf-saved-import-name">{version.label} · v1</p>
    <DialogDescription className="vf-saved-import-location">Saved in {projectName}.</DialogDescription>
    <FreshButton tone="primary" disabled={readOnly} title={readOnly ? "This project or conversation is read only." : undefined} onClick={() => onUseInput(version)}>Use as input</FreshButton>
    <FreshButton tone="quiet" onClick={onClose}>Done</FreshButton>
  </DialogContent></Dialog>;
}
