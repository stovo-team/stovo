-- MCP connectors are scoped to chats through mcp_connector_chats. Their
-- technical sender identities must not be represented as chat members.
DELETE FROM public.chat_members AS member
USING public.users AS actor
WHERE member.user_id = actor.id
  AND actor.role = 'connector';
