-- A Space connection is granted by a user with manage_integrations and remains
-- bound to that user's family. Legacy chat connections retain their exact chat.
ALTER TABLE public.intelligence_source_v2_connections
    ADD COLUMN scope_kind text NOT NULL DEFAULT 'chat'
        CHECK (scope_kind IN ('chat','space')),
    ADD COLUMN scope_family_id text REFERENCES public.families(id) ON DELETE CASCADE;

ALTER TABLE public.intelligence_source_v2_consent_codes
    ADD COLUMN scope_kind text NOT NULL DEFAULT 'chat'
        CHECK (scope_kind IN ('chat','space')),
    ADD COLUMN confirm_space_access boolean NOT NULL DEFAULT false;
ALTER TABLE public.intelligence_source_v2_consent_codes ALTER COLUMN chat_id DROP NOT NULL;
ALTER TABLE public.intelligence_source_v2_consent_codes
    ADD CONSTRAINT intelligence_source_v2_consent_scope_check CHECK (
        (scope_kind='chat' AND chat_id IS NOT NULL AND NOT confirm_space_access)
        OR (scope_kind='space' AND chat_id IS NULL AND confirm_space_access)
    );

ALTER TABLE public.intelligence_browser_authorization_sessions
    ADD COLUMN scope_kind text CHECK (scope_kind IN ('chat','space')),
    ADD COLUMN confirm_space_access boolean NOT NULL DEFAULT false;
UPDATE public.intelligence_browser_authorization_sessions SET scope_kind='chat' WHERE flow='source_v2' AND scope_kind IS NULL;
ALTER TABLE public.intelligence_browser_authorization_sessions ALTER COLUMN chat_id DROP NOT NULL;
ALTER TABLE public.intelligence_browser_authorization_sessions
    DROP CONSTRAINT intelligence_browser_authorization_sessions_check;
ALTER TABLE public.intelligence_browser_authorization_sessions
    ADD CONSTRAINT intelligence_browser_authorization_sessions_scope_check CHECK (
        (flow='oidc' AND nonce IS NOT NULL AND chat_id IS NULL AND scope_kind IS NULL AND NOT confirm_space_access)
        OR (flow='source_v2' AND nonce IS NULL AND scope_kind='chat' AND chat_id IS NOT NULL AND NOT confirm_space_access)
        OR (flow='source_v2' AND nonce IS NULL AND scope_kind='space' AND chat_id IS NULL AND confirm_space_access)
    );

ALTER TABLE public.intelligence_source_v2_backfills ALTER COLUMN chat_id DROP NOT NULL;

-- Keep the existing exact-chat ACL index as a per-connection membership index.
-- A Space connection has one credential and many rows here, one per chat the
-- initiating user can currently access in its own family.
ALTER TABLE public.intelligence_source_v2_connection_chats
    DROP CONSTRAINT intelligence_source_v2_connection_chats_pkey,
    ADD PRIMARY KEY (connection_id,chat_id);

CREATE OR REPLACE FUNCTION public.intelligence_source_v2_expand_space_scope_on_join() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.intelligence_source_v2_connection_chats(connection_id,chat_id)
    SELECT c.id,NEW.chat_id
    FROM public.intelligence_source_v2_connections c
    JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled
    JOIN public.chats ch ON ch.id=NEW.chat_id AND ch.family_id=i.family_id
    JOIN public.users u ON u.id=NEW.user_id AND u.family_id=i.family_id AND u.is_active=1
    WHERE c.scope_kind='space' AND c.scope_family_id=i.family_id
      AND c.principal_user_id=NEW.user_id AND c.enabled AND c.revoked_at IS NULL
    ON CONFLICT (connection_id,chat_id) DO NOTHING;
    RETURN NEW;
END $$;

CREATE TRIGGER intelligence_source_v2_expand_space_scope_on_join
AFTER INSERT ON public.chat_members FOR EACH ROW
EXECUTE FUNCTION public.intelligence_source_v2_expand_space_scope_on_join();

CREATE OR REPLACE FUNCTION public.intelligence_source_v2_shrink_space_scope_on_leave() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM public.intelligence_source_v2_connection_chats scope
    USING public.intelligence_source_v2_connections c
    WHERE scope.connection_id=c.id AND scope.chat_id=OLD.chat_id
      AND c.scope_kind='space' AND c.principal_user_id=OLD.user_id;
    RETURN OLD;
END $$;

CREATE TRIGGER intelligence_source_v2_shrink_space_scope_on_leave
AFTER DELETE ON public.chat_members FOR EACH ROW
EXECUTE FUNCTION public.intelligence_source_v2_shrink_space_scope_on_leave();
