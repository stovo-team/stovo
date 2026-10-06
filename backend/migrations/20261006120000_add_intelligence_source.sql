-- Intelligence is a separate integration identity. These records are created
-- only by explicit provisioning and remain disabled until an operator enables
-- both the installation and its connection.
CREATE TABLE public.intelligence_installations (
    id text PRIMARY KEY,
    tenant_id text NOT NULL UNIQUE,
    family_id text NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.intelligence_connections (
    id text PRIMARY KEY,
    installation_id text NOT NULL REFERENCES public.intelligence_installations(id) ON DELETE CASCADE,
    principal_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    credential_hash bytea NOT NULL UNIQUE,
    enabled boolean NOT NULL DEFAULT false,
    next_sequence bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);

CREATE TABLE public.intelligence_connection_chats (
    connection_id text NOT NULL REFERENCES public.intelligence_connections(id) ON DELETE CASCADE,
    chat_id text NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    PRIMARY KEY(connection_id, chat_id)
);

CREATE TABLE public.intelligence_source_revisions (
    revision_id text PRIMARY KEY,
    connection_id text NOT NULL REFERENCES public.intelligence_connections(id) ON DELETE CASCADE,
    resource_id text NOT NULL,
    chat_id text NOT NULL,
    content text,
    ciphertext text,
    nonce text,
    key_version integer,
    encryption_protocol text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    deleted boolean NOT NULL DEFAULT false,
    observed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(connection_id, resource_id, revision_id)
);

CREATE INDEX intelligence_source_revisions_resource
    ON public.intelligence_source_revisions(connection_id, resource_id, observed_at DESC);

CREATE TABLE public.intelligence_source_events (
    event_id text PRIMARY KEY,
    connection_id text NOT NULL REFERENCES public.intelligence_connections(id) ON DELETE CASCADE,
    sequence bigint NOT NULL,
    resource_id text NOT NULL,
    revision_id text NOT NULL,
    chat_id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('create','update','delete','acl_change','move','restore')),
    tombstone boolean NOT NULL DEFAULT false,
    observed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(connection_id, sequence),
    FOREIGN KEY(connection_id, resource_id, revision_id)
        REFERENCES public.intelligence_source_revisions(connection_id, resource_id, revision_id)
);

CREATE INDEX intelligence_source_events_replay
    ON public.intelligence_source_events(connection_id, sequence);

