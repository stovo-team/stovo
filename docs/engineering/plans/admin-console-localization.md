# Admin console cleanup and localization

## Feature plan

- **User problem:** The admin landing page adds an unwanted category bar, several admin pages remain English in Russian mode, and Premium RBAC placeholders look interactive instead of locked.
- **Scope:** Remove the admin landing page category bar; use “Space settings” / “Настройки спейса”; localize the space switcher action, roles UI, plugin store, MCP connector page and panel in English and Russian; make all Premium RBAC controls visibly disabled and provide helper text for each option.
- **Observable behavior:** Admin links appear together without Overview/Access/Features/Integrations filters. Russian UI consistently calls a space “спейс” except the connect action, which reads “Добавить Space”. Role, plugin, and MCP labels and helper copy follow the selected language. Premium RBAC options and their “All” controls are disabled, greyed out, and each option explains its locked state.
- **Constraints:** Preserve current role/permission behavior, routes, backend APIs, and MCP scopes. Premium RBAC features remain placeholders with no save behavior. Do not add navigation categories.
- **Design decisions:** Put copy in the shared English/Russian string dictionaries; keep plugin IDs, permission keys, and backend values language-neutral. Keep disabled premium rows readable with muted text, borders, and controls.

## Test plan

- Admin hub: render as owner in both dictionaries; verify there is no category tab bar and all available destination links remain visible.
- Space naming: verify localized admin/server settings titles and the server switcher action use the requested English/Russian wording.
- Roles: verify role labels, permission groups, and action labels render in Russian; assert every Premium option and bulk control is disabled and has helper text; assert styles define muted disabled presentation.
- Plugins: verify title, plugin names, descriptions, status, and toggle accessible labels use the selected language.
- MCP: verify page title, setup form, permissions, connector actions/statuses, and edit dialog labels use the selected language.
- Validation: run focused frontend tests, frontend CI test/build commands, and the repository size boundary check.

## Follow-up visual and settings corrections

- **User problem:** The supervisor space list and its settings dialog still have oversized styling, text actions, square rows, no settings tabs, and mark basic space chat availability as Premium. The modal also omits the space AI controls.
- **Scope:** Use icon-only Settings and Invite actions; move Ghost Token and Delete into an accessible overflow menu; round space rows; rename the list “Your Spaces”; restore General, AI functions, Chats, and Premium tabs in the settings dialog; persist supervisor chat-type limits and AI switches; show only actual Premium restrictions as disabled; compact and responsively size statistics, monitoring, controls, and dialogs; use the brand orange as the default accent.
- **Observable behavior:** Each tab is selectable and keyboard-accessible. AI switches save through the tenant feature settings endpoint, chat-type switches save through master space settings, and backend chat creation rejects types disabled by the supervisor. Role-based limits remain Premium and inactive; basic supervisor chat availability stays editable. Ghost Token and Delete appear only in the row menu. At narrow widths, cards and dialogs fit the viewport and table rows scroll without losing their rounded corners.
- **Constraints:** Preserve existing routes, tenant feature enforcement, row actions, and localization. Do not expose screen-share bitrate controls. Premium rows remain unavailable, grey, and non-interactive.
- **Test plan:** Add regression coverage for disabled chat creation in the backend; extend orchestrator settings tests for persisted chat-type configuration and container environment; verify settings tabs, icon-only actions, overflow actions, enabled chat controls, disabled Premium controls, and modal close behavior in frontend component tests; run focused frontend/backend checks and the required architecture checks.
