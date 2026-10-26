ALTER TABLE users
    ADD COLUMN profile_avatar_mode text,
    ADD COLUMN profile_avatar_symbol_id text,
    ADD COLUMN profile_avatar_color_id text;

ALTER TABLE chats
    ADD COLUMN chat_avatar_mode text,
    ADD COLUMN chat_avatar_symbol_id text,
    ADD COLUMN chat_avatar_color_id text;
