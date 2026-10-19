import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { DraftContent } from "@shared/schemas/workflow/draft.schemas";

/** Choosing a model keeps entered values and fills the rest from the model's defaults. */
export function settingsForProfile(profile: CapabilityProfile, content: DraftContent): DraftContent["settings"] {
  const parameters: DraftContent["settings"]["parameters"] = {};
  for (const [name, policy] of Object.entries(profile.parameters)) {
    if (content.settings.parameters[name] !== undefined) parameters[name] = content.settings.parameters[name];
    else if (policy.policy === "fixed") parameters[name] = policy.value;
    else if (policy.policy === "editable") parameters[name] = policy.defaultValue;
  }
  // Retained incompatible values remain visible; preparation never silently clamps them.
  return { profileId: profile.id, profileRevision: profile.revision, parameters: { ...content.settings.parameters, ...parameters }, outputCount: content.settings.outputCount };
}

/** A new action has not chosen a model for itself yet. */
export function settingsForAction(content: DraftContent): DraftContent["settings"] {
  return { ...content.settings, profileId: "unselected", profileRevision: "unresolved" };
}
