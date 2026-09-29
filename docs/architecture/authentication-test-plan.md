# Web authentication feature test plan

This document defines the acceptance and security test marker for adding passkeys and QR sign-in to Stovo web authentication, and passkey registration during guest-invite acceptance. It is a plan, not an implementation. The intended UI keeps username/password as the default login form, with passkey and QR as secondary options. Google sign-in is out of scope.

## Product and security contract

- Authentication is scoped to the currently selected Stovo space/server. A credential or pending login request from one space must not authenticate into another.
- Password remains a supported fallback. A passkey-only account must be possible for an invitee who chooses passkey at registration.
- A passkey private key is held by the user's authenticator. Stovo stores the credential identifier, public key, and protocol metadata required to verify assertions.
- Successful password, passkey, QR approval, and invite registration all issue the existing Stovo session contract, including the refresh cookie behavior for web.
- QR approval authorizes a new browser session. It never copies or returns the phone's access or refresh token to the browser.
- WebAuthn requires a secure browser context (HTTPS for normal hostnames; browser localhost exception). On insecure HTTP, password and app-scanned QR remain available; passkey is unavailable with an understandable explanation. If browser camera access is unavailable, QR login has a short-code fallback.
- Challenges, invite tokens, and QR requests are short-lived, one-use where applicable, scoped to their intended purpose, and protected against replay and concurrent consumption.
- Error responses do not reveal whether a username, credential, invitee account, or QR request exists beyond what the corresponding flow requires.
- Existing password accounts, existing refresh sessions, and existing invite acceptance behavior remain compatible through migration.

## Decisions to settle before coding

1. Select a WebAuthn implementation and establish supported web origins/RP ID derivation for self-hosted spaces. Never trust an unvalidated Host header to choose the RP ID.
2. Define storage for authentication methods: password may be absent; one account can have multiple passkeys; credentials have unique IDs and revocation state. Decide whether legacy `password_hash NOT NULL` is made nullable or normalized into credential records.
3. Define recovery: a passkey-only user needs a second passkey or another account recovery path. Do not silently imply that the invite link is a reusable recovery secret.
4. Define QR protocol state location and lifetime, polling/notification behavior, rate limits, and whether code fallback is enabled for app-only or browser scanning.
5. Define behavior for self-hosted HTTP clearly: hide or disable passkey with a reason, while preserving password and QR where the client capabilities allow them.
6. Confirm session duration/rotation policy separately; this feature must not accidentally extend session lifetime or change refresh-token semantics.

## Scenario matrix

### A. Login page and compatibility

- Initial page shows username/password by default; passkey and QR are secondary actions.
- Valid password login still succeeds and writes the expected refresh cookie; invalid password remains generic and does not reveal account existence.
- Selecting another space changes the authentication target; returning to the first space does not reuse a pending challenge from the second.
- Query parameters, invite tokens, and navigation state never prefill or persist a password.
- Loading, cancellation, network failure, server error, and retry restore a usable state without duplicate submissions.
- Existing native login behavior and existing device-login flow are unchanged; QR web login is a distinct capability and route.
- If passkeys are unsupported by the browser, the option degrades gracefully without blocking password or QR.

### B. Passkey enrollment from an authenticated account

- Authenticated user can begin enrollment; unauthenticated caller cannot.
- Valid registration options bind challenge, user, RP ID, origin, and purpose.
- Valid browser attestation/registration response creates a credential for the authenticated user and reports success.
- User cancellation leaves no credential and does not invalidate the current session.
- Invalid, missing, expired, replayed, wrong-origin, wrong-RP-ID, wrong-user, or wrong-purpose response is rejected.
- Reusing a credential ID is rejected; a credential belonging to one user cannot be attached to another.
- Multiple distinct passkeys may be registered; duplicate registration is handled safely.
- User can list and revoke a passkey; revocation takes effect immediately for subsequent authentication.
- Revoking one passkey does not revoke other passkeys or password login. Removing the last usable method is blocked or requires explicit recovery setup according to the chosen recovery policy.
- Concurrent enrollment attempts cannot consume each other's challenge.

### C. Passkey login

- Valid assertion for an enrolled active credential issues a normal Stovo session for that account and selected space.
- Unknown credential, revoked credential, invalid signature, wrong challenge, wrong RP ID/origin, expired challenge, malformed response, and replay are rejected without a session.
- Challenge is one-use under simultaneous duplicate submissions; at most one request succeeds.
- Browser cancellation is a recoverable UI outcome, not an account lockout.
- Login does not require the user to type a password or reveal an account-existence-dependent response. The discoverable-credential/usernameless flow may be used only if the chosen credential model supports it; otherwise username entry before the passkey ceremony is an explicit design choice.
- Passkey registered on server A cannot authenticate to server B, including two spaces hosted under different RP IDs.
- Successful sign-in creates the same web cookie attributes, rotation, and logout/revocation behavior as password login.

