"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { attachmentPath, MESSAGE_ATTACHMENT_BUCKET, parseMessageForm, type ChatMessage } from "@/lib/tours/messaging";
import { isUuid } from "@/lib/tours/operator-access";

const SIGNED_URL_SECONDS = 60 * 60;

/** Opens (or reuses) the booking's conversation. Only the booking's tourist, operator and guide can. */
export async function openBookingChat(bookingId: string): Promise<{ conversationId?: string; error?: string }> {
  if (!isUuid(bookingId)) return { error: "Booking not found." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("tours_open_booking_conversation", { p_booking_id: bookingId });
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

  const { data, error } = await supabase
    .from("tours_messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, message_text: parsed.data.text, attachment_url: path })
    .select("id, sender_id, message_text, attachment_url, created_at")
    .single();
  if (error || !data) {
    console.error("Send message error:", error);
    return { error: userFacingDbError(error, "The message could not be sent. Please try again.") };
  }

  revalidatePath("/tours/messages");
  const attachmentUrl = path ? (await signAttachments([path]))[path] ?? null : null;
  return { message: data as ChatMessage, attachmentUrl };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  if (!isUuid(conversationId)) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_mark_conversation_read", { p_conversation_id: conversationId });
  if (error) console.error("Mark read error:", error);
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
