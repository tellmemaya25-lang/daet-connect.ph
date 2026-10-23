/**
 * Booking chat rules shared by the server actions and the thread UI. The
 * database trigger tours_messages_before_insert enforces the same limits.
 */

export const MESSAGE_MAX_LENGTH = 1000;
export const MESSAGE_ATTACHMENT_BUCKET = "tours-message-attachments";
export const MESSAGE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const MESSAGE_PAGE_SIZE = 100;
export const MESSAGE_ATTACHMENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type AttachmentType = keyof typeof MESSAGE_ATTACHMENT_TYPES;

export type MessageInput = {
  text: string | null;
  file: File | null;
  extension: (typeof MESSAGE_ATTACHMENT_TYPES)[AttachmentType] | null;
};

export function parseMessageForm(formData: FormData): { ok: true; data: MessageInput } | { ok: false; error: string } {
  const text = String(formData.get("text") ?? "").trim();
  const raw = formData.get("attachment");
  const file = raw instanceof File && raw.size > 0 ? raw : null;

  if (!text && !file) return { ok: false, error: "Write a message or attach a photo." };
  if (text.length > MESSAGE_MAX_LENGTH) return { ok: false, error: `Messages can be at most ${MESSAGE_MAX_LENGTH} characters.` };

  if (!file) return { ok: true, data: { text, file: null, extension: null } };
  if (!(file.type in MESSAGE_ATTACHMENT_TYPES)) return { ok: false, error: "Attach a JPG, PNG or WebP photo." };
  if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) return { ok: false, error: "Photos can be at most 5 MB." };
  return { ok: true, data: { text: text || null, file, extension: MESSAGE_ATTACHMENT_TYPES[file.type as AttachmentType] } };
}

export function attachmentPath(conversationId: string, extension: string, id: string = crypto.randomUUID()): string {
  return `${conversationId}/${id}.${extension}`;
}

export type ChatRole = "tourist" | "operator" | "guide" | "admin";

export type ChatMembers = {
  touristId: string;
  touristName: string;
  operatorProfileId: string | null;
  operatorName: string;
  guideProfileId: string | null;
};

/** Who sent a message, for the bubble label ("You" for the viewer). */
export function senderLabel(senderId: string, viewerId: string, members: ChatMembers): string {
  if (senderId === viewerId) return "You";
  if (senderId === members.touristId) return members.touristName;
  if (senderId === members.operatorProfileId) return members.operatorName;
  if (senderId === members.guideProfileId) return "Your guide";
  return "CONNECT-Daet";
}

export type ChatMessage = {
  id: string;
  sender_id: string;
  message_text: string | null;
  attachment_url: string | null;
  created_at: string;
};

/**
 * Milliseconds for a timestamp from PostgREST (ISO) or Realtime, which can
 * send Postgres text form ("2026-10-23 13:49:50.767+00").
 */
export function messageTime(value: string): number {
  const iso = value.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

/** Adds messages (from the server or Realtime) once each, oldest first. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, { ...byId.get(message.id), ...message });
  return [...byId.values()].sort((a, b) => messageTime(a.created_at) - messageTime(b.created_at) || a.id.localeCompare(b.id));
}

/** Manila day label for grouping messages ("Today", "Yesterday", or a date). */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const key = (value: Date) => new Date(value.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const day = key(new Date(messageTime(iso)));
  if (day === key(now)) return "Today";
  if (day === key(new Date(now.getTime() - 86400000))) return "Yesterday";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