### D. Guest invite registration with password

- Valid invite preview and existing password-based acceptance still work.
- Form collects required display name/nickname and shows an explicit password-vs-passkey choice; QR is absent.
- Password choice enforces existing minimum/normalization rules, creates the user and password credential, consumes the invite exactly once, joins the intended space/family, applies defaults/role, and issues the usual session.
- Invalid, expired, exhausted, revoked, or wrong-space invite creates no user and no session.
- Duplicate username or persistence error does not consume a valid invite unless the account transaction committed.
- Double submit/concurrent acceptance cannot exceed invite usage or create duplicate accounts.

### E. Guest invite registration with passkey

- Selecting passkey collects identity fields and starts registration bound to the invite's space and intended new user.
- Successful ceremony atomically creates a passkey-only account, consumes the invite, applies role/defaults, and issues the normal session.
- Invite expiry/revocation/usage exhaustion between ceremony start and completion prevents account creation and session issuance.
- Attestation cancellation, unsupported browser, invalid response, challenge expiry, wrong RP ID/origin, credential collision, and database failure leave no partially registered account and do not consume the invite.
- Replayed registration completion cannot create a second account or issue another session.
- Invite token and WebAuthn challenge cannot be swapped between two invites or users.
- A passkey-only account can later enroll another passkey while authenticated. Recovery policy is visible before the user commits to passkey-only registration.
- Password registration remains available if HTTPS/WebAuthn is unavailable.

### F. QR browser sign-in

- Browser starts QR login for selected space and receives a random, unguessable, short-lived pending request; QR contains no access token, refresh token, password, or reusable bearer credential.
- QR is rendered and rotates/expires as designed. Expiry and refresh states are visible.
- Authenticated phone scans the request and shows a confirmation containing at least space/server and browser/device context; no approval occurs merely by scanning.
- Phone cancellation/rejection leaves browser unauthenticated.
- Approval by an active account issues a new browser-specific session; phone session remains valid and unchanged.
- Approval from an account in another space, unauthenticated phone, revoked phone session, inactive account, or banned client context is rejected.
- Expired, unknown, malformed, already-approved, already-denied, or consumed request cannot issue another session.
- Simultaneous approvals, pollers, and duplicate callbacks result in at most one browser session issuance.
- Browser polling/stream connection only reveals state for its own pending request; request IDs cannot enumerate another user's requests.
- Rate limits cover request creation, status polling, scan/approval attempts, and short-code guessing. Limits are space-aware and do not reveal account membership.
- QR request is invalidated on browser cancellation/logout and does not remain usable after navigation or expiry.
- Short-code fallback has sufficient entropy for its lifetime, attempt limits, and no account-enumerating response.
- QR on HTTP is tested separately from passkeys: app-based scanning/approval may work, but browser camera limitations do not block manual code entry or password login.

### G. Sessions, space isolation, and migration

- Each auth method issues a distinct refresh-token row/device session with correct IP/device metadata and existing rotation semantics.
- Refresh, logout, password change, account deactivation, and session revocation operate identically regardless of how the session was created.
- Revoking the phone session after QR approval does not implicitly revoke the separately issued browser session unless product policy explicitly says so.
- Database migration preserves all existing users, password hashes, refresh tokens, and invite records; rollback/forward behavior is documented for the chosen migration strategy.
- Passkey credential uniqueness is enforced in persistence under concurrent inserts.
- Space/tenant identifiers are present in all credential lookups and pending protocol state; no cross-space lookup or response leakage occurs.

## Test layers and recommended cases

### Unit and property-based tests

- Challenge generation: fixed-length/encoding contract, adequate entropy source errors surfaced, no accidental reuse in generated samples (statistical smoke check only; not a cryptographic proof).
- Challenge validation: property that any altered challenge, purpose, user, space, RP ID, origin, or expiry fails; exact valid tuple succeeds.
- QR token/code parsing: property that normalization only accepts documented format and never changes one valid token into another; fuzz Unicode, whitespace, truncation, oversized input, invalid encodings, and malformed payloads.
- State machine properties: terminal QR states never transition back; a request can produce at most one successful approval/session; terminal or expired states reject all mutations.
- Invite consumption and WebAuthn challenge consumption are idempotence/concurrency invariants: one pending artifact can be committed at most once.
- Credential selection always scopes to the expected space/user and excludes revoked credentials.
- Use deterministic clock and entropy providers. Add Go fuzz targets for parsers/normalizers and protocol response decoding only after those boundaries exist; retain minimized regressions as named tests.

### Backend unit tests

- WebAuthn ceremony option generation and response validation, with origin/RP ID/challenge mismatch cases.
- Auth method policy, session issuance adapter, token hashing, expiration, one-time status transitions, rate-limit response mapping, and generic error behavior.
- Invite registration command validation for password and passkey variants.
- QR approval authorizes actor and browser target without exposing session secrets to the approving phone response.

### Backend integration tests

