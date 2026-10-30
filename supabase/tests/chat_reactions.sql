-- Messenger suite: reactions, replies, Seen, private channels and saved AI chats.
-- One DO block that ALWAYS rolls back (it ends by raising the report), so it is
-- safe on a live project. Paste into the Supabase SQL editor and read
-- "REPORT pass=N fail=M [failures]". Needs two conversations that each have a
-- message, and a tourist who is not in the first one.

DO $suite$
DECLARE
  pass int := 0;
  fails text := '';
  ok boolean;
  n int;
  v_conv uuid;
  v_msg uuid;
  v_member uuid;
  v_outsider uuid;
  v_other_msg uuid;
BEGIN
  SELECT m.conversation_id, m.id INTO v_conv, v_msg FROM tours_messages m ORDER BY m.created_at DESC LIMIT 1;
  SELECT c.tourist_id INTO v_member FROM tours_conversations c WHERE c.id = v_conv;
  IF v_member IS NULL THEN SELECT m.sender_id INTO v_member FROM tours_messages m WHERE m.conversation_id = v_conv LIMIT 1; END IF;
  SELECT p.id INTO v_outsider FROM profiles p WHERE p.role = 'tourist' AND p.id <> v_member
    AND NOT EXISTS (SELECT 1 FROM tours_conversations c WHERE c.id = v_conv AND c.tourist_id = p.id) LIMIT 1;
  SELECT m.id INTO v_other_msg FROM tours_messages m WHERE m.conversation_id <> v_conv LIMIT 1;
  IF v_conv IS NULL OR v_member IS NULL OR v_outsider IS NULL THEN
    RAISE EXCEPTION 'REPORT setup incomplete: conversation=% member=% outsider=%', v_conv, v_member, v_outsider;
  END IF;

  -- As a member of the chat.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  -- 1. A member reacts; the chat is filled in from the message.
  INSERT INTO tours_message_reactions (message_id, reaction) VALUES (v_msg, 'love');
  SELECT count(*) INTO n FROM tours_message_reactions WHERE message_id = v_msg AND profile_id = v_member AND conversation_id = v_conv;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'member could not react; '; END IF;
  -- 2. One reaction per person: changing it updates the same row.
  INSERT INTO tours_message_reactions (message_id, reaction) VALUES (v_msg, 'haha')
    ON CONFLICT (message_id, profile_id) DO UPDATE SET reaction = EXCLUDED.reaction;
  SELECT count(*) INTO n FROM tours_message_reactions WHERE message_id = v_msg AND profile_id = v_member AND reaction = 'haha';
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'reaction not replaced; '; END IF;
  -- 3. Only the fixed set.
  ok := true;
  BEGIN INSERT INTO tours_message_reactions (message_id, reaction) VALUES (v_msg, 'angry') ON CONFLICT (message_id, profile_id) DO UPDATE SET reaction = EXCLUDED.reaction; ok := false; EXCEPTION WHEN check_violation THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'unknown reaction accepted; '; END IF;
  -- 4. A reply must quote a message in the same chat.
  IF v_other_msg IS NOT NULL THEN
    ok := true;
    BEGIN INSERT INTO tours_messages (conversation_id, message_text, reply_to_id) VALUES (v_conv, 'Suite reply', v_other_msg); ok := false; EXCEPTION WHEN check_violation THEN NULL; END;
    IF ok THEN pass := pass + 1; ELSE fails := fails || 'cross-chat reply accepted; '; END IF;
  END IF;
  -- 5. Members may use the chat's private channel; a malformed topic is refused.
  IF tours_realtime_conversation_allowed('conversation:' || v_conv) AND NOT tours_realtime_conversation_allowed('conversation:not-a-uuid') THEN pass := pass + 1;
  ELSE fails := fails || 'member channel check wrong; '; END IF;
  -- 6. Saved AI chats belong to their owner.
  INSERT INTO tours_ai_messages (role, content) VALUES ('user', 'Suite: where to eat?');
  SELECT count(*) INTO n FROM tours_ai_messages WHERE content = 'Suite: where to eat?' AND profile_id = v_member;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'AI chat not saved for owner; '; END IF;
  RESET ROLE;

  -- As someone outside the chat.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  -- 7. Outsiders can't see or add reactions.
  SELECT count(*) INTO n FROM tours_message_reactions WHERE message_id = v_msg;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'outsider saw reactions; '; END IF;
  ok := true;
  BEGIN INSERT INTO tours_message_reactions (message_id, reaction) VALUES (v_msg, 'like'); ok := false; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'outsider reacted; '; END IF;
  -- 8. Outsiders get no read marks and no channel.
  SELECT count(*) INTO n FROM tours_conversation_read_marks(v_conv);
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'outsider saw read marks; '; END IF;
  IF NOT tours_realtime_conversation_allowed('conversation:' || v_conv) THEN pass := pass + 1; ELSE fails := fails || 'outsider allowed on channel; '; END IF;
  -- 9. Nobody else reads your AI chat.
  SELECT count(*) INTO n FROM tours_ai_messages WHERE content = 'Suite: where to eat?';
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'outsider read an AI chat; '; END IF;
  RESET ROLE;

  -- 10. Visitors can't call the read-marks function at all.
  ok := true;
  SET LOCAL ROLE anon;
  BEGIN PERFORM tours_conversation_read_marks(v_conv); ok := false; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon called read marks; '; END IF;

  RAISE EXCEPTION 'REPORT pass=% fail=% [%]', pass, (length(fails) - length(replace(fails, ';', ''))), fails;
END
$suite$;
