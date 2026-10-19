import { Fragment, type ReactElement } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import type { AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { requestSettingsDescription } from "../state/requestDescription";
import "./request-details.css";

export interface RequestDetailsProps {
  request: AcceptedRequest;
  result: MediaVersion;
  media: MediaVersion[];
  profile?: CapabilityProfile | undefined;
  projectName: string;
  conversationName: string;
  readOnly?: boolean;
  onReuse(request: AcceptedRequest): void;
  onClose(): void;
}

/** Reads the accepted snapshot; opening details never restores the working draft. */
export function RequestDetails({ request, result, media, profile, projectName, conversationName, readOnly = false, onReuse, onClose }: RequestDetailsProps): ReactElement | null {
  const origin = result.origin;
  if (result.ownerId !== request.ownerId || result.projectId !== request.projectId || origin.kind !== "generated" || origin.requestId !== request.id || !request.slots.some(slot => slot.id === origin.slotId && slot.versionId === result.id)) return null;
  const capturedProfile = profile?.id === request.snapshot.settings.profileId && profile.revision === request.snapshot.settings.profileRevision ? profile : undefined;
  const inputs = request.snapshot.inputs.map(input => {
    const version = media.find(candidate => candidate.id === input.versionId && candidate.ownerId === request.ownerId && candidate.projectId === request.projectId);
    const role = input.role === "start-frame" ? "starting image" : input.role === "end-frame" ? "ending image" : input.role === "primary" ? "image being edited" : input.role === "clip" ? "clip" : input.role === "mask" ? "selected area" : input.role;
    return `${version?.label ?? "Unavailable input"} — ${role}`;
  });
  const rows = [
    ["Words", request.snapshot.instructions],
    ...(inputs.length ? [["Input", inputs.join("\n")]] : []),
    ["Model", capturedProfile?.label ?? request.snapshot.settings.profileId],
    ["Settings", requestSettingsDescription(request, capturedProfile, media)],
    ["Destination", `${projectName} / ${conversationName}`],
    ["Result", result.label],
  ];
  return <section className="vf-request-details" aria-label="Request details">
    <h2>Request details</h2>
    <dl>{rows.filter(([, value]) => value).map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl>
    <FreshButton tone="secondary" disabled={readOnly} title={readOnly ? "This project or conversation is read only." : undefined} onClick={() => onReuse(request)}>Reuse setup</FreshButton>
    <FreshButton tone="quiet" onClick={onClose}>Close details</FreshButton>
  </section>;
}
