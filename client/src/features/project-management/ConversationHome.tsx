import type { ReactElement, ReactNode } from "react";
import { Button } from "@promptstudio/system/button";
import type { ConversationListing, ConversationMediaCount } from "@shared/schemas/workflow/project.schemas";
import "./project-management.css";

export interface ConversationHomeProps {
  /** The open project's name; the library and signed-out homes have none. */
  title?: string;
  /** Controls for the open project, shown beside its name. */
  actions?: ReactNode;
  composer: ReactNode;
  conversations: ConversationListing[];
  onOpenConversation(id: string): void;
}

function editedAt(value: string): string {
  const edited = new Date(value);
  const today = new Date();
  const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(edited.getFullYear(), edited.getMonth(), edited.getDate()).getTime()) / 86_400_000);
  if (days <= 0) return "Edited today";
  if (days === 1) return "Edited yesterday";
  if (days < 7) return `Edited ${days} days ago`;
  if (days < 14) return "Edited last week";
  return `Edited ${edited.toLocaleDateString()}`;
}

/** Rows from a server without counts, or with nothing made yet, show only the edit time. */
function mediaCount(media: ConversationMediaCount | undefined): string {
  if (!media) return "";
  const parts = [media.pictures ? `${media.pictures} ${media.pictures === 1 ? "picture" : "pictures"}` : "", media.clips ? `${media.clips} ${media.clips === 1 ? "clip" : "clips"}` : ""].filter(Boolean);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

/** P02 keeps the current composer above the project's saved conversations. */
export function ConversationHome({ title, actions, composer, conversations, onOpenConversation }: ConversationHomeProps): ReactElement {
  return <main className="vf-conversation-home" aria-label={title ?? "Project conversations"}>
    <div className="vf-conversation-home-content">
      {/* The library home has no name (P02), only its options: rename, archive, restore and file conversations. */}
      {title !== undefined || actions ? <header className="vf-conversation-home-heading" data-untitled={title === undefined || undefined}>{title !== undefined ? <h1 className="vf-conversation-home-title">{title}</h1> : <span />}{actions}</header> : null}
      {composer}
      <div className="vf-conversation-home-list" aria-label="Conversations">
        {conversations.filter(conversation => conversation.status === "active").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(conversation => <Button key={conversation.id} variant="ghost" className="vf-conversation-home-row !h-auto" aria-label={`${conversation.name}, ${editedAt(conversation.updatedAt)}${mediaCount(conversation.media)}`} onClick={() => onOpenConversation(conversation.id)}>
          <img src="/design-assets/fidelity-project-conversation.svg" alt="" />
          <span className="vf-conversation-home-label"><span>{conversation.name}</span><span className="vf-conversation-home-meta"><time dateTime={conversation.updatedAt}>{editedAt(conversation.updatedAt)}</time>{mediaCount(conversation.media)}</span></span>
        </Button>)}
      </div>
    </div>
  </main>;
}
