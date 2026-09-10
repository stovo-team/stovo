-- Message attachments uploaded before their chat was known used to retain a
-- NULL files.chat_id. Give every legacy attachment its earliest message chat
-- so Storage can display the exact source chat rather than only "All chats".
WITH first_attachment AS (
  SELECT DISTINCT ON (attachment.file_id)
    attachment.file_id,
    message.chat_id
  FROM message_attachments AS attachment
  JOIN messages AS message ON message.id = attachment.message_id
  WHERE message.deleted_at IS NULL
  ORDER BY attachment.file_id, message.created_at ASC, message.id ASC
)
UPDATE files AS file
SET
  chat_id = first_attachment.chat_id,
  access_scope = CASE WHEN file.access_scope = 'family' THEN 'chat' ELSE file.access_scope END
FROM first_attachment
WHERE file.id = first_attachment.file_id
  AND file.chat_id IS NULL;
