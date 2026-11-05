# Login and access audit

Date: 29 October 2026

Implementation follow-up: the first login/module milestone is now documented in `docs/login-access-development.md`. Findings below describe the original audit baseline. The historical harness in `tmp/login-access-audit.mjs` intentionally reproduces the old defects and is superseded by `tests/login-access.test.mjs` for regression testing. Admin-write, cache-isolation, and full session-lifecycle remediation remain pending.

## Result and scope

The frontend authentication and authorization flow has release-blocking defects. This audit reviewed login, session restoration, role evaluation, administration, logout, and cached permit access. No production source was changed and no live SAP mutations were made. SAP backend implementation and authorization configuration are not in this repository; unauthorized server-side writes have not been demonstrated.

## Findings

### 1. High — Failed authentication grants a hard-coded administrator session

Evidence: `src/core/auth/sapAuthContext.tsx:537` and `:580`.

All three profile/role lookups suppress errors into empty arrays. When the supplied account is `VERTIF-V`, the empty result adds `PTW_ADMIN`, then persists a user and sets authentication to true. This works even when every SAP lookup rejects and an invalid password was supplied. Passwordless URL/session restoration can reach the same path. The isolated harness confirmed this behavior.

Remove the account-specific fallback and require successful server authentication before resolving permissions. Failed authentication, unavailable identity services, and empty permissions must deny access. Do not seed an administrator in `admin.api.ts` either.

### 2. High — Generic enterprise roles grant administrator navigation

Evidence: `src/core/auth/sapAuthContext.tsx:275` and `:730`; `src/features/admin/AdminWorkspace.tsx:25`.

`Z_MOBILE_PI_SHEET` and `YSM-XX-PFCG-PTW-APP-XXXXXXXXXX` return every module, including admin, despite the registry declaring admin-only roles. `hasRole` also treats these enterprise roles as satisfying every requested role. AdminWorkspace has no independent administrator guard. The harness confirmed admin is unlocked with only `Z_MOBILE_PI_SHEET`.

Limit broad application-login roles to explicitly intended navigation. Require a verified active PTW administrator permission for administration, and enforce this in SAP for every role-management request.

### 3. High — Rejected role changes are reported as successful

Evidence: `src/core/api/modules/admin.api.ts:210`, `:256`, and `:282`.

POST/PATCH/DELETE failures, including authorization rejection or loss of connectivity, are swallowed. Creation inserts an active local role; deactivation changes only local memory; deletion returns true regardless of SAP failure. An administrator can believe access was revoked while the server assignment remains active. The isolated harness confirmed all three failure paths return success.

Propagate failures and update local state only after SAP confirms success. Do not use simulated authorization changes as an offline fallback. Key-changing updates also need protection against partial create/delete failure.

### 4. High — Empty role responses retain old privileges

Evidence: `src/core/api/modules/admin.api.ts:132` and `:155`; `src/shared/hooks/useUserPtwRoles.ts:94`.

A successful empty UserRole collection returns the previous local store instead of an empty result. Thus deleting a user's last active role can leave the old assignment effective in the browser. Even when the live result is empty, the role hook restores login-time roles. Its error path also retains prior live roles. Approval/acceptance/area-operator workspaces consume these results as permissions.

The harness confirmed an empty SAP response retains a locally cached active role. Treat successful empty results as authoritative. Deny functional actions while roles are unresolved or failed, and discard stale results on identity/client change.

### 5. High, backend-dependent — Requested identity is not bound to the authenticated SAP principal

Evidence: `src/core/auth/sapAuthContext.tsx:350`, `:531`, and `:727`; `src/core/api/modules/auth.api.ts:96`.

Passwordless login uses the supplied ID to query userinfo/UserRole and filter PFCGUsers. A URL can supply that ID, and switchUser also calls login without credentials. The login function never compares it with an independently authenticated current-user response. Reading another user's role record is not proof that the requester is that user. If SAP permits directory/role reads across accounts, a session authenticated as A can be presented as B in this app.

Use a server-authenticated current-user endpoint as the identity source. Treat URL/remembered IDs only as hints; reject mismatches. Verify SAP derives action actors from its session rather than trusting payload names. Exploitability against the actual SAP service remains unverified.

### 6. Medium — Permit caches cross user and SAP-client boundaries

Evidence: `src/features/approvals/PermitAcceptorWorkspace.tsx:196` and `:216`; equivalent area-operator cache at the same lines; logout at `src/core/auth/sapAuthContext.tsx:715`.

Permit lists persist in localStorage under a plant-only key. Logout does not clear them. A subsequent account or SAP client using the same browser can load the preceding account's records when its request fails; fallback is not limited to network outages. This can expose previously fetched permit information despite a current server denial.

Scope caches by authenticated identity, SAP client, and plant; clear protected cached data on logout and reject cache fallback after authentication/authorization failures.

## Verification

- TypeScript check (`npm run lint`): passed.
- Existing startup-cancellation, SAP-client, and admin-user-role tests: 16 passed.
- Isolated audit harness (`node tmp/login-access-audit.mjs`): confirmed findings 1–4 using production code with simulated SAP responses and a lightweight hook harness. This is not a browser end-to-end test.
- Existing admin tests include success expectations for offline local role changes. Passing them does not establish safe access control.

## Required backend follow-up

Using separate authorized test accounts, verify that SAP rejects cross-user identity substitution, non-admin role changes, out-of-scope permit access, and approvals above the user's assigned tier. Also verify revoked roles, expired sessions, and logout invalidate server access. Check that read filters do not substitute for server authorization. Frontend gates alone cannot establish those guarantees.

Fix the hard-coded login grant first, then remove authorization fallbacks and unrestricted administrator navigation. Add negative regression tests for rejected credentials, denied role writes, empty/revoked assignments, and account/client switching.
