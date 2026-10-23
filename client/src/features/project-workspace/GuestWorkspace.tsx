import type { ReactElement } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FreshRail, type FreshDestination } from "@/components/fresh/FreshRail";
import { ConversationHome } from "@/features/project-management/ConversationHome";
import { PromptComposer } from "./components/PromptComposer";
import { useGuestComposer } from "./hooks/useGuestComposer";
import "./workspace.css";

/** Signed-out visitors get the real create workspace; making something asks them to sign up first. */
export function GuestWorkspace(): ReactElement {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const guest = useGuestComposer(search.get("intent"));
  const requireAccount = (): void => {
    const claim = guest.keep();
    navigate(`/signup?redirect=${encodeURIComponent(`/app?claim=${claim}`)}`);
  };
  const navigation = (destination: FreshDestination): void => {
    if (destination === "home") navigate("/");
    else if (destination === "help") navigate("/docs");
    else if (destination !== "create") requireAccount();
  };
  return <div className="vf vf-project-home-shell">
    <FreshRail active="create" onNavigate={navigation} mobile tools />
    <ConversationHome conversations={[]} onOpenConversation={() => undefined} composer={<PromptComposer
      controller={guest.controller}
      capabilityLookupStatus={guest.lookupStatus}
      assistance="account-required"
      onAccountRequired={requireAccount}
      onChooseInput={requireAccount}
      onSketch={requireAccount}
      onActionChange={guest.changeAction}
      onSubmit={async () => { requireAccount(); }}
    />} />
  </div>;
}
