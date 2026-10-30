"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { attachmentPath, chatRpc, MESSAGE_ATTACHMENT_BUCKET, MESSAGE_COLUMNS, MESSAGE_PAGE_SIZE, parseMessageForm, type ChatMessage, type ChatTarget } from "@/lib/tours/messaging";
import { isReactionKey, type Reaction, type ReadMark } from "@/lib/tours/messenger";
import { isUuid } from "@/lib/tours/operator-access";

const SIGNED_URL_SECONDS = 60 * 60;

/** Opens (or reuses) a conversation. The RPC checks the caller may join it. */
export async function openChat(target: ChatTarget): Promise<{ conversationId?: string; error?: string }> {
  const rpc = chatRpc(target);
  if (!rpc) return { error: "This chat could not be found." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(rpc.fn as "tours_open_booking_conversation", rpc.args as { p_booking_id: string });
  if (error || typeof data !== "string") {
    console.error("Open conversation error:", error);
    return { error: userFacingDbError(error, "The chat could not be opened. Please try again.") };
  }
  return { conversationId: data };
}

export type SendMessageResult = { message?: ChatMessage; attachmentUrl?: string | null; error?: string };

export async function sendMessage(formData: FormData): Promise<SendMessageResult> {
  const conversationId = formData.get("conversationId");
  if (typeof conversationId !== "string" || !isUuid(conversationId)) return { error: "Conversation not found." };
  const parsed = parseMessageForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  let path: string | null = null;
  if (parsed.data.file && parsed.data.extension) {
    path = attachmentPath(conversationId, parsed.data.extension);
    // Storage RLS only lets conversation members write into this folder.
    const { error: uploadError } = await supabase.storage
      .from(MESSAGE_ATTACHMENT_BUCKET)
      .upload(path, parsed.data.file, { contentType: parsed.data.file.type, upsert: false });
    if (uploadError) {
      console.error("Message attachment upload error:", uploadError);
      return { error: "The photo could not be uploaded. Please try again." };
    }
  }

  const replyValue = formData.get("replyToId");
  const replyToId = typeof replyValue === "string" && isUuid(replyValue) ? replyValue : null;
  const { data, error } = await supabase
    .from("tours_messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, message_text: parsed.data.text, attachment_url: path, reply_to_id: replyToId })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) {
    console.error("Send message error:", error);
    return { error: userFacingDbError(error, "The message could not be sent. Please try again.") };
  }

  revalidatePath("/tours/messages");
  const attachmentUrl = path ? (await signAttachments([path]))[path] ?? null : null;
  return { message: data as ChatMessage, attachmentUrl };
}

/** Marks the chat read, and the bell's message notifications for it, so both counts agree. */
export async function markConversationRead(conversationId: string): Promise<void> {
  if (!isUuid(conversationId)) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_mark_conversation_read", { p_conversation_id: conversationId });
  if (error) console.error("Mark read error:", error);
  const { error: notifyError } = await supabase
    .from("tours_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("type", "message")
    .eq("link", `/tours/messages/${conversationId}`)
    .is("read_at", null);
  if (notifyError) console.error("Mark message notifications read error:", notifyError);
}

/** When the other people in the chat last read it (for "Seen"). */
export async function readMarks(conversationId: string): Promise<ReadMark[]> {
  if (!isUuid(conversationId)) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("tours_conversation_read_marks", { p_conversation_id: conversationId });
  if (error) {
    console.error("Read marks error:", error);
    return [];
  }
  return (data ?? []) as ReadMark[];
}

/** Adds, changes or removes (null) the viewer's reaction to a message. RLS limits it to members. */
export async function reactToMessage(messageId: string, reaction: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!isUuid(messageId) || (reaction !== null && !isReactionKey(reaction))) return { ok: false, error: "That reaction isn't available." };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const { error } = reaction
    ? await supabase.from("tours_message_reactions").upsert({ message_id: messageId, reaction }, { onConflict: "message_id,profile_id" })
    : await supabase.from("tours_message_reactions").delete().eq("message_id", messageId).eq("profile_id", user.id);
  if (error) {
    console.error("Reaction error:", error);
    return { ok: false, error: "The reaction could not be saved." };
  }
  return { ok: true };
}

export type OlderPage = { messages: ChatMessage[]; reactions: Reaction[]; quoted: ChatMessage[]; attachmentUrls: Record<string, string>; hasMore: boolean };

/** The page of messages before the oldest one on screen. */
export async function loadOlderMessages(conversationId: string, before: string): Promise<OlderPage> {
  const empty: OlderPage = { messages: [], reactions: [], quoted: [], attachmentUrls: {}, hasMore: false };
  if (!isUuid(conversationId) || Number.isNaN(Date.parse(before))) return empty;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tours_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .lt("created_at", before)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (error) {
    console.error("Older messages error:", error);
    return empty;
  }
  const messages = ((data ?? []) as ChatMessage[]).reverse();
  const extras = await threadExtras(conversationId, messages);
  return { messages, ...extras, hasMore: messages.length === MESSAGE_PAGE_SIZE };
}

/** Reactions, quoted messages and photo links for a page of messages. */
export async function threadExtras(conversationId: string, messages: ChatMessage[]): Promise<{ reactions: Reaction[]; quoted: ChatMessage[]; attachmentUrls: Record<string, string> }> {
  if (!isUuid(conversationId) || messages.length === 0) return { reactions: [], quoted: [], attachmentUrls: {} };
  const supabase = await createSupabaseServerClient();
  const ids = messages.map((m) => m.id).filter(isUuid);
  const have = new Set(ids);
  const replyIds = [...new Set(messages.map((m) => m.reply_to_id).filter((id): id is string => Boolean(id) && isUuid(id as string) && !have.has(id as string)))];
  const [{ data: reactionRows }, { data: quotedRows }] = await Promise.all([
    supabase.from("tours_message_reactions").select("message_id, profile_id, reaction").in("message_id", ids),
    replyIds.length ? supabase.from("tours_messages").select(MESSAGE_COLUMNS).eq("conversation_id", conversationId).in("id", replyIds) : Promise.resolve({ data: [] }),
  ]);
  const quoted = (quotedRows ?? []) as ChatMessage[];
  const attachmentUrls = await signAttachments([...messages, ...quoted].map((m) => m.attachment_url).filter((p): p is string => Boolean(p)));
  return { reactions: ((reactionRows ?? []) as Reaction[]).filter((r) => isReactionKey(r.reaction)), quoted, attachmentUrls };
}

/** Short-lived links for photo attachments; storage RLS limits them to members. */
export async function signAttachments(paths: string[]): Promise<Record<string, string>> {
  const clean = [...new Set(paths.filter((path) => typeof path === "string" && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)))].slice(0, 100);
  if (clean.length === 0) return {};
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(MESSAGE_ATTACHMENT_BUCKET).createSignedUrls(clean, SIGNED_URL_SECONDS);
  if (error || !data) return {};
  const urls: Record<string, string> = {};
  for (const item of data) if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
  return urls;
}
