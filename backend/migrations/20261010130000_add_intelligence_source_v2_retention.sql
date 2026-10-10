-- V2 source payloads expire within thirty days. Immutable revision and event
-- identities remain available after payload removal.
ALTER TABLE public.intelligence_source_v2_revision_payloads
    ADD COLUMN retention_expires_at timestamptz;

UPDATE public.intelligence_source_v2_revision_payloads
SET retention_expires_at=created_at+interval '30 days';

ALTER TABLE public.intelligence_source_v2_revision_payloads
    ALTER COLUMN retention_expires_at SET NOT NULL,
    ALTER COLUMN retention_expires_at SET DEFAULT (now()+interval '30 days'),
    ADD CONSTRAINT intelligence_source_v2_payload_retention_bound
        CHECK (retention_expires_at <= created_at+interval '30 days');

CREATE INDEX intelligence_source_v2_payload_retention
    ON public.intelligence_source_v2_revision_payloads(retention_expires_at);

-- The operator registers each content backup's actual restore horizon. The
-- database rejects horizons beyond the v2 thirty-day content-backup contract.
CREATE TABLE public.intelligence_source_v2_backup_horizons (
    backup_id text PRIMARY KEY,
    backup_created_at timestamptz NOT NULL,
    restorable_until timestamptz NOT NULL,
    registered_at timestamptz NOT NULL DEFAULT now(),
    CHECK (restorable_until >= backup_created_at),
    CHECK (restorable_until <= backup_created_at+interval '30 days')
);

CREATE INDEX intelligence_source_v2_backup_horizons_expiry
    ON public.intelligence_source_v2_backup_horizons(restorable_until);

-- Tombstones may be pruned only while a trusted backup inventory is known to
-- be complete and current. Without a backup-controller integration the row
-- remains unverified, which retains metadata rather than risking stale restore.
CREATE TABLE public.intelligence_source_v2_backup_inventory_state (
    inventory_id text PRIMARY KEY CHECK (inventory_id='global'),
    verified_at timestamptz,
    complete boolean NOT NULL DEFAULT false,
    CHECK (complete OR verified_at IS NULL)
);

INSERT INTO public.intelligence_source_v2_backup_inventory_state(inventory_id)
VALUES('global');

-- Ledger rows contain only identifiers/reason codes. Events and revision
-- metadata are immutable; this compact ledger can be pruned only after the
-- 30-day backup horizon and seven-day safety margin have both elapsed.
CREATE TABLE public.intelligence_source_v2_tombstone_ledger (
    event_id text PRIMARY KEY REFERENCES public.intelligence_source_v2_events(event_id) ON DELETE RESTRICT,
    connection_id text NOT NULL,
    resource_id text NOT NULL,
    revision_id text NOT NULL,
    sequence bigint NOT NULL CHECK (sequence > 0),
    chat_id text NOT NULL,
    reason text NOT NULL,
    created_at timestamptz NOT NULL,
    retain_until timestamptz NOT NULL,
    FOREIGN KEY (connection_id,resource_id,revision_id)
        REFERENCES public.intelligence_source_v2_revisions(connection_id,resource_id,revision_id) ON DELETE RESTRICT,
    UNIQUE (connection_id,sequence),
    CHECK (retain_until >= created_at+interval '37 days')
);

CREATE INDEX intelligence_source_v2_tombstone_ledger_restore
    ON public.intelligence_source_v2_tombstone_ledger(connection_id,created_at,sequence);