Use disposable PostgreSQL/Redis. Verify migrations, uniqueness, transaction rollback, invite consumption, passkey persistence, QR one-time atomic transitions, session issuance/rotation/revocation, and concurrent requests against real persistence/cache. Add HTTP handler tests for request decoding, status codes, cookie attributes, CSRF/origin protections, and response secrecy. Include restart/multi-instance behavior if pending QR/challenge state is stored outside process memory.

### Frontend unit/component tests

- Login default hierarchy, switching methods, unsupported/insecure-context passkey state, request pending/error/cancel/expiry states, and no password leakage to URLs/storage/logging.
- Invite form mode selection and conditional validation: password only required in password mode; QR never offered; passkey cancellation returns to usable form.
- WebAuthn API wrapper maps browser cancellation and unsupported API distinctly and does not submit stale response after space/navigation changes.
- QR display/polling state: waiting, approved, rejected, expired, network recovery, refresh, and short-code fallback.
- Accessibility: keyboard selection, focus movement into/out of dialogs, screen-reader state announcements for polling/expiry, and clear confirmation text on phone.

### End-to-end tests

At least these isolated cross-layer journeys:

1. Existing password account logs in and refreshes as before.
2. User enrolls a passkey, logs out, signs in with passkey, then logs out/revokes it.
3. Invitee accepts an invite with password and lands in the correct space.
4. Invitee accepts an invite with passkey and later signs in with that passkey.
5. Logged-in phone scans web QR, user confirms, browser gets its own session; phone and browser both remain independently usable.
6. Phone rejects QR; browser receives no session. Expired QR cannot be approved.
7. HTTP deployment retains password login and reports passkey unavailable; HTTPS deployment exercises passkey path.
8. Two spaces cannot use each other's pending QR requests, invite challenges, or passkeys.

Use a deterministic virtual authenticator where the browser automation stack supports it. Keep at least one manual compatibility check across representative Safari/iOS, Chrome/Android, and desktop browser/password-manager combinations; simulated WebAuthn cannot prove every authenticator UX.

## Fuzzing and security review boundaries

Fuzz JSON/request decoding, QR code parsing, WebAuthn client response parsing, and state-transition command inputs for crashes, panics, unbounded allocation, and inconsistent validation. Fuzzing is not a proof of protocol correctness and does not replace the named origin, replay, cross-space, and concurrency tests above.

Before release, review specifically for challenge randomness/one-time consumption, CSRF and origin checks, RP ID derivation, replay races, session leakage in QR URLs/logs/analytics, account/credential enumeration, rate-limit bypass, invite transaction boundaries, and secret redaction. Use a maintained WebAuthn library rather than hand-implementing signature verification.

## Definition of done for the test-first implementation

- This scenario list is reviewed and scoped against the first implementation milestone.
- Named tests for core acceptance, rejection, one-time use, space isolation, and session-cookie contracts are committed before the implementation code; the relevant tests are observed failing for missing behavior.
- Each security invariant has at least one deterministic automated test at the layer that owns it.
- Critical cross-device journeys are covered end to end, with unsupported-browser/HTTP fallback covered at component or end-to-end level.
- New migrations preserve legacy accounts and are verified against a disposable database.
- Test execution results and any intentionally deferred cases are recorded with the implementation.

## Executable case catalog

The matrix above describes coverage categories. This catalog turns them into individual test cases. A case should be implemented at the lowest layer that can prove its contract; cases explicitly marked integration/E2E should retain that layer. Use fixed test clocks and injected random sources for deterministic boundary tests. Authentication protocol fakes may produce valid WebAuthn responses, but must not replace verification tests against the chosen maintained WebAuthn library.

### 1. Login page and browser capability cases

