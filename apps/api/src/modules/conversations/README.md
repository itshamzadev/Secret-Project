# Conversations

This phase supports direct conversations only. The deterministic `directKey`
is generated from the sorted pair of user IDs and has a unique MongoDB index,
so creating a conversation from either side returns the same record.

Participant read/delivery cursors and unread counts live on the conversation.
This avoids per-message receipt documents and allows conversation lists to
return unread state efficiently. Group conversations can be introduced later
without changing the authentication boundary.
