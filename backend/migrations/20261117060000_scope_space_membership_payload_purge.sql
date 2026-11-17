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
            IF EXISTS (
                SELECT 1 FROM public.intelligence_source_v2_connections
                WHERE id=NEW.connection_id AND scope_kind='space'
            ) THEN
                DELETE FROM public.intelligence_source_v2_revision_payloads payload
                USING public.intelligence_source_v2_revisions revision
                WHERE payload.connection_id=NEW.connection_id
                  AND revision.connection_id=payload.connection_id
                  AND revision.revision_id=payload.revision_id
                  AND revision.chat_id=NEW.chat_id;
            ELSE
                DELETE FROM public.intelligence_source_v2_revision_payloads
                WHERE connection_id=NEW.connection_id;
            END IF;
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