CREATE TABLE public.intelligence_source_v2_restore_gate (
    gate_id text PRIMARY KEY CHECK (gate_id='global'),
    blocked boolean NOT NULL DEFAULT false,
    restore_epoch text NOT NULL DEFAULT 'uninitialized',
    active_restore_id text,
    backup_created_at timestamptz,
    ledger_started_at timestamptz NOT NULL DEFAULT now(),
    ledger_verified_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.intelligence_source_v2_restore_gate(gate_id,blocked)
VALUES('global',false);

CREATE TABLE public.intelligence_source_v2_restore_requirements (
    restore_id text NOT NULL,
    connection_id text NOT NULL,
    required_sequence bigint NOT NULL CHECK (required_sequence > 0),
    PRIMARY KEY (restore_id,connection_id)
);

CREATE OR REPLACE FUNCTION public.intelligence_source_v2_record_tombstone_and_purge() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    revision_metadata jsonb;
    should_purge boolean;
BEGIN
    SELECT metadata INTO revision_metadata
    FROM public.intelligence_source_v2_revisions
    WHERE connection_id=NEW.connection_id AND revision_id=NEW.revision_id;

    INSERT INTO public.intelligence_source_v2_tombstone_ledger
        (event_id,connection_id,resource_id,revision_id,sequence,chat_id,reason,created_at,retain_until)
    VALUES (NEW.event_id,NEW.connection_id,NEW.resource_id,NEW.revision_id,NEW.sequence,NEW.chat_id,
            COALESCE(revision_metadata->>'invalidation_reason',NEW.kind),NEW.observed_at,
            NEW.observed_at+interval '37 days');

    should_purge := COALESCE((revision_metadata->>'purge_payloads')::boolean,true);
    IF should_purge THEN
        IF NEW.resource_id LIKE 'chat:%' THEN
            DELETE FROM public.intelligence_source_v2_revision_payloads
            WHERE connection_id=NEW.connection_id;
        ELSE
            DELETE FROM public.intelligence_source_v2_revision_payloads payload
            USING public.intelligence_source_v2_revisions revision
            WHERE payload.connection_id=NEW.connection_id
              AND revision.connection_id=payload.connection_id
              AND revision.revision_id=payload.revision_id
              AND revision.resource_id=NEW.resource_id;
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER intelligence_source_v2_tombstone_retention_capture
AFTER INSERT ON public.intelligence_source_v2_events
FOR EACH ROW WHEN (NEW.tombstone)
EXECUTE FUNCTION public.intelligence_source_v2_record_tombstone_and_purge();

CREATE OR REPLACE FUNCTION public.intelligence_source_v2_emit_acl_tombstone(
    p_connection_id text,
    p_chat_id text,
    p_resource_id text,
    p_reason text,
    p_purge_payloads boolean
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    revision_key text := gen_random_uuid()::text;
    event_key text := gen_random_uuid()::text;
    event_sequence bigint;
    event_time timestamptz := now();
BEGIN
    UPDATE public.intelligence_source_v2_connections connection
       SET next_sequence=connection.next_sequence+1
     WHERE connection.id=p_connection_id AND connection.enabled AND connection.revoked_at IS NULL
       AND EXISTS (
           SELECT 1 FROM public.intelligence_installations installation
           JOIN public.intelligence_source_v2_connection_chats scope
             ON scope.connection_id=p_connection_id AND scope.chat_id=p_chat_id
           JOIN public.chats chat ON chat.id=scope.chat_id AND chat.family_id=installation.family_id
           WHERE installation.id=connection.installation_id
       )
     RETURNING connection.next_sequence-1 INTO event_sequence;
    IF event_sequence IS NULL THEN
        RAISE EXCEPTION 'intelligence source v2 tombstone scope unavailable';
    END IF;

    INSERT INTO public.intelligence_source_v2_revisions
        (revision_id,connection_id,resource_id,chat_id,encryption_protocol,metadata,deleted,observed_at)
    VALUES (revision_key,p_connection_id,p_resource_id,p_chat_id,'metadata_only',
            jsonb_build_object('chat_id',p_chat_id,'invalidation_reason',p_reason,
                               'purge_payloads',p_purge_payloads),true,event_time);
    INSERT INTO public.intelligence_source_v2_events
        (event_id,connection_id,sequence,resource_id,revision_id,chat_id,kind,tombstone,observed_at)
    VALUES (event_key,p_connection_id,event_sequence,p_resource_id,revision_key,p_chat_id,
            'acl_change',true,event_time);
    RETURN event_key;
END $$;

-- Preserve immutable event/revision identities when a parent account or
-- installation is deleted. Retire access and purge content first; parent FKs
-- below detach the archived connection instead of cascading into its history.
CREATE OR REPLACE FUNCTION public.intelligence_source_v2_retire_connection(
    p_connection_id text,
    p_reason text
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    connection_enabled boolean;
    connection_revoked_at timestamptz;
    scoped_chat record;
BEGIN
    SELECT enabled,revoked_at INTO connection_enabled,connection_revoked_at
    FROM public.intelligence_source_v2_connections
    WHERE id=p_connection_id
    FOR UPDATE;
    IF NOT FOUND OR NOT connection_enabled OR connection_revoked_at IS NOT NULL THEN
        RETURN;
    END IF;

    FOR scoped_chat IN
        SELECT chat_id FROM public.intelligence_source_v2_connection_chats
        WHERE connection_id=p_connection_id ORDER BY chat_id
    LOOP
        PERFORM public.intelligence_source_v2_emit_acl_tombstone(
            p_connection_id,scoped_chat.chat_id,'chat:'||scoped_chat.chat_id,p_reason,true);
    END LOOP;

    UPDATE public.intelligence_source_v2_connections
       SET enabled=false,revoked_at=COALESCE(revoked_at,now())
     WHERE id=p_connection_id;
    UPDATE public.intelligence_source_v2_connection_grants
       SET granted=false,revoked_at=COALESCE(revoked_at,now()),updated_at=now()
     WHERE connection_id=p_connection_id;
END $$;

CREATE OR REPLACE FUNCTION public.intelligence_source_v2_retire_user_connections() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    connection_row record;
BEGIN
    IF TG_OP='UPDATE' AND (OLD.is_active<>1 OR NEW.is_active=1) THEN
        RETURN NEW;
    END IF;
    FOR connection_row IN
        SELECT id FROM public.intelligence_source_v2_connections
        WHERE principal_user_id=OLD.id AND enabled AND revoked_at IS NULL ORDER BY id
    LOOP
        PERFORM public.intelligence_source_v2_retire_connection(connection_row.id,'principal_inactive');
    END LOOP;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE TRIGGER intelligence_source_v2_principal_deactivation_retire
BEFORE UPDATE OF is_active ON public.users
FOR EACH ROW EXECUTE FUNCTION public.intelligence_source_v2_retire_user_connections();

CREATE TRIGGER intelligence_source_v2_principal_delete_retire
BEFORE DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.intelligence_source_v2_retire_user_connections();

CREATE OR REPLACE FUNCTION public.intelligence_source_v2_retire_installation_connections() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    connection_row record;
BEGIN
    FOR connection_row IN
        SELECT id FROM public.intelligence_source_v2_connections
        WHERE installation_id=OLD.id AND enabled AND revoked_at IS NULL ORDER BY id
    LOOP
        PERFORM public.intelligence_source_v2_retire_connection(connection_row.id,'installation_deleted');
    END LOOP;
    RETURN OLD;
END $$;

CREATE TRIGGER intelligence_source_v2_installation_delete_retire
BEFORE DELETE ON public.intelligence_installations
FOR EACH ROW EXECUTE FUNCTION public.intelligence_source_v2_retire_installation_connections();

ALTER TABLE public.intelligence_source_v2_connections
    ALTER COLUMN installation_id DROP NOT NULL,
    ALTER COLUMN principal_user_id DROP NOT NULL,
    DROP CONSTRAINT intelligence_source_v2_connections_installation_id_fkey,
    DROP CONSTRAINT intelligence_source_v2_connections_principal_user_id_fkey,
    ADD CONSTRAINT intelligence_source_v2_connections_installation_id_fkey
        FOREIGN KEY (installation_id) REFERENCES public.intelligence_installations(id) ON DELETE SET NULL,
    ADD CONSTRAINT intelligence_source_v2_connections_principal_user_id_fkey
        FOREIGN KEY (principal_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Replace the Task 6 capture body to enforce current visibility at write time.
-- If an already-consented connection loses current read access, only a
-- metadata-only tombstone is recorded; subsequent edits cannot repopulate its
-- source payloads while access remains revoked.
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
    candidate record;
    conn record;
    revision_key text;
    event_key text;
    event_sequence bigint;
    event_kind text;
    event_tombstone boolean;
    revision_protocol text;
    revision_metadata jsonb;
    currently_allowed boolean;
    invalidation_reason text;
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

    -- Lock each source connection before reading any authorization state. A
    -- grant or membership invalidation takes the same connection lock before
    -- writing its tombstone. The fresh SELECT inside this loop must run after
    -- that invalidation commits, so a waiting message writer cannot use a
    -- stale grant/member snapshot to repopulate content.
    FOR candidate IN
        SELECT c.id,scope.chat_id
        FROM public.intelligence_source_v2_connections c
        JOIN public.intelligence_installations installation ON installation.id=c.installation_id AND installation.enabled
        JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id
        JOIN public.chats chat ON chat.id=scope.chat_id AND chat.family_id=installation.family_id
        LEFT JOIN public.intelligence_source_v2_connection_grants read_grant
          ON read_grant.connection_id=c.id AND read_grant.grant_type='read'
        WHERE c.enabled AND c.revoked_at IS NULL AND scope.chat_id IN (old_chat,new_chat)
          AND (COALESCE(read_grant.granted,false) OR read_grant.revoked_at IS NOT NULL)
        ORDER BY c.id,scope.chat_id
        FOR UPDATE OF c
    LOOP
        SELECT c.id,scope.chat_id,c.principal_user_id,
               COALESCE(read_grant.granted,false) AS read_granted,
               (read_grant.revoked_at IS NOT NULL) AS read_was_revoked,
               COALESCE(principal.is_active=1,false) AS principal_active,
               (member.user_id IS NOT NULL) AS current_member,
               chat.encryption_protocol AS chat_protocol
          INTO conn
        FROM public.intelligence_source_v2_connections c
        JOIN public.intelligence_installations installation ON installation.id=c.installation_id AND installation.enabled
        JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=candidate.chat_id
        JOIN public.chats chat ON chat.id=scope.chat_id AND chat.family_id=installation.family_id
        LEFT JOIN public.users principal ON principal.id=c.principal_user_id AND principal.family_id=installation.family_id
        LEFT JOIN public.chat_members member ON member.chat_id=scope.chat_id AND member.user_id=c.principal_user_id
        LEFT JOIN public.intelligence_source_v2_connection_grants read_grant
          ON read_grant.connection_id=c.id AND read_grant.grant_type='read'
        WHERE c.id=candidate.id AND c.enabled AND c.revoked_at IS NULL
          AND (COALESCE(read_grant.granted,false) OR read_grant.revoked_at IS NOT NULL)
        ORDER BY c.id,scope.chat_id;
        IF NOT FOUND THEN
            CONTINUE;
        END IF;
        currently_allowed := conn.read_granted AND conn.principal_active AND conn.current_member
            AND conn.chat_protocol IN ('legacy_plaintext','server_at_rest')
            AND NOT EXISTS (
                SELECT 1 FROM public.message_user_deletions hidden
                WHERE hidden.message_id=resource_key AND hidden.user_id=conn.principal_user_id
            );
        IF NOT currently_allowed THEN
            event_kind := 'acl_change';
            event_tombstone := true;
            revision_protocol := 'metadata_only';
            invalidation_reason := CASE
                WHEN NOT conn.read_granted THEN 'read_grant_revoked'
                WHEN NOT conn.principal_active THEN 'principal_inactive'
                WHEN NOT conn.current_member THEN 'membership_changed'
                WHEN conn.chat_protocol NOT IN ('legacy_plaintext','server_at_rest') THEN 'chat_encryption_changed'
                ELSE 'message_visibility_changed'
            END;
            revision_metadata := jsonb_build_object('chat_id',conn.chat_id,'invalidation_reason',invalidation_reason,'purge_payloads',true);
        ELSIF conn.chat_id=old_chat AND old_eligible AND (TG_OP='DELETE' OR new_chat IS DISTINCT FROM old_chat OR NOT new_eligible) THEN
            event_kind := CASE WHEN new_chat IS DISTINCT FROM old_chat AND new_chat IS NOT NULL THEN 'move' ELSE 'delete' END;
            event_tombstone := true;
            revision_protocol := 'metadata_only';
            invalidation_reason := CASE WHEN event_kind='move' THEN 'scope_exit' ELSE 'message_deleted_or_ineligible' END;
            revision_metadata := jsonb_build_object('chat_id',conn.chat_id,'sender_id',old_sender,'message_type',old_type,'created_at',old_created,
                                                    'deleted',true,'invalidation_reason',invalidation_reason,'purge_payloads',true);
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
            revision_metadata := jsonb_build_object('chat_id',conn.chat_id,'sender_id',new_sender,'message_type',new_type,
                                                    'created_at',new_created,'updated_at',new_updated,'edited',event_kind='update');
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

CREATE OR REPLACE FUNCTION public.intelligence_source_v2_capture_membership_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target_chat text := CASE WHEN TG_OP='DELETE' THEN OLD.chat_id ELSE NEW.chat_id END;
    conn record;
BEGIN
    FOR conn IN
        SELECT DISTINCT c.id,scope.chat_id
        FROM public.intelligence_source_v2_connections c
        JOIN public.intelligence_installations installation ON installation.id=c.installation_id AND installation.enabled
        JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=target_chat
        JOIN public.chats chat ON chat.id=scope.chat_id AND chat.family_id=installation.family_id
        LEFT JOIN public.intelligence_source_v2_connection_grants read_grant
          ON read_grant.connection_id=c.id AND read_grant.grant_type='read'
        WHERE c.enabled AND c.revoked_at IS NULL
          AND (COALESCE(read_grant.granted,false) OR read_grant.revoked_at IS NOT NULL)
        ORDER BY c.id,scope.chat_id
    LOOP
        PERFORM public.intelligence_source_v2_emit_acl_tombstone(
            conn.id,conn.chat_id,'chat:'||target_chat,'membership_changed',true);
    END LOOP;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE TRIGGER intelligence_source_v2_membership_change_capture
AFTER INSERT OR DELETE ON public.chat_members
FOR EACH ROW EXECUTE FUNCTION public.intelligence_source_v2_capture_membership_change();

CREATE OR REPLACE FUNCTION public.intelligence_source_v2_capture_message_visibility() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target_message text := CASE WHEN TG_OP='DELETE' THEN OLD.message_id ELSE NEW.message_id END;
    target_user text := CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
    message_row record;
    conn record;
    revision_key text;
    event_key text;
    event_sequence bigint;
    event_time timestamptz := now();
BEGIN
    SELECT id,chat_id,sender_id,type,content,ciphertext,nonce,key_version,encryption_protocol,
           created_at,updated_at,is_edited,deleted_at
      INTO message_row
      FROM public.messages
     WHERE id=target_message AND type='text'
       AND encryption_protocol IN ('legacy_plaintext','server_at_rest');
    IF NOT FOUND THEN
        IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    FOR conn IN
        SELECT c.id,scope.chat_id,COALESCE(read_grant.granted,false) AS read_granted
        FROM public.intelligence_source_v2_connections c
        JOIN public.intelligence_installations installation ON installation.id=c.installation_id AND installation.enabled
        JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=message_row.chat_id
        JOIN public.chats chat ON chat.id=scope.chat_id AND chat.family_id=installation.family_id
        LEFT JOIN public.intelligence_source_v2_connection_grants read_grant
          ON read_grant.connection_id=c.id AND read_grant.grant_type='read'
        WHERE c.principal_user_id=target_user AND c.enabled AND c.revoked_at IS NULL
          AND (COALESCE(read_grant.granted,false) OR read_grant.revoked_at IS NOT NULL)
        ORDER BY c.id,scope.chat_id
    LOOP
        IF TG_OP='INSERT' OR NOT conn.read_granted OR message_row.deleted_at IS NOT NULL THEN
            PERFORM public.intelligence_source_v2_emit_acl_tombstone(
                conn.id,conn.chat_id,target_message,'message_visibility_changed',true);
        ELSE
            revision_key := gen_random_uuid()::text;
            event_key := gen_random_uuid()::text;
            UPDATE public.intelligence_source_v2_connections
               SET next_sequence=next_sequence+1
             WHERE id=conn.id
             RETURNING next_sequence-1 INTO event_sequence;
            INSERT INTO public.intelligence_source_v2_revisions
                (revision_id,connection_id,resource_id,chat_id,encryption_protocol,metadata,deleted,observed_at)
            VALUES (revision_key,conn.id,target_message,conn.chat_id,message_row.encryption_protocol,
                    jsonb_build_object('chat_id',conn.chat_id,'sender_id',message_row.sender_id,'message_type',message_row.type,
                                       'created_at',message_row.created_at,'updated_at',message_row.updated_at,
                                       'edited',message_row.is_edited,'restored_visibility',true),false,event_time);
            IF message_row.encryption_protocol='legacy_plaintext' THEN
                INSERT INTO public.intelligence_source_v2_revision_payloads(connection_id,revision_id,content)
                VALUES(conn.id,revision_key,message_row.content);
            ELSE
                INSERT INTO public.intelligence_source_v2_revision_payloads(connection_id,revision_id,ciphertext,nonce,key_version)
                VALUES(conn.id,revision_key,message_row.ciphertext,message_row.nonce,message_row.key_version);
            END IF;
            INSERT INTO public.intelligence_source_v2_events
                (event_id,connection_id,sequence,resource_id,revision_id,chat_id,kind,tombstone,observed_at)
            VALUES(event_key,conn.id,event_sequence,target_message,revision_key,conn.chat_id,'restore',false,event_time);
        END IF;
    END LOOP;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE TRIGGER intelligence_source_v2_message_visibility_capture
AFTER INSERT OR DELETE ON public.message_user_deletions
FOR EACH ROW EXECUTE FUNCTION public.intelligence_source_v2_capture_message_visibility();

CREATE OR REPLACE FUNCTION public.intelligence_source_v2_capture_chat_visibility() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    conn record;
BEGIN
    IF OLD.media_visibility IS NOT DISTINCT FROM NEW.media_visibility
       AND OLD.encryption_protocol IS NOT DISTINCT FROM NEW.encryption_protocol THEN
        RETURN NEW;
    END IF;
    FOR conn IN
        SELECT DISTINCT c.id,scope.chat_id
        FROM public.intelligence_source_v2_connections c
        JOIN public.intelligence_installations installation ON installation.id=c.installation_id AND installation.enabled
        JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=NEW.id
        JOIN public.chats chat ON chat.id=scope.chat_id AND chat.family_id=installation.family_id
        LEFT JOIN public.intelligence_source_v2_connection_grants read_grant
          ON read_grant.connection_id=c.id AND read_grant.grant_type='read'
        WHERE c.enabled AND c.revoked_at IS NULL
          AND (COALESCE(read_grant.granted,false) OR read_grant.revoked_at IS NOT NULL)
        ORDER BY c.id,scope.chat_id
    LOOP
        PERFORM public.intelligence_source_v2_emit_acl_tombstone(
            conn.id,conn.chat_id,'chat:'||NEW.id,'chat_visibility_changed',true);
    END LOOP;
    RETURN NEW;
END $$;

CREATE TRIGGER intelligence_source_v2_chat_visibility_capture
AFTER UPDATE OF media_visibility,encryption_protocol ON public.chats
FOR EACH ROW EXECUTE FUNCTION public.intelligence_source_v2_capture_chat_visibility();
