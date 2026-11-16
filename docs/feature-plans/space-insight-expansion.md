# Stovo Insight Space connection

## Feature plan

Enable an owner or `manage_integrations` administrator to authorize one Stovo Insight connection for the current Space and selected Messenger user. The existing per-chat consent remains available. Space consent clearly describes its broader reach, requires an explicit confirmation, and scopes the credential to all eligible chats the initiating user can currently access in the authenticated Space, including direct/private chats. Each message read still checks current membership and visibility for that user. Existing source grants and revocation continue to apply independently.

The source database remains authoritative for family boundaries and current chat membership. Consent and source reads must reject an inactive user, a non-admin broad-scope request, or a chat from another family. The connection must not broaden any existing chat-scoped connection.

Multi-Admin keeps its existing AI-functions controls for enabling and disabling Space AI features. They are separate from Stovo Insight user linking. The user source-link is started by the authenticated Intelligence MCP session; it does not use the platform-management token as a source credential.

## Test plan

| ID | Scenario | Proof layer | Expected result |
|---|---|---|---|
| SI-SPACE-01 | Space admin requests broad consent | App/DB contract | Authorized consent is stored as Space scope |
| SI-SPACE-02 | Member requests broad consent | App/DB contract | Request is forbidden and creates no connection |
| SI-SPACE-03 | Space scope captures shared eligible chat | DB trigger contract | Event is captured in that Space only |
| SI-SPACE-04 | Space scope sees a direct chat in the same Space | DB trigger contract | Event is captured only while the linked user remains a member |
| SI-SPACE-04b | Space scope sees a chat from another Space | DB trigger contract | No event is captured |
| SI-SPACE-05 | Existing chat connection | Regression contract | Only the original chat remains in scope |

All automated checks use fixture identities and isolated test databases.

## Implementation status and boundary

The current worktree implements explicit `chat`/`space` consent and credential scope in Messenger, a single credential indexed to the linked user's currently accessible chats, join/leave scope maintenance, chat-level capture, live per-resource membership checks, and Space-aware Intelligence ingestion. Existing chat records default to `chat`. Deploy still requires applying both repositories' migrations and populating the existing default-off OIDC/source configuration. Multi-Admin controls Space AI features only; the user starts Insight linking through the authenticated Intelligence MCP tool. Production Intelligence `/admin` remains fixture-only and is not required for this user-owned flow.