| ID | Setup and action | Expected result | Layer |
|---|---|---|---|
| UI-LOGIN-01 | Open login as signed-out browser | Username and password form is visible immediately; it is the primary submit action | Component |
| UI-LOGIN-02 | Open login | Secondary Passkey and QR actions are visible and keyboard reachable | Component |
| UI-LOGIN-03 | Submit valid password credentials | Existing login API called once with username/password; app navigates to chats | Component + E2E |
| UI-LOGIN-04 | Submit invalid credentials | Generic error shown; password remains editable; no account-existence hint | Component + E2E |
| UI-LOGIN-05 | Reload login with username query parameter | Username may be prefilled; password is empty | Component |
| UI-LOGIN-06 | Open crafted URL containing password query parameter | Password is never populated; secret is not copied to app state or storage | Component |
| UI-LOGIN-07 | Browser reports WebAuthn API unavailable | Passkey is disabled/hidden with explanation; password and QR remain usable | Component |
| UI-LOGIN-08 | Browser is not a secure context on a normal hostname | Passkey cannot start; explanation says secure connection is required; password remains usable | Component + E2E |
| UI-LOGIN-09 | Browser is a secure context | Passkey action is enabled | Component |
| UI-LOGIN-10 | Browser is localhost over HTTP | Apply the supported browser localhost secure-context behavior; no false HTTP warning | Component + browser matrix |
| UI-LOGIN-11 | User cancels the platform passkey prompt | Return to login options without error page or locked form | Component + E2E |
| UI-LOGIN-12 | Passkey request fails due to network/server error | Show recoverable error and allow retry; do not fall back silently to password submission | Component |
| UI-LOGIN-13 | User switches methods while one request is pending | Prevent duplicate requests and stale completion from changing the newly selected method | Component |
| UI-LOGIN-14 | Browser back/forward while passkey or QR is pending | Pending state is safely cancelled/expired and cannot authenticate after navigation | Component + E2E |
| UI-LOGIN-15 | Page is opened with a saved space prefix | All auth requests and callback navigation remain inside that selected space | Component + E2E |
| UI-LOGIN-16 | Two spaces are saved in server registry | Login page shows/uses the active space only; no implicit account merging | Component |
| UI-LOGIN-17 | Authentication action returns expired challenge | Show expired/restart state; obtain a new challenge on retry | Component |
| UI-LOGIN-18 | Screen reader observes passkey/QR pending and failure states | Status is announced once and has meaningful accessible labels | Component accessibility |

### 2. Passkey enrollment cases

| ID | Setup and action | Expected result | Layer |
|---|---|---|---|
| PK-REG-01 | Authenticated user starts enrollment over HTTPS | Server returns registration options for that user and active space | Backend unit + HTTP |
| PK-REG-02 | Unauthenticated caller starts enrollment | 401; no challenge credential is persisted for later completion | HTTP integration |
| PK-REG-03 | Registration options requested with untrusted Host header | Server uses configured/validated public origin; Host cannot choose RP ID | Backend unit + HTTP |
| PK-REG-04 | Registration options generated for supported configured origin | RP ID and allowed origin match configuration exactly | Backend unit |
| PK-REG-05 | Valid registration response completed | Credential ID/public key stored for authenticated user and space | Backend integration |
| PK-REG-06 | Completion response has a different challenge | Reject; no credential inserted | Backend unit + integration |
| PK-REG-07 | Completion response uses expired challenge | Reject; challenge is terminal/consumed | Backend unit + integration |
| PK-REG-08 | Completion response uses challenge created for login purpose | Reject purpose mismatch | Backend unit |
| PK-REG-09 | Completion response has wrong origin | Reject; no credential inserted | Backend unit |
| PK-REG-10 | Completion response has wrong RP ID hash | Reject; no credential inserted | Backend unit |
| PK-REG-11 | Completion response has invalid signature/attestation structure | Reject without panic or partial row | Backend unit + fuzz |
| PK-REG-12 | Credential ID already belongs to same user | Reject duplicate or return documented idempotent result; never duplicate row | Backend integration |
| PK-REG-13 | Credential ID already belongs to another user/space | Reject; do not disclose owner identity | Backend integration |
| PK-REG-14 | Two enrollment challenges complete concurrently with same credential ID | Unique constraint allows at most one insertion | Backend concurrency |
| PK-REG-15 | User cancels browser enrollment | No credential stored; current login session remains valid | Component + integration |
| PK-REG-16 | Database fails after successful cryptographic verification | Transaction rolls back; no success response or auth session is issued | Backend integration |
| PK-REG-17 | User enrolls two different passkeys | Both are listed under the same user/space and work independently | Backend integration + E2E |
| PK-REG-18 | User names passkey with empty/oversized/control-character label | Apply documented label validation/normalization; credential itself remains unaffected | Backend unit + component |
| PK-REG-19 | User lists their passkeys | Only their own space-scoped public metadata is returned; never return private key material | HTTP integration |
| PK-REG-20 | User attempts to list another account's passkeys | 403/404 according to API policy; no metadata leaks | HTTP integration |
| PK-REG-21 | User revokes one of multiple passkeys | Target credential becomes unusable; remaining credential works | Backend integration + E2E |
| PK-REG-22 | User revokes nonexistent or already-revoked credential | Stable idempotent/not-found contract; no other credential is changed | Backend unit + integration |
| PK-REG-23 | User attempts to revoke the only recovery-capable credential | Enforce approved recovery policy and explain required next step | Backend + component |
| PK-REG-24 | Authenticated user enrolls passkey after password-based sign-in | Both methods work; password hash and current session remain intact | Backend integration |

### 3. Passkey authentication cases

