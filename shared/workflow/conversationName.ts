/** The name a conversation carries until its first request is accepted. */
export const DEFAULT_CONVERSATION_NAME = "New conversation";

const MAX_NAME_LENGTH = 60;

/** A conversation's name after its first accepted request: that request's words, shortened to one line. */
export function conversationNameAfterFirstRequest(current: string, acceptedBefore: number, instructions: string): string {
  if (acceptedBefore !== 0 || current !== DEFAULT_CONVERSATION_NAME) return current;
  const words = instructions.replace(/\s+/g, " ").trim();
  if (!words) return current;
  if (words.length <= MAX_NAME_LENGTH) return words;
  const cut = words.slice(0, MAX_NAME_LENGTH - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > MAX_NAME_LENGTH / 2 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}
