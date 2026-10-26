-- Keep existing conversations and membership while retiring the special type.
UPDATE chats SET type = 'group' WHERE type = 'family';