| ID | Setup and action | Expected result | Layer |
|---|---|---|---|
| PK-AUTH-01 | Known active credential returns valid assertion | Issue normal access token and HttpOnly refresh cookie for its owner | Backend integration |
| PK-AUTH-02 | Valid assertion for credential in selected space | Authenticate only within selected space | Backend integration + E2E |
| PK-AUTH-03 | Credential exists only in a different space | Reject with generic authentication failure | Backend integration |
| PK-AUTH-04 | Unknown credential ID | Generic unauthorized response; no account enumeration | Backend integration |
| PK-AUTH-05 | Revoked credential ID | Generic unauthorized response; no session | Backend integration |
| PK-AUTH-06 | Assertion signature altered | Reject; no session | Backend unit |
| PK-AUTH-07 | Assertion challenge altered | Reject; challenge is consumed/terminal | Backend unit |
| PK-AUTH-08 | Assertion has expired challenge | Reject; no session | Backend unit |
| PK-AUTH-09 | Assertion has wrong origin or RP ID | Reject; no session | Backend unit |
| PK-AUTH-10 | Assertion response is malformed/truncated | Return controlled client error; no panic or oversized allocation | HTTP + fuzz |
| PK-AUTH-11 | Same valid assertion submitted twice sequentially | First may succeed; replay cannot create a second session | Backend integration |
| PK-AUTH-12 | Same valid assertion submitted concurrently | At most one request consumes challenge and issues a session | Backend concurrency |
| PK-AUTH-13 | Account has been disabled after credential enrollment | Reject sign-in; no session | Backend integration |
| PK-AUTH-14 | Account's family/space access is revoked | Reject sign-in; no session | Backend integration |
| PK-AUTH-15 | Valid assertion originates from banned IP | Match existing password-login ban behavior; no session | Backend integration |
| PK-AUTH-16 | Auth endpoint rate limit exceeded | 429 or established generic limit response; no credential status leakage | Backend integration |
| PK-AUTH-17 | Successful passkey login response is written for web | Refresh token absent from JSON; cookie is HttpOnly, scoped, secure per TLS, and same-site per policy | HTTP integration |
| PK-AUTH-18 | Successful passkey login response is written for native origin | Preserve existing native refresh-token contract, if native passkey flow is supported; otherwise reject unsupported flow clearly | HTTP integration |
| PK-AUTH-19 | Refresh passkey-created session | Existing refresh rotation returns new session token and revokes prior token | Backend integration |
| PK-AUTH-20 | Logout passkey-created session | Refresh cookie clears and persisted session revokes | Backend integration |
| PK-AUTH-21 | Account has no password and uses passkey | Login succeeds without reading/verifying an empty password hash | Backend integration |
| PK-AUTH-22 | Client attempts password login for passkey-only account | Generic invalid credentials, no panic and no account disclosure | Backend integration |
| PK-AUTH-23 | Discoverable/usernameless mode is selected | Credential lookup remains unique and space-scoped without relying on unverified user handle | Backend unit + integration |
| PK-AUTH-24 | Username-first mode is selected instead | Account lookup response does not disclose whether a username has passkeys | Backend HTTP + E2E |

### 4. Guest invite acceptance cases

| ID | Setup and action | Expected result | Layer |
|---|---|---|---|
| INV-PW-01 | Open valid invite | Correct space, role, expiry, and remaining uses are shown | Component + E2E |
| INV-PW-02 | Choose password method | Password field is required and enforces minimum length | Component |
| INV-PW-03 | Submit valid password and identity fields | Account is created in invited space, invite use increments once, and normal session is issued | Backend integration + E2E |
| INV-PW-04 | Submit password below minimum | Client blocks submission and server independently rejects bypass | Component + HTTP |
| INV-PW-05 | Submit duplicate nickname/username | Conflict shown; invite remains usable | Backend integration + E2E |
| INV-PW-06 | Invite expired before form submit | No user/session created; useful unavailable message shown | Backend integration + E2E |
| INV-PW-07 | Invite revoked before form submit | No user/session created; token details not leaked | Backend integration |
| INV-PW-08 | Invite use count exhausted before submit | No user/session created; response is stable | Backend integration |
| INV-PW-09 | Invite belongs to another space than active browser context | Resolve invite's intended server safely or reject; never join active wrong space | Component + integration |
| INV-PW-10 | Database insert fails while accepting invite | User, invite counter, membership, session all roll back atomically | Backend integration |
| INV-PW-11 | Two requests accept final invite use concurrently | At most configured max-use count commits | Backend concurrency |
| INV-PW-12 | Double-click submit in UI | Only one request is sent while pending | Component |
| INV-PW-13 | API rejects after response delay | Form returns to usable state; no false success navigation | Component |
| INV-PK-01 | Open valid invite and choose passkey | Password field disappears/is not required; registration ceremony starts | Component |
| INV-PK-02 | Complete passkey invite registration successfully | Passkey-only account, membership, role/defaults, invite consumption, and session commit together | Backend integration + E2E |
| INV-PK-03 | Cancel platform prompt | No account/invite consumption; return to method selection | Component + integration |
| INV-PK-04 | Browser lacks WebAuthn/secure context | Passkey option disabled with reason; password path remains available | Component + E2E |
| INV-PK-05 | Invite expires after options issued but before completion | Completion rejected; no partial account or session | Backend integration |
| INV-PK-06 | Invite revoked after options issued | Completion rejected; no partial account or session | Backend integration |
| INV-PK-07 | Final invite use consumed by another request before passkey completion | Completion rejected atomically; no account/session | Backend concurrency |
| INV-PK-08 | Registration response has wrong challenge/origin/RP ID | Reject; no account, membership, invite consumption, or session | Backend unit + integration |
| INV-PK-09 | Registration response is replayed | At most one account and one session are created | Backend concurrency |
| INV-PK-10 | Two invite ceremonies use swapped challenge/token | Reject cross-binding; neither invite is consumed by the wrong ceremony | Backend integration |
| INV-PK-11 | Credential ID collides with existing credential | Reject without account or invite side effects | Backend integration |
| INV-PK-12 | Transaction fails after credential verification | Roll back credential, user, membership, invite counter, and session | Backend integration |
| INV-PK-13 | New passkey-only user later signs in | Passkey login locates created account in the correct space | Backend integration + E2E |
| INV-PK-14 | User chooses password after cancelling passkey | Password registration remains available for same still-valid invite | Component + E2E |
| INV-UX-01 | Inspect invite form method choices | Password/passkey offered; QR method never rendered | Component |
| INV-UX-02 | Enter display name and nickname | Both map to intended profile fields, without unexpected silent substitution | Component + HTTP |

