---
title: "Chat Import and Export — V1 Design"
type: specification
---

# Chat Import and Export — V1 Design

**Status:** Proposed for review
**Scope:** One chat per import or export; file based; no provider API connections.

## 1. Problem and goals

Stovo users need to move or preserve the history of one conversation using files produced by Telegram, WhatsApp, Slack, Mattermost, Rocket.Chat, or Stovo itself. They also need to export a Stovo conversation in a provider-shaped format where the provider has a useful file representation.

V1 must:

- Import a file that represents exactly one source chat or channel into a **new, separate Stovo chat**.
- Export one selected Stovo chat at a time.
- Keep file parsing and serialization behind named provider adapters and use one provider-neutral archive model between adapters and the application.
- Show whether an output is a Stovo round-trip archive, a readable provider archive, or a package verified for a provider's native importer.
- Preserve source authors and historical timestamps without creating accounts or impersonating Stovo members.
- Provide a preview and loss report before committing an import.
- Keep source and destination processing file based. No Telegram, WhatsApp, Slack, Mattermost, or Rocket.Chat API synchronization is in scope.

## 2. Out of scope for V1

- Importing or exporting a whole workspace, server, account, or set of conversations.
- Live provider connections, scheduled sync, webhooks, or remote file fetching.
- Merging imported history into an existing Stovo conversation.
- Automatically provisioning or matching source users to Stovo accounts.
- Recreating provider workspace settings, permissions, roles, bots, integrations, or account credentials.
- Guaranteeing native import compatibility for a provider unless that exact output profile is validated against its native importer.

Full Slack workspace archives, Mattermost bulk/server exports, and Rocket.Chat server/database exports are V2 work. Telegram Desktop can export all chats, but V1 accepts only a single-chat export. WhatsApp's export flow is per chat.

## 3. User flows

### Export

1. From the selected chat's chat-only menu, choose **Export chat**.
2. Choose Stovo or a named provider profile.
3. Review the compatibility label and any data-loss notes.
4. Confirm the export. If E2E messages need to be decrypted, show a clear notice that the resulting file may contain plaintext.
5. Download one file, normally a ZIP when the profile includes attachments.

The export operation is authorized against the selected chat and exports only messages and attachments visible to the requesting member.

### Import

1. From the chat area, choose **Import chat** and select a local file.
2. Detect the provider from the file structure and validate that it contains exactly one chat/channel.
3. Show source name, participant labels, message count, date range, attachment count, and warnings.
4. Confirm import.
5. Create a new private archive-type chat for the importing Stovo member. Use the source title with a clear imported marker. The current chat is not modified.
6. Show a completion report with imported, converted, skipped, and unavailable items.

An import job retry with the same job/idempotency key must not duplicate messages. A user may intentionally import the same file again as a separate chat after an explicit duplicate warning.

## 4. V1 provider matrix

| Adapter | V1 input | V1 output profile | Compatibility claim |
|---|---|---|---|
| Stovo | Versioned Stovo chat archive | Versioned Stovo chat archive | Native Stovo round trip for supported fields |
| Telegram | Telegram Desktop JSON for one chat | Telegram-shaped JSON archive | Readable archive; do not promise Telegram-native reimport |
| WhatsApp | One-chat TXT, optionally accompanied by its exported media | TXT plus media package | Readable archive; WhatsApp says its text export cannot be reimported into WhatsApp |
| Slack | Export ZIP/JSON containing one channel only | One-channel Slack-shaped archive | Readable archive until exact output is verified with Slack's importer |
| Mattermost | Enterprise Channel Export CSV for one channel | Channel CSV archive; optionally a Mattermost bulk-import JSONL profile | CSV is archive-only. Mark JSONL as native-importable only after a compatibility test; disclose that bulk import may create team/channel/user records |
| Rocket.Chat | JSON export for one room | Room JSON archive | Readable archive; no native-import claim without a verified room-level importer |

Provider output is exposed only when its adapter can produce a useful file. A profile declares:

- providerId
- profileId and format/version
- compatibility: stovo_round_trip, provider_archive, native_import_verified, or native_import_unverified
- known losses and import side effects
- whether media is embedded or represented by references

Do not label a profile “native import” merely because its syntax resembles an export file. Slack documents importing from one Slack workspace to another, while WhatsApp explicitly says its TXT export is not reimportable. Mattermost has a JSONL bulk-import format, but that is distinct from its single-channel CSV export.

### V2 feasibility

- **Slack:** Workspace exports include channel/message data and file links, with private-channel/DM access depending on plan and permissions. A V2 parser can accept a whole workspace ZIP and let the user select one conversation, but the user-facing scope must make clear that the input archive itself is workspace-wide. Slack's native import is a workspace migration and has plan restrictions.
- **Mattermost:** Bulk export and import share a JSONL format containing teams, channels, posts, users, and related records. The exporter does not support selecting particular server areas; mmctl server export can include attachments. V2 can parse these full exports and let the user select one channel.
- **Rocket.Chat:** Cloud-hosted workspace data can be provided as a MongoDB export containing messages, users, channels, and metadata. This is a migration-level input and requires a separate parser/mapping path, not a room JSON adapter.
- **Telegram:** Desktop supports exporting all chats, but V1 rejects multi-chat exports.
- **WhatsApp:** Keep the one-chat export as the supported source; do not describe it as a whole-account backup format.

## 5. Canonical Stovo archive

Use a versioned, provider-neutral ChatArchive envelope. Its manifest identifies the schema version, source provider/profile, source conversation ID when available, export time, title, and capabilities.

The archive contains:

- One conversation and its display metadata.
- Source participants as external identities: source ID, display name, and non-sensitive source attributes.
- Messages in chronological order with source ID, source timestamp, normalized UTC timestamp when derivable, message kind, text/rich-text blocks, edit/deletion markers, thread/reply references, reactions, attachments, and provider-specific metadata.
- Attachment bytes under generated safe relative paths, plus filename, MIME type, size, and checksum. External URLs are references only.
- A loss/warning manifest for unsupported content.

The archive preserves semantic message content and supported metadata, not Stovo encryption keys or provider credentials. Reimport creates fresh Stovo message IDs and encrypts content according to the destination chat's Stovo policy.

## 6. Import attribution and message behavior

The current message schema requires sender_id to reference a Stovo user. Add a distinct import-author representation rather than creating login accounts for source participants. Each imported message retains:

- The Stovo importing member as the audit actor.
- The source author's provider ID and source display name as display attribution.
- An imported marker and import-batch provenance.

The UI must make imported attribution distinguishable from a message sent by a Stovo member. Never map by display name or email automatically. V1 does not invite or create users.

Preserve original timestamps and ordering where the source provides them. Preserve replies/threads and reactions when the provider data and Stovo model allow it; retain source IDs and report any flattened relationship. Imported history creates no live send, read, delivered, or unread notification events. The importer must not create real calls, polls, checklists, canvases, or other executable Stovo objects from untrusted source payloads. Unsupported structured messages remain visible as safe imported snapshots or text with warnings.

## 7. Encryption, files, and parser safety

- E2E decryption keys are held by the client; E2E export must use a client crypto path. Never export ciphertext as if it were readable content.
- Imported plaintext must be encrypted according to the destination Stovo chat's configured protocol before durable persistence. No import endpoint may bypass normal authorization or encryption policy.
- Provider-shaped files may contain plaintext. Warn before download; never include E2E keys in an archive.
- Parse only local file bytes. Do not fetch URLs found in messages, Slack file links, or attachment metadata.
- Bound compressed and expanded size, entry count, per-file size, message count, and nesting. Reject path traversal, duplicate/ambiguous conversation entries, malformed timestamps that cannot be safely handled, and decompression bombs.
- Sanitize filenames, MIME types, HTML, markdown, links, and provider-specific metadata before display or storage.
- Validate and store actual attachments through Stovo's existing file validation/storage boundary. If a source archive provides only a link, preserve the link as a reference and report that the binary was not imported.
- A failed import must not leave a partially visible chat. Persist the chat, message rows, provenance, and attachment references atomically where possible; clean up staged objects on failure.

## 8. Architecture boundaries

- `backend/internal/features/chattransfer` owns the canonical archive types, provider capability declarations, validation rules, and import/export domain contracts.
- Browser adapters under `frontend/src/features/chats/transfer/adapters/{stovo,telegram,whatsapp,slack,mattermost,rocketchat}` parse local provider files and serialize exports to/from ChatArchive. They are pure format transformations and never access the network or provider APIs.
- `backend/internal/app` authorizes chat access, creates the private imported chat, persists messages/provenance, and routes attachments through existing storage boundaries.
- The browser keeps provider files, export serialization, E2E decryption, and export plaintext local. The backend export-source operation returns only data the requesting chat member may read; E2E messages remain ciphertext until the client decrypts them.
- HTTP transport exposes Stovo application operations for upload/preview/confirm/download. These are not provider API integrations.
- The frontend owns the chat-only entry points, preview/loss report, explicit E2E plaintext notice, and download UX.
- The V1 importer registry accepts only the documented single-chat input profiles above. Full workspace archive detection returns a targeted “not supported in V1” result rather than silently selecting one conversation.

## 9. Acceptance criteria

1. Each named V1 importer accepts a valid single-chat fixture and produces the same canonical representation for equivalent content.
2. Multi-chat/workspace/server exports are rejected in V1 before any chat or message is created.
3. Preview reports author count, message count, date range, attachments, and all known transformations or omissions.
4. Confirming import creates exactly one new private chat; existing chats and unread counters are not modified.
5. Source authors remain external display identities and are not confused with Stovo accounts.
6. Historical dates, ordering, thread links, supported reactions, and available attachment bytes survive import/export round trips through the Stovo archive.
7. Malformed, oversized, traversal, and decompression-bomb fixtures fail safely without partial import.
8. Export compatibility labels distinguish a Stovo round trip, a readable provider archive, and a verified native-import package.
9. E2E plaintext is exposed only through the client crypto flow and an explicit export confirmation; keys are never exported.
10. Repeating a network retry for one import job does not duplicate the imported conversation.

## 10. Source references

- [Telegram Desktop chat and all-chat exports](https://bugs.telegram.org/c/60/2)
- [Telegram import of chat history from other apps](https://telegram.org/blog/move-history)
- [WhatsApp chat export](https://faq.whatsapp.com/1180414079177245/?cms_platform=android&locale=pa_IN)
- [Slack workspace export options](https://slack.com/help/articles/201658943-Export-your-workspace-data)
- [Slack export file structure and linked files](https://slack.com/help/articles/220556107-How-to-read-Slack-data-exports)
- [Slack workspace-to-workspace import](https://slack.com/help/articles/217872578-Import-data-from-one-Slack-workspace-to-another)
- [Mattermost single-channel CSV export](https://docs.mattermost.com/administration-guide/comply/export-mattermost-channel-data)
- [Mattermost bulk export format](https://docs.mattermost.com/administration-guide/manage/bulk-export-tool)
- [Mattermost full server export](https://docs.mattermost.com/administration-guide/manage/cloud-data-export)
- [Rocket.Chat room export](https://docs.rocket.chat/v1/docs/room-options)
- [Rocket.Chat Cloud workspace data export](https://docs.rocket.chat/hosting-faq)
