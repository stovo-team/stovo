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
