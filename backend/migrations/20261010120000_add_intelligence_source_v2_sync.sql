-- V2 source content, metadata and replay state are isolated from the legacy
-- intelligence_source_* tables and their response/event contracts.
CREATE TABLE public.intelligence_source_v2_revisions (
    revision_id text PRIMARY KEY,
    connection_id text NOT NULL REFERENCES public.intelligence_source_v2_connections(id) ON DELETE CASCADE,
    resource_id text NOT NULL,
    chat_id text NOT NULL,
    encryption_protocol text NOT NULL CHECK (encryption_protocol IN ('legacy_plaintext','server_at_rest','metadata_only')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    deleted boolean NOT NULL DEFAULT false,
    observed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (connection_id, resource_id, revision_id),
    UNIQUE (connection_id, revision_id)
);

CREATE INDEX intelligence_source_v2_revisions_resource
    ON public.intelligence_source_v2_revisions(connection_id, resource_id, observed_at DESC);

CREATE TABLE public.intelligence_source_v2_revision_payloads (
    connection_id text NOT NULL,
    revision_id text NOT NULL,
    content text,
    ciphertext text,
    nonce text,
    key_version integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (connection_id, revision_id),
    FOREIGN KEY (connection_id, revision_id)
        REFERENCES public.intelligence_source_v2_revisions(connection_id, revision_id) ON DELETE RESTRICT,
    CHECK (
        (content IS NOT NULL AND ciphertext IS NULL AND nonce IS NULL AND key_version IS NULL)
        OR (content IS NULL AND ciphertext IS NOT NULL AND nonce IS NOT NULL)
    )
);

CREATE TABLE public.intelligence_source_v2_events (
    event_id text PRIMARY KEY,
    connection_id text NOT NULL REFERENCES public.intelligence_source_v2_connections(id) ON DELETE CASCADE,
    sequence bigint NOT NULL CHECK (sequence > 0),
    resource_id text NOT NULL,
    revision_id text NOT NULL,
    chat_id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('create','update','delete','acl_change','move','restore')),
    tombstone boolean NOT NULL DEFAULT false,
    observed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (connection_id, sequence),
    FOREIGN KEY (connection_id, resource_id, revision_id)
        REFERENCES public.intelligence_source_v2_revisions(connection_id, resource_id, revision_id) ON DELETE RESTRICT
);

CREATE INDEX intelligence_source_v2_events_replay
    ON public.intelligence_source_v2_events(connection_id, sequence);

