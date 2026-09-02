--
-- PostgreSQL database dump
--

\restrict VzzdRewl6MEPbbc8M7WrOFjxeprhKue2AaTTp4q95HWGZVc3Uy9eTadK70s030t

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

-- Schema additions introduced after this fixture's original database dump.
-- Kept here so the fixture represents the current migration state.
CREATE TABLE file_uploads (id text PRIMARY KEY);
CREATE TABLE sync_events (id text PRIMARY KEY);
CREATE TABLE sync_event_recipients (event_id text NOT NULL, user_id text NOT NULL, PRIMARY KEY (event_id, user_id));
CREATE TABLE client_operations (actor_user_id text NOT NULL, operation_id text NOT NULL, PRIMARY KEY (actor_user_id, operation_id));
CREATE TABLE outbox_events (id text PRIMARY KEY);
CREATE TABLE consumer_receipts (consumer_name text NOT NULL, event_id text NOT NULL, PRIMARY KEY (consumer_name, event_id));
CREATE TABLE notification_deliveries (event_id text NOT NULL, recipient_id text NOT NULL, channel text NOT NULL, PRIMARY KEY (event_id, recipient_id, channel));
CREATE TABLE polls (id text PRIMARY KEY);
CREATE TABLE poll_options (id text PRIMARY KEY);
CREATE TABLE poll_votes (id text PRIMARY KEY);

--
-- Name: call_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_participants (
    room_id text NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL,
    state text NOT NULL,
    joined_at timestamp with time zone
);


--
-- Name: call_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_sessions (
    id text NOT NULL,
    caller_id text NOT NULL,
    callee_id text NOT NULL,
    call_type text NOT NULL,
    state text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    duration_s integer,
    chat_id text,
    topology text DEFAULT 'mesh'::text NOT NULL
);