### 5. QR browser authorization cases

| ID | Setup and action | Expected result | Layer |
|---|---|---|---|
| QR-REQ-01 | Browser requests QR login in selected space | Pending request and expiry are created for that space | Backend integration |
| QR-REQ-02 | Generate many requests with deterministic injected RNG | No request identifier collision in deterministic fixture; production source uses cryptographic randomness | Backend unit |
| QR-REQ-03 | Inspect QR payload | Contains only opaque pending request locator/deep link; no access/refresh token or user PII | Backend unit + component |
| QR-REQ-04 | Pending request TTL reaches exact expiration boundary | Request is expired at the documented boundary | Backend unit with fake clock |
| QR-REQ-05 | Create request then poll pending state | Browser sees waiting state only for its request | HTTP integration |
| QR-REQ-06 | Poll unknown request locator | Generic not-found/expired response; no data leakage | HTTP integration |
| QR-REQ-07 | Poll another browser's locator without possession | Cannot enumerate or read request state | Backend integration |
| QR-REQ-08 | Authenticated phone scans request | Phone receives confirmation details, but scan alone does not approve | Backend + app integration |
| QR-REQ-09 | Confirmation screen displays target context | Shows selected space and available browser/device/IP context before approval | Native component/E2E |
| QR-REQ-10 | User rejects on phone | Request becomes terminal denied; browser receives denied state and no session | Backend integration + E2E |
| QR-REQ-11 | User approves on phone | Request transitions to approved and browser receives its own fresh session | Backend integration + E2E |
| QR-REQ-12 | Compare phone tokens before/after approval | Phone access/refresh credentials are unchanged and absent from browser response | Backend integration |
| QR-REQ-13 | Refresh token rows after approval | Browser has a distinct session row/device metadata; phone row remains independent | Backend integration |
| QR-REQ-14 | Phone is signed out before approval | Reject approval; browser stays unauthenticated | Backend integration |
| QR-REQ-15 | Phone session is revoked before approval | Reject approval; browser stays unauthenticated | Backend integration |
| QR-REQ-16 | Phone account disabled before approval | Reject approval; browser stays unauthenticated | Backend integration |
| QR-REQ-17 | Approval actor belongs to another space | Reject; no cross-space session | Backend integration |
| QR-REQ-18 | Client IP is banned by space policy | Match existing auth policy; no session issued | Backend integration |
| QR-REQ-19 | Approve expired request | Reject; no session | Backend unit + integration |
| QR-REQ-20 | Approve already-denied or already-approved request | Reject second transition; never issue another session | Backend integration |
| QR-REQ-21 | Two authenticated devices approve simultaneously | At most one successful state transition/session issuance | Backend concurrency |
| QR-REQ-22 | Duplicate approve request replays after successful first request | No second session; response is non-sensitive terminal state | Backend integration |
| QR-REQ-23 | Browser poll and phone approval race at expiry | Exactly one terminal result wins under atomic persistence rule | Backend concurrency |
| QR-REQ-24 | Status polling repeatedly | Rate limited; bounded backend work; authorized request still progresses | Backend integration |
| QR-REQ-25 | Request creation flood | Per-IP and/or per-space limits apply; no unbounded pending state | Backend integration |
| QR-REQ-26 | Short-code guessing | Attempt limit and code lifetime prevent practical enumeration; lockout is scoped safely | Backend integration + property |
| QR-REQ-27 | Short-code parser sees whitespace/unicode/separators | Only documented canonicalization accepted; invalid input rejected | Unit + fuzz |
| QR-REQ-28 | Multi-instance deployment receives create/poll/approve on different replicas | Shared persistence/cache preserves request state and one-time behavior | Backend integration |
| QR-REQ-29 | Redis/database unavailable during create/poll/approve | Controlled failure; no in-memory-only success that disappears across replicas | Backend integration |
| QR-REQ-30 | User closes or cancels QR screen | Client stops polling and best-effort cancels request; server expiry remains final safety net | Component + E2E |
| QR-REQ-31 | QR expires while page is open | UI announces expiry and offers regenerate; old locator cannot approve | Component + E2E |
| QR-REQ-32 | Browser loses network then reconnects before expiry | Poll resumes for same locator without creating duplicate request/session | Component |
| QR-REQ-33 | Browser camera permission denied/unavailable | Manual short-code path or normal login methods remain usable | Component + browser matrix |
| QR-REQ-34 | HTTP self-hosted browser requests QR | App-scannable QR or short-code flow behaves per supported design; passkey restriction does not disable QR | E2E |
| QR-REQ-35 | Phone scanner opens link on wrong configured server | Server/space mismatch is detected and shown; no approval | Native + backend integration |
| QR-REQ-36 | QR payload copied into logs/analytics/error telemetry | Secret locator is redacted or telemetry excludes query/payload | Unit/logging test + review |

