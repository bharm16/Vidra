import { z } from "zod";

export const SUPPORT_TOPICS = [
  { value: "support", label: "Support", accessible: "Support request", subject: "Support request" },
  { value: "feedback", label: "Feedback", accessible: "Product feedback", subject: "Product feedback" },
  { value: "security", label: "Security", accessible: "Security report", subject: "Security report" },
  { value: "data", label: "Account data", accessible: "Request account data", subject: "Account data request" },
  { value: "deletion", label: "Delete account", accessible: "Account deletion request", subject: "Account deletion request" },
] as const;
export type SupportTopic = typeof SUPPORT_TOPICS[number]["value"];
const topicSchema = z.enum(["support", "feedback", "security", "data", "deletion"]);
export const supportDraftSchema = z.object({
  email: z.string().trim().max(254).refine(value => !value || z.string().email().safeParse(value).success, "Enter a valid email address, or leave it blank."),
  message: z.string().trim().min(1, "Describe what you need help with.").max(8000, "Keep your message under 8,000 characters."),
});
export function supportTopic(value: string | null): SupportTopic {
  const parsed = topicSchema.safeParse(value);
  return parsed.success ? parsed.data : "support";
}
export function supportAddress(): string {
  const configured: unknown = import.meta.env.VITE_SUPPORT_EMAIL;
  const parsed = z.string().trim().email().safeParse(configured);
  return parsed.success ? parsed.data : "support@vidra.app";
}
export function supportDraft(topic: SupportTopic, email: string, message: string): { subject: string; body: string; url: string } {
  const subject = SUPPORT_TOPICS.find(option => option.value === topic)?.subject ?? "Support request";
  const body = [`From: ${email.trim() || "[your email]"}`, `Topic: ${topic}`, "", message || "[describe what you need help with]"].join("\n");
  return { subject, body, url: `mailto:${supportAddress()}?${new URLSearchParams({ subject, body }).toString()}` };
}
export function openSupportDraft(url: string): void { window.location.href = url; }