--
-- Name: chat_media_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_media_approvals (
    chat_id text NOT NULL,
    user_id text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: chat_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_members (
    chat_id text NOT NULL,
    user_id text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: chat_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_preferences (
    chat_id text NOT NULL,
    user_id text NOT NULL,
    is_muted boolean DEFAULT false NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    is_favorite boolean DEFAULT false NOT NULL,
    last_read_message_id text,
    last_read_at text,
    wallpaper_file_id text
);


--
-- Name: chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chats (
    id text NOT NULL,
    family_id text NOT NULL,
    type text NOT NULL,
    title text,
    created_by text,
    chat_photo_file_id text,
    media_visibility text NOT NULL,
    comments_enabled boolean DEFAULT true NOT NULL,
    encryption_protocol text DEFAULT 'server_at_rest'::text NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    pin_permission text DEFAULT 'everyone'::text NOT NULL
);


--
-- Name: families; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.families (
    id text NOT NULL,
    name text NOT NULL,
    storage_limit_mb integer,
    default_message_encryption_protocol text DEFAULT 'server_at_rest'::text NOT NULL,
    public_app_url text,
    public_api_url text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    minimized_chat_layout boolean DEFAULT false NOT NULL
);


--
-- Name: file_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_preferences (
    file_id text NOT NULL,
    user_id text NOT NULL,
    is_favorite boolean DEFAULT false NOT NULL
);


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id text NOT NULL,
    family_id text NOT NULL,
    uploaded_by text NOT NULL,
    chat_id text,
    access_scope text NOT NULL,
    storage_provider text NOT NULL,
    object_key text NOT NULL,
    original_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    checksum text,
    created_at text NOT NULL,
    deleted_at text,
    thumbnail_object_key text
);


--
-- Name: invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invites (
    id text NOT NULL,
    family_id text NOT NULL,
    token_hash text NOT NULL,
    role text NOT NULL,
    expires_at text NOT NULL,
    max_uses integer NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    created_by text NOT NULL,
    created_at text NOT NULL,
    revoked_at text
);


--
-- Name: media_quality_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_quality_settings (
    family_id text NOT NULL,
    media_type text NOT NULL,
    extension text DEFAULT ''::text NOT NULL,
    quality_percent integer NOT NULL,
    updated_at text NOT NULL
);


--
-- Name: message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_attachments (
    message_id text NOT NULL,
    file_id text NOT NULL
);


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    message_id text NOT NULL,
    user_id text NOT NULL,
    emoji text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: message_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_statuses (
    message_id text NOT NULL,
    user_id text NOT NULL,
    status text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: message_user_deletions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_user_deletions (
    message_id text NOT NULL,
    user_id text NOT NULL,
    deleted_at text NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id text NOT NULL,
    chat_id text NOT NULL,
    sender_id text NOT NULL,
    type text NOT NULL,
    content text,
    encryption_protocol text DEFAULT 'legacy_plaintext'::text NOT NULL,
    ciphertext text,
    nonce text,
    key_version integer,
    encryption_metadata text,
    reply_to_message_id text,
    thread_root_message_id text,
    message_kind text DEFAULT 'chat'::text NOT NULL,
    forwarded_from_message_id text,
    forwarded_from_chat_id text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    deleted_at text,
    is_edited boolean DEFAULT false NOT NULL
);


--
-- Name: pinned_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pinned_messages (
    chat_id text NOT NULL,
    message_id text NOT NULL,
    pinned_by text NOT NULL,
    pinned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plan_attendees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_attendees (
    plan_id text NOT NULL,
    user_id text NOT NULL,
    status text DEFAULT 'going'::text NOT NULL,
    updated_at text NOT NULL
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id text NOT NULL,
    family_id text NOT NULL,
    title text NOT NULL,
    notes text,
    location text,
    starts_at text NOT NULL,
    ends_at text NOT NULL,
    all_day boolean DEFAULT false NOT NULL,
    time_zone text DEFAULT 'UTC'::text NOT NULL,
    recurrence text,
    created_by text NOT NULL,
    source_chat_id text,
    revision integer DEFAULT 1 NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    deleted_at text
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id text NOT NULL,
    user_id text NOT NULL,
    token_hash text NOT NULL,
    expires_at text NOT NULL,
    created_at text NOT NULL,
    revoked_at text,
    ip_address text
);


--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_blocks (
    blocker_user_id text NOT NULL,
    blocked_user_id text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    family_id text NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    role text NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    public_key text,
    profile_photo_file_id text,
    created_at text NOT NULL,
    last_seen_at text,
    audio_call_settings text,
    ntfy_topic_token text,
    profile_visibility text DEFAULT 'family'::text NOT NULL,
    last_seen_visibility text DEFAULT 'family'::text NOT NULL,
    read_receipts_enabled boolean DEFAULT true NOT NULL
);


--
-- Name: call_participants call_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_participants
    ADD CONSTRAINT call_participants_pkey PRIMARY KEY (room_id, user_id);


--
-- Name: call_sessions call_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_pkey PRIMARY KEY (id);


--
-- Name: chat_media_approvals chat_media_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_media_approvals
    ADD CONSTRAINT chat_media_approvals_pkey PRIMARY KEY (chat_id, user_id);


--
-- Name: chat_members chat_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT chat_members_pkey PRIMARY KEY (chat_id, user_id);


--
-- Name: chat_preferences chat_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_preferences
    ADD CONSTRAINT chat_preferences_pkey PRIMARY KEY (chat_id, user_id);


--
-- Name: chats chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_pkey PRIMARY KEY (id);


--
-- Name: families families_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.families
    ADD CONSTRAINT families_pkey PRIMARY KEY (id);


--
-- Name: file_preferences file_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_preferences
    ADD CONSTRAINT file_preferences_pkey PRIMARY KEY (file_id, user_id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: invites invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY (id);


--
-- Name: invites invites_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_token_hash_key UNIQUE (token_hash);


--
-- Name: media_quality_settings media_quality_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_quality_settings
    ADD CONSTRAINT media_quality_settings_pkey PRIMARY KEY (family_id, media_type, extension);


--
-- Name: message_attachments message_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT message_attachments_pkey PRIMARY KEY (message_id, file_id);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (message_id, user_id, emoji);


--
-- Name: message_statuses message_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_statuses
    ADD CONSTRAINT message_statuses_pkey PRIMARY KEY (message_id, user_id, status);


--
-- Name: message_user_deletions message_user_deletions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_user_deletions
    ADD CONSTRAINT message_user_deletions_pkey PRIMARY KEY (message_id, user_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: pinned_messages pinned_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pinned_messages
    ADD CONSTRAINT pinned_messages_pkey PRIMARY KEY (chat_id, message_id);


--
-- Name: plan_attendees plan_attendees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_attendees
    ADD CONSTRAINT plan_attendees_pkey PRIMARY KEY (plan_id, user_id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: user_blocks user_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (blocker_user_id, blocked_user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_message_attachments_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_attachments_message ON public.message_attachments USING btree (message_id);


--
-- Name: idx_message_reactions_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_reactions_message ON public.message_reactions USING btree (message_id);


--
-- Name: idx_message_statuses_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_statuses_message ON public.message_statuses USING btree (message_id);


--
-- Name: idx_message_user_deletions_user_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_user_deletions_user_message ON public.message_user_deletions USING btree (user_id, message_id);


--
-- Name: idx_messages_chat_created_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_chat_created_active ON public.messages USING btree (chat_id, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_plans_family_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plans_family_range ON public.plans USING btree (family_id, starts_at) WHERE (deleted_at IS NULL);


--
-- Name: uq_family_chat_per_family; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_family_chat_per_family ON public.chats USING btree (family_id) WHERE (type = 'family'::text);


--
-- Name: chat_media_approvals chat_media_approvals_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_media_approvals
    ADD CONSTRAINT chat_media_approvals_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id);


--
-- Name: chat_media_approvals chat_media_approvals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_media_approvals
    ADD CONSTRAINT chat_media_approvals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: chat_members chat_members_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT chat_members_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id);


--
-- Name: chat_members chat_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT chat_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: chat_preferences chat_preferences_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_preferences
    ADD CONSTRAINT chat_preferences_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id);


--
-- Name: chat_preferences chat_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_preferences
    ADD CONSTRAINT chat_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: chats chats_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id);


--
-- Name: file_preferences file_preferences_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_preferences
    ADD CONSTRAINT file_preferences_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id);


--
-- Name: file_preferences file_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_preferences
    ADD CONSTRAINT file_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: files files_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id);


--
-- Name: files files_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id);


--
-- Name: files files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: invites invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: invites invites_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id);