### 6. Persistence, session, migration, and isolation cases

| ID | Setup and action | Expected result | Layer |
|---|---|---|---|
| DATA-01 | Apply migration to populated legacy schema | Existing user IDs, password hashes, sessions, memberships and invites are preserved | Migration integration |
| DATA-02 | Apply migration on empty schema | New credential/state schema is created and constraints are present | Migration integration |
| DATA-03 | Apply migration twice through migration runner | Runner reports clean current state; no duplicate objects or data loss | Migration integration |
| DATA-04 | Roll forward with legacy password hashes | Password logins still verify without rehash corruption | Backend integration |
| DATA-05 | Query passkey-only account | Password absence is represented safely and does not bypass authentication checks | Repository integration |
| DATA-06 | Insert same credential identifier concurrently | Database uniqueness prevents duplicates | Repository concurrency |
| DATA-07 | Insert credential with missing user/space reference | Foreign key/validation rejects orphan | Repository integration |
| DATA-08 | Query by credential from another space | No cross-space resolution | Repository integration |
| DATA-09 | Create auth session through password, passkey, invite, QR | Each uses same session validation and rotation contract | Backend integration |
| DATA-10 | Refresh each kind of session | Old refresh token becomes invalid; new one works | Backend integration |
| DATA-11 | Logout each kind of session | Session revokes and cookie clears | Backend integration |
| DATA-12 | Change password after password or passkey login | Existing password-change policy works and revocation behavior remains consistent | Backend integration |
| DATA-13 | Revoke phone's session after QR created but before approval | Approval fails | Backend integration |
| DATA-14 | Revoke phone's session after QR approval | Browser session behavior follows explicit independent-session policy | Backend integration |
| DATA-15 | Deactivate user with active credentials and sessions | All auth methods reject new login; existing session enforcement matches policy | Backend integration |
| DATA-16 | Cookie response under HTTPS reverse proxy | Secure, HttpOnly, SameSite and cluster path attributes follow current deployment contract | HTTP integration |
| DATA-17 | Cookie response under local HTTP development | Secure-cookie behavior does not make supported local password login unusable | HTTP integration |
| DATA-18 | Browser receives auth response | Refresh token never appears in JSON, URL, DOM, localStorage, or logs | HTTP/component/security test |
| DATA-19 | Space A and B use same username | Credentials resolve only inside selected space; no accidental identity merge | Backend integration + E2E |
| DATA-20 | Space A and B use same authenticator account/passkey manager | Server-side credential identifiers remain RP/space scoped | Backend integration + browser matrix |

### 7. Property-based and fuzz cases

These are explicit properties, not a mandate to generate enormous random runs in every CI job. Keep a small deterministic seed corpus in normal CI and run longer fuzz campaigns separately.