CREATE TABLE public.intelligence_source_audit (
    id text PRIMARY KEY,
    installation_id text,
    connection_id text,
    route text NOT NULL,
    result text NOT NULL,
    request_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.intelligence_source_revision_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'intelligence source revisions are immutable';
END $$;
CREATE TRIGGER intelligence_source_revision_no_update
    BEFORE UPDATE OR DELETE ON public.intelligence_source_revisions
    FOR EACH ROW EXECUTE FUNCTION public.intelligence_source_revision_immutable();

CREATE OR REPLACE FUNCTION public.intelligence_source_event_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'intelligence source events are immutable';
END $$;
CREATE TRIGGER intelligence_source_event_no_update
    BEFORE UPDATE OR DELETE ON public.intelligence_source_events
    FOR EACH ROW EXECUTE FUNCTION public.intelligence_source_event_immutable();

-- Each event writer locks the connection row before allocating its sequence.
-- The lock is held to transaction end, so a later sequence cannot commit ahead
-- of an earlier one for that connection.
CREATE OR REPLACE FUNCTION public.intelligence_capture_message_source() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    old_chat text;
    new_chat text;
    resource_key text;
    sender_key text;
    message_type_key text;
    created_value text;
    source_kind text;
    was_deleted boolean;
    is_deleted boolean;
    conn record;
    rev text;
    evt text;
    seq bigint;
    text_content text;
    text_ciphertext text;
    text_nonce text;
    text_key_version integer;
    text_protocol text;
BEGIN
    IF TG_OP='DELETE' THEN
        old_chat := OLD.chat_id; new_chat := NULL;
        resource_key := OLD.id; sender_key := OLD.sender_id;
        message_type_key := OLD.type; created_value := OLD.created_at;
        text_content := OLD.content; text_ciphertext := OLD.ciphertext;
        text_nonce := OLD.nonce; text_key_version := OLD.key_version;
        text_protocol := OLD.encryption_protocol;
        source_kind := 'delete'; was_deleted := false; is_deleted := true;
    ELSE
        new_chat := NEW.chat_id;
        old_chat := CASE WHEN TG_OP='UPDATE' THEN OLD.chat_id ELSE NULL END;
        resource_key := NEW.id; sender_key := NEW.sender_id;
        message_type_key := NEW.type; created_value := NEW.created_at;
        text_content := NEW.content; text_ciphertext := NEW.ciphertext;
        text_nonce := NEW.nonce; text_key_version := NEW.key_version;
        text_protocol := NEW.encryption_protocol;
        was_deleted := TG_OP='UPDATE' AND OLD.deleted_at IS NOT NULL;
        is_deleted := NEW.deleted_at IS NOT NULL;
        IF TG_OP='INSERT' THEN source_kind := CASE WHEN is_deleted THEN 'delete' ELSE 'create' END;
        ELSIF old_chat IS DISTINCT FROM new_chat THEN source_kind := 'move';
        ELSIF was_deleted AND NOT is_deleted THEN source_kind := 'restore';
        ELSIF NOT was_deleted AND is_deleted THEN source_kind := 'delete';
        ELSE source_kind := 'update'; END IF;
    END IF;

    -- Only plaintext and Messenger's server-at-rest ciphertext are eligible.
    -- E2E data is never copied. If an indexed message changes to E2E, retain
    -- only a tombstone so consumers discard the previous plaintext revision.
    IF TG_OP='UPDATE' AND OLD.type='text' AND OLD.encryption_protocol <> 'end_to_end'
       AND (OLD.content IS NOT NULL OR (OLD.encryption_protocol='server_at_rest' AND OLD.ciphertext IS NOT NULL AND OLD.nonce IS NOT NULL))
       AND (NEW.type <> 'text' OR NEW.encryption_protocol='end_to_end'
            OR (NEW.content IS NULL AND (NEW.encryption_protocol <> 'server_at_rest' OR NEW.ciphertext IS NULL OR NEW.nonce IS NULL))) THEN
        source_kind := 'delete'; is_deleted := true;
        text_content := NULL; text_ciphertext := NULL; text_nonce := NULL; text_key_version := NULL;
    END IF;
    IF (TG_OP='DELETE' AND OLD.type <> 'text') OR (TG_OP<>'DELETE' AND NEW.type <> 'text'
        AND NOT (TG_OP='UPDATE' AND OLD.type='text' AND OLD.encryption_protocol <> 'end_to_end'
                 AND (OLD.content IS NOT NULL OR (OLD.encryption_protocol='server_at_rest' AND OLD.ciphertext IS NOT NULL AND OLD.nonce IS NOT NULL)))) THEN
        IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    IF text_protocol='end_to_end' THEN
        IF TG_OP <> 'UPDATE' OR OLD.encryption_protocol='end_to_end' THEN
            IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END IF;
        text_content := NULL; text_ciphertext := NULL; text_nonce := NULL;
        text_key_version := NULL; is_deleted := true; source_kind := 'delete';
    ELSIF text_content IS NULL AND (text_protocol <> 'server_at_rest' OR text_ciphertext IS NULL OR text_nonce IS NULL) THEN
        IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    FOR conn IN
        SELECT DISTINCT c.id, scope.chat_id AS scoped_chat FROM public.intelligence_connections c
        JOIN public.intelligence_installations i ON i.id=c.installation_id
        JOIN public.intelligence_connection_chats scope ON scope.connection_id=c.id
        JOIN public.chats scoped ON scoped.id=scope.chat_id
        WHERE i.family_id=scoped.family_id AND i.enabled AND c.enabled AND c.revoked_at IS NULL
          AND scope.chat_id IN (old_chat,new_chat)
        ORDER BY c.id, scope.chat_id
    LOOP
        rev := gen_random_uuid()::text;
        evt := gen_random_uuid()::text;
        -- Lock first, allocate second: transaction commit order is serialized.
        UPDATE public.intelligence_connections SET next_sequence=next_sequence+1
          WHERE id=conn.id RETURNING next_sequence-1 INTO seq;
        INSERT INTO public.intelligence_source_revisions
          (revision_id,connection_id,resource_id,chat_id,content,ciphertext,nonce,key_version,encryption_protocol,metadata,deleted)
        VALUES (rev,conn.id,resource_key,conn.scoped_chat,
          CASE WHEN is_deleted OR (old_chat IS NOT NULL AND conn.scoped_chat=old_chat AND old_chat IS DISTINCT FROM new_chat) THEN NULL ELSE text_content END,
          CASE WHEN is_deleted OR (old_chat IS NOT NULL AND conn.scoped_chat=old_chat AND old_chat IS DISTINCT FROM new_chat) THEN NULL ELSE text_ciphertext END,
          CASE WHEN is_deleted OR (old_chat IS NOT NULL AND conn.scoped_chat=old_chat AND old_chat IS DISTINCT FROM new_chat) THEN NULL ELSE text_nonce END,
          CASE WHEN is_deleted OR (old_chat IS NOT NULL AND conn.scoped_chat=old_chat AND old_chat IS DISTINCT FROM new_chat) THEN NULL ELSE text_key_version END,
          text_protocol,
          jsonb_build_object('sender_id',sender_key,'message_type',message_type_key,'chat_id',conn.scoped_chat,
                             'created_at',created_value),
          is_deleted OR (old_chat IS NOT NULL AND conn.scoped_chat=old_chat AND old_chat IS DISTINCT FROM new_chat));
        INSERT INTO public.intelligence_source_events
          (event_id,connection_id,sequence,resource_id,revision_id,chat_id,kind,tombstone)
        VALUES (evt,conn.id,seq,resource_key,rev,conn.scoped_chat,
          CASE WHEN old_chat IS NOT NULL AND conn.scoped_chat=old_chat AND old_chat IS DISTINCT FROM new_chat THEN 'delete' ELSE source_kind END,
          is_deleted OR (old_chat IS NOT NULL AND conn.scoped_chat=old_chat AND old_chat IS DISTINCT FROM new_chat));
    END LOOP;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE TRIGGER intelligence_message_source_capture
AFTER INSERT OR UPDATE OF content, ciphertext, nonce, key_version, encryption_protocol, chat_id, deleted_at, type OR DELETE
ON public.messages FOR EACH ROW EXECUTE FUNCTION public.intelligence_capture_message_source();

CREATE OR REPLACE FUNCTION public.intelligence_capture_membership_source() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target_chat text;
    conn record;
    rev text;
    evt text;
    seq bigint;
    event_time timestamptz := now();
BEGIN
    target_chat := CASE WHEN TG_OP='DELETE' THEN OLD.chat_id ELSE NEW.chat_id END;
    FOR conn IN
        SELECT DISTINCT c.id, scope.chat_id AS scoped_chat
        FROM public.intelligence_connections c
        JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled
        JOIN public.intelligence_connection_chats scope ON scope.connection_id=c.id
        JOIN public.chats ch ON ch.id=scope.chat_id AND ch.family_id=i.family_id
        WHERE scope.chat_id=target_chat AND c.enabled AND c.revoked_at IS NULL
        ORDER BY c.id, scope.chat_id
    LOOP
        rev := gen_random_uuid()::text;
        evt := gen_random_uuid()::text;
        UPDATE public.intelligence_connections SET next_sequence=next_sequence+1
          WHERE id=conn.id RETURNING next_sequence-1 INTO seq;
        INSERT INTO public.intelligence_source_revisions
          (revision_id,connection_id,resource_id,chat_id,content,encryption_protocol,metadata,deleted,observed_at)
        VALUES (rev,conn.id,'chat:'||target_chat,target_chat,NULL,'metadata_only',
          jsonb_build_object('chat_id',target_chat,'membership_change',TG_OP),false,event_time);
        INSERT INTO public.intelligence_source_events
          (event_id,connection_id,sequence,resource_id,revision_id,chat_id,kind,tombstone,observed_at)
        VALUES (evt,conn.id,seq,'chat:'||target_chat,rev,target_chat,'acl_change',false,event_time);
    END LOOP;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE TRIGGER intelligence_membership_source_capture
AFTER INSERT OR DELETE ON public.chat_members
FOR EACH ROW EXECUTE FUNCTION public.intelligence_capture_membership_source();

-- Per-user deletion is a visibility change, not a global resource deletion.
-- Emit a metadata-only invalidation only to the connection mapped to that user.
CREATE OR REPLACE FUNCTION public.intelligence_capture_user_message_visibility() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target_message text;
    target_user text;
    msg record;
    conn record;
    rev text;
    evt text;
    seq bigint;
BEGIN
    IF TG_OP='DELETE' THEN
        target_message := OLD.message_id; target_user := OLD.user_id;
    ELSE
        target_message := NEW.message_id; target_user := NEW.user_id;
    END IF;
    SELECT id,chat_id INTO msg FROM public.messages
      WHERE id=target_message AND type='text' AND encryption_protocol <> 'end_to_end';
    IF NOT FOUND THEN
        IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    FOR conn IN
        SELECT DISTINCT c.id, scope.chat_id
        FROM public.intelligence_connections c
        JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled
        JOIN public.intelligence_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=msg.chat_id
        JOIN public.chats ch ON ch.id=scope.chat_id AND ch.family_id=i.family_id
        WHERE c.principal_user_id=target_user AND c.enabled AND c.revoked_at IS NULL
        ORDER BY c.id, scope.chat_id
    LOOP
        rev := gen_random_uuid()::text;
        evt := gen_random_uuid()::text;
        UPDATE public.intelligence_connections SET next_sequence=next_sequence+1
          WHERE id=conn.id RETURNING next_sequence-1 INTO seq;
        INSERT INTO public.intelligence_source_revisions
          (revision_id,connection_id,resource_id,chat_id,content,encryption_protocol,metadata,deleted)
        VALUES (rev,conn.id,target_message,conn.chat_id,NULL,'metadata_only',
          jsonb_build_object('chat_id',conn.chat_id,'visibility_change',TG_OP),false);
        INSERT INTO public.intelligence_source_events
          (event_id,connection_id,sequence,resource_id,revision_id,chat_id,kind,tombstone)
        VALUES (evt,conn.id,seq,target_message,rev,conn.chat_id,'acl_change',false);
    END LOOP;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE TRIGGER intelligence_user_message_visibility_capture
AFTER INSERT OR DELETE ON public.message_user_deletions
FOR EACH ROW EXECUTE FUNCTION public.intelligence_capture_user_message_visibility();