--
-- Name: media_quality_settings media_quality_settings_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_quality_settings
    ADD CONSTRAINT media_quality_settings_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id);


--
-- Name: message_attachments message_attachments_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT message_attachments_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id);


--
-- Name: message_attachments message_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT message_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: message_reactions message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: message_reactions message_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: message_statuses message_statuses_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_statuses
    ADD CONSTRAINT message_statuses_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: message_statuses message_statuses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_statuses
    ADD CONSTRAINT message_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: message_user_deletions message_user_deletions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_user_deletions
    ADD CONSTRAINT message_user_deletions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: message_user_deletions message_user_deletions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_user_deletions
    ADD CONSTRAINT message_user_deletions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: messages messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id);


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: pinned_messages pinned_messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pinned_messages
    ADD CONSTRAINT pinned_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id);


--
-- Name: pinned_messages pinned_messages_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pinned_messages
    ADD CONSTRAINT pinned_messages_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: pinned_messages pinned_messages_pinned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pinned_messages
    ADD CONSTRAINT pinned_messages_pinned_by_fkey FOREIGN KEY (pinned_by) REFERENCES public.users(id);


--
-- Name: plan_attendees plan_attendees_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_attendees
    ADD CONSTRAINT plan_attendees_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: plan_attendees plan_attendees_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_attendees
    ADD CONSTRAINT plan_attendees_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: plans plans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: plans plans_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id);


--
-- Name: plans plans_source_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_source_chat_id_fkey FOREIGN KEY (source_chat_id) REFERENCES public.chats(id);


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_blocks user_blocks_blocked_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_user_id_fkey FOREIGN KEY (blocked_user_id) REFERENCES public.users(id);


--
-- Name: user_blocks user_blocks_blocker_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_user_id_fkey FOREIGN KEY (blocker_user_id) REFERENCES public.users(id);


--
-- Name: users users_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id);



--
-- Name: mcp_connectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_connectors (
    id text NOT NULL,
    family_id text NOT NULL,
    name text NOT NULL,
    actor_user_id text NOT NULL,
    token_hash text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    revoked_at text,
    created_by text NOT NULL,
    created_at text NOT NULL,
    last_used_at text,
    max_history_messages integer DEFAULT 50 NOT NULL,
    permissions text DEFAULT '{}'::text NOT NULL,
    provider text DEFAULT 'claude_code'::text NOT NULL,
    alias text DEFAULT ''::text NOT NULL,
    auth_mode text DEFAULT 'subscription'::text NOT NULL
);

CREATE TABLE public.mcp_connector_chats (
    connector_id text NOT NULL,
    chat_id text NOT NULL
);

CREATE TABLE public.mcp_audit_events (
    id text NOT NULL,
    family_id text NOT NULL,
    connector_id text NOT NULL,
    actor_user_id text NOT NULL,
    action text NOT NULL,
    chat_id text,
    message_id text,
    success boolean NOT NULL,
    error text,
    meta text DEFAULT '{}'::text NOT NULL,
    created_at text NOT NULL
);

ALTER TABLE ONLY public.mcp_connectors
    ADD CONSTRAINT mcp_connectors_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.mcp_connectors
    ADD CONSTRAINT mcp_connectors_actor_user_id_key UNIQUE (actor_user_id);
ALTER TABLE ONLY public.mcp_connectors
    ADD CONSTRAINT mcp_connectors_token_hash_key UNIQUE (token_hash);
ALTER TABLE ONLY public.mcp_connector_chats
    ADD CONSTRAINT mcp_connector_chats_pkey PRIMARY KEY (connector_id, chat_id);
ALTER TABLE ONLY public.mcp_audit_events
    ADD CONSTRAINT mcp_audit_events_pkey PRIMARY KEY (id);

CREATE INDEX idx_mcp_audit_connector_created ON public.mcp_audit_events USING btree (connector_id, created_at DESC);

ALTER TABLE ONLY public.mcp_connectors
    ADD CONSTRAINT mcp_connectors_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id);
ALTER TABLE ONLY public.mcp_connectors
    ADD CONSTRAINT mcp_connectors_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.mcp_connectors
    ADD CONSTRAINT mcp_connectors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE ONLY public.mcp_connector_chats
    ADD CONSTRAINT mcp_connector_chats_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES public.mcp_connectors(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.mcp_connector_chats
    ADD CONSTRAINT mcp_connector_chats_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.mcp_audit_events
    ADD CONSTRAINT mcp_audit_events_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id);
ALTER TABLE ONLY public.mcp_audit_events
    ADD CONSTRAINT mcp_audit_events_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES public.mcp_connectors(id) ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--

\unrestrict VzzdRewl6MEPbbc8M7WrOFjxeprhKue2AaTTp4q95HWGZVc3Uy9eTadK70s030t