| ID | Property/input space | Required assertion |
|---|---|---|
| PROP-01 | Random challenge byte strings, including empty and overlong | Generator always emits protocol-valid challenge length/encoding or returns an error; never emits a weak fallback |
| PROP-02 | Challenge tuple with one field mutated among challenge/user/space/purpose/origin/RP ID/expiry | Validation succeeds only for the exact expected tuple and valid time window |
| PROP-03 | All legal QR state transition sequences | State is monotonic; terminal states never become pending or another terminal state |
| PROP-04 | Arbitrary duplicate approve/reject/poll interleavings | At most one approval commit and one resulting browser session |
| PROP-05 | Arbitrary canonical short-code strings and near misses | Parser accepts only documented alphabet/length and canonicalization is deterministic |
| PROP-06 | Unicode, invalid UTF-8 byte sequences, separators, control chars, and huge QR inputs | Parser returns controlled error; no panic, unbounded allocation, or normalization collision |
| PROP-07 | Arbitrary invite/passkey completion interleavings | Invalid/stale artifacts never create user/session or consume invite |
| PROP-08 | Arbitrary credential rows with duplicate IDs, revoked flags, and mixed spaces | Lookup returns only one active credential from expected space or no match |
| PROP-09 | Arbitrary malformed WebAuthn JSON/base64 fields | Decoder fails safely and does not panic or allocate without bound |
| PROP-10 | Arbitrary token/secret values in response/log serialization | No refresh token, challenge secret, or QR bearer locator is serialized to public response/log fields |
| FUZZ-01 | Fuzz QR request ID and short-code HTTP payload decoder | No panic; bounded response and body handling |
| FUZZ-02 | Fuzz registration/authentication credential response JSON decoder | No panic, controlled validation errors, bounded allocations |
| FUZZ-03 | Fuzz invite acceptance payload normalization | No panic; invalid values rejected; existing valid values remain stable |
| FUZZ-04 | Fuzz QR state command inputs (status/action/actor/space) | Invalid commands cannot mutate persistent state |

### 8. HTTP contract and error cases

For each new endpoint, test method/path, content type, malformed JSON, empty body, oversized body, unknown fields policy, missing fields, wrong method, unauthenticated access, CSRF/origin validation, rate limit, and response shape. Keep the exact final route names in the API contract before implementation; these tests must assert behavior and secrecy, not freeze accidental internal route naming prematurely.

| ID | Request condition | Expected result |
|---|---|---|
| HTTP-01 | Wrong HTTP method for ceremony endpoint | 405 and no state mutation |
| HTTP-02 | Invalid JSON | 400/422 according to existing handler convention; no state mutation |
| HTTP-03 | Request exceeds configured body limit | Controlled 413; no unbounded read |
| HTTP-04 | Missing required challenge/request ID | 422; no lookup that leaks unrelated state |
| HTTP-05 | Unknown JSON fields | Follow documented strict/permissive policy consistently |
| HTTP-06 | Cross-origin credentialed mutation without allowed Origin | Reject before ceremony state changes |
| HTTP-07 | Allowed configured origin | Mutation proceeds subject to authentication and ceremony validation |
| HTTP-08 | Missing CSRF/origin proof for phone QR approval | Reject; browser cannot forge approval via ambient cookie alone |
| HTTP-09 | Error after secret locator provided | Response does not echo full locator/challenge/token |
| HTTP-10 | Rate limit backend unavailable | Fail closed for sensitive creation/guessing operations; return generic server error |
| HTTP-11 | Credential verification library returns internal error | Public response remains generic; detailed error only in redacted server log |
| HTTP-12 | Verify/cancel request repeats after terminal result | Stable terminal response; no duplicate side effect |

### 9. End-to-end journeys

| ID | Journey | Required assertions |
|---|---|---|
| E2E-01 | Existing member uses username/password on desktop | Login succeeds; refresh cookie is HttpOnly; chats load |
| E2E-02 | Member registers passkey in settings then signs out/in with passkey | Credential persists; passkey login works; normal logout works |
| E2E-03 | Invitee joins using password | Correct name/space/role; invite consumed once; next password login succeeds |
| E2E-04 | Invitee joins using passkey | Passkey-only account exists; no password required; passkey login succeeds |
| E2E-05 | Member has desktop login page and already-authenticated phone | Phone scans, confirms correct browser/space, desktop lands in chats with independent session |
| E2E-06 | Phone rejects desktop QR request | Desktop displays rejection and remains on signed-out page |
| E2E-07 | Desktop QR expires | Desktop sees expiry and can regenerate; old QR cannot later authenticate |
| E2E-08 | User has no phone session | Password and passkey remain available; QR cannot falsely complete |
| E2E-09 | Self-hosted HTTP server | Password and supported QR flow work; passkey unavailable explanation shown |
| E2E-10 | Self-hosted HTTPS server | Passkey enrollment and authentication work for configured domain |
| E2E-11 | Two spaces opened in separate tabs | Passkey/QR/invite state in one tab cannot sign into or consume state in the other |
| E2E-12 | Browser loses connection during QR wait | UI recovers before request expiry without duplicate session |

### 10. Browser and operational coverage

Run automated WebAuthn flows using virtual authenticators where the browser automation API supports them. Keep a manual smoke matrix for current supported Safari/iOS, Chrome/Android, Chrome/desktop, and Firefox/desktop because platform authenticators, synced passkeys, camera permissions, and conditional UI differ. Record browser version, OS, HTTPS/local-host setup, and authenticator type with each manual result.

For QR cross-device E2E, use two browser contexts and an app/scanner test harness that exercises the same authenticated approval API; separately perform one real phone-to-desktop smoke test. Test application restart and two backend replicas to prove pending requests are not process-local. Do not log raw QR payloads or use real accounts/secrets in CI.