CREATE TABLE public.intelligence_source_v2_backfills (
    id text PRIMARY KEY,
    connection_id text NOT NULL REFERENCES public.intelligence_source_v2_connections(id) ON DELETE CASCADE,
    chat_id text NOT NULL,
    fence_sequence bigint NOT NULL CHECK (fence_sequence >= 0),
    next_page integer NOT NULL DEFAULT 0 CHECK (next_page >= 0),
    last_created_at text,
    last_resource_id text,
    completed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_source_v2_backfills_connection
    ON public.intelligence_source_v2_backfills(connection_id, created_at DESC);

CREATE TABLE public.intelligence_source_v2_backfill_pages (
    backfill_id text NOT NULL REFERENCES public.intelligence_source_v2_backfills(id) ON DELETE CASCADE,
    page_number integer NOT NULL CHECK (page_number >= 0),
    has_more boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (backfill_id, page_number)
);

CREATE TABLE public.intelligence_source_v2_backfill_items (
    backfill_id text NOT NULL,
    page_number integer NOT NULL,
    item_number integer NOT NULL CHECK (item_number >= 0),
    connection_id text NOT NULL,
    resource_id text NOT NULL,
    revision_id text NOT NULL,
    source_created_at text NOT NULL,
    PRIMARY KEY (backfill_id, page_number, item_number),
    FOREIGN KEY (backfill_id, page_number)
        REFERENCES public.intelligence_source_v2_backfill_pages(backfill_id, page_number) ON DELETE CASCADE,
    FOREIGN KEY (connection_id, resource_id, revision_id)
        REFERENCES public.intelligence_source_v2_revisions(connection_id, resource_id, revision_id) ON DELETE RESTRICT
);

CREATE INDEX intelligence_source_v2_backfill_items_revision
    ON public.intelligence_source_v2_backfill_items(connection_id, revision_id);

CREATE OR REPLACE FUNCTION public.intelligence_source_v2_revision_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'intelligence source v2 revisions are immutable';
END $$;

CREATE TRIGGER intelligence_source_v2_revision_no_update
    BEFORE UPDATE OR DELETE ON public.intelligence_source_v2_revisions
    FOR EACH ROW EXECUTE FUNCTION public.intelligence_source_v2_revision_immutable();

CREATE OR REPLACE FUNCTION public.intelligence_source_v2_event_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'intelligence source v2 events are immutable';
END $$;

CREATE TRIGGER intelligence_source_v2_event_no_update
    BEFORE UPDATE OR DELETE ON public.intelligence_source_v2_events
    FOR EACH ROW EXECUTE FUNCTION public.intelligence_source_v2_event_immutable();

-- Sequence allocation updates the connection row in the source-message
-- transaction. Its row lock lasts until commit, so sequence order is commit
-- order for each connection and backfill fences cannot pass an uncommitted
-- event. Event rows contain identifiers only, never message text/ciphertext.
CREATE OR REPLACE FUNCTION public.intelligence_source_v2_capture_message() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    old_chat text;
    new_chat text;
    resource_key text;
    old_sender text;
    new_sender text;
    old_type text;
    new_type text;
    old_created text;
    new_created text;
    new_updated text;
    old_protocol text;
    new_protocol text;
    new_content text;
    new_ciphertext text;
    new_nonce text;
    new_key_version integer;
    old_deleted boolean := false;
    new_deleted boolean := false;
    old_eligible boolean := false;
    new_eligible boolean := false;
    conn record;
    revision_key text;
    event_key text;
    event_sequence bigint;
    event_kind text;
    event_tombstone boolean;
    revision_protocol text;
    revision_metadata jsonb;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        old_chat := OLD.chat_id;
        old_sender := OLD.sender_id;
        old_type := OLD.type;
        old_created := OLD.created_at;
        old_protocol := OLD.encryption_protocol;
        old_deleted := OLD.deleted_at IS NOT NULL;
        old_eligible := OLD.type='text' AND OLD.deleted_at IS NULL
            AND ((OLD.encryption_protocol='legacy_plaintext' AND OLD.content IS NOT NULL)
                 OR (OLD.encryption_protocol='server_at_rest' AND OLD.ciphertext IS NOT NULL AND OLD.nonce IS NOT NULL));
    END IF;
    IF TG_OP <> 'DELETE' THEN
        new_chat := NEW.chat_id;
        resource_key := NEW.id;
        new_sender := NEW.sender_id;
        new_type := NEW.type;
        new_created := NEW.created_at;
        new_updated := NEW.updated_at;
        new_protocol := NEW.encryption_protocol;
        new_content := NEW.content;
        new_ciphertext := NEW.ciphertext;
        new_nonce := NEW.nonce;
        new_key_version := NEW.key_version;
        new_deleted := NEW.deleted_at IS NOT NULL;
        new_eligible := NEW.type='text' AND NEW.deleted_at IS NULL
            AND ((NEW.encryption_protocol='legacy_plaintext' AND NEW.content IS NOT NULL)
                 OR (NEW.encryption_protocol='server_at_rest' AND NEW.ciphertext IS NOT NULL AND NEW.nonce IS NOT NULL));
    ELSE
        resource_key := OLD.id;
    END IF;
    IF TG_OP='DELETE' THEN
        new_chat := NULL;
        new_protocol := old_protocol;
    END IF;
    IF NOT old_eligible AND NOT new_eligible THEN
        IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    FOR conn IN
        SELECT c.id, scope.chat_id
        FROM public.intelligence_source_v2_connections c
        JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled
        JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id
        JOIN public.intelligence_source_v2_connection_grants read_grant ON read_grant.connection_id=c.id AND read_grant.grant_type='read' AND read_grant.granted
        JOIN public.chats scoped_chat ON scoped_chat.id=scope.chat_id AND scoped_chat.family_id=i.family_id
        WHERE c.enabled AND c.revoked_at IS NULL AND scope.chat_id IN (old_chat,new_chat)
        ORDER BY c.id,scope.chat_id
    LOOP
        IF conn.chat_id=old_chat AND old_eligible AND (TG_OP='DELETE' OR new_chat IS DISTINCT FROM old_chat OR NOT new_eligible) THEN
            event_kind := CASE WHEN new_chat IS DISTINCT FROM old_chat AND new_chat IS NOT NULL THEN 'move' ELSE 'delete' END;
            event_tombstone := true;
            revision_protocol := 'metadata_only';
            revision_metadata := jsonb_build_object('chat_id',conn.chat_id,'sender_id',old_sender,'message_type',old_type,'created_at',old_created,'deleted',true);
        ELSIF conn.chat_id=new_chat AND new_eligible THEN
            IF TG_OP='INSERT' OR NOT old_eligible THEN
                event_kind := CASE WHEN old_deleted THEN 'restore' ELSE 'create' END;
            ELSIF old_chat IS DISTINCT FROM new_chat THEN
                event_kind := 'move';
            ELSE
                event_kind := 'update';
            END IF;
            event_tombstone := false;
            revision_protocol := new_protocol;
            revision_metadata := jsonb_build_object('chat_id',conn.chat_id,'sender_id',new_sender,'message_type',new_type,'created_at',new_created,'updated_at',new_updated,'edited',event_kind='update');
        ELSE
            CONTINUE;
        END IF;

        revision_key := gen_random_uuid()::text;
        event_key := gen_random_uuid()::text;
        UPDATE public.intelligence_source_v2_connections
           SET next_sequence=next_sequence+1
         WHERE id=conn.id
         RETURNING next_sequence-1 INTO event_sequence;
        INSERT INTO public.intelligence_source_v2_revisions
            (revision_id,connection_id,resource_id,chat_id,encryption_protocol,metadata,deleted,observed_at)
        VALUES (revision_key,conn.id,resource_key,conn.chat_id,revision_protocol,revision_metadata,event_tombstone,now());
        IF NOT event_tombstone THEN
            IF revision_protocol='legacy_plaintext' THEN
                INSERT INTO public.intelligence_source_v2_revision_payloads(connection_id,revision_id,content)
                VALUES(conn.id,revision_key,new_content);
            ELSIF revision_protocol='server_at_rest' THEN
                INSERT INTO public.intelligence_source_v2_revision_payloads(connection_id,revision_id,ciphertext,nonce,key_version)
                VALUES(conn.id,revision_key,new_ciphertext,new_nonce,new_key_version);
            END IF;
        END IF;
        INSERT INTO public.intelligence_source_v2_events
            (event_id,connection_id,sequence,resource_id,revision_id,chat_id,kind,tombstone,observed_at)
        VALUES(event_key,conn.id,event_sequence,resource_key,revision_key,conn.chat_id,event_kind,event_tombstone,now());
    END LOOP;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE TRIGGER intelligence_source_v2_message_capture
AFTER INSERT OR UPDATE OF content, ciphertext, nonce, key_version, encryption_protocol, chat_id, deleted_at, type, sender_id, created_at, updated_at, is_edited OR DELETE
ON public.messages FOR EACH ROW EXECUTE FUNCTION public.intelligence_source_v2_capture_message();
