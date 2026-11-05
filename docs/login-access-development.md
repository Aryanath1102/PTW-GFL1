# PTW login development — BSP deployment and localhost testing

## Implemented milestone

The Fiori tile opens the BSP application in a new browser tab. PTW therefore verifies identity through `/sap/bc/ui2/start_up`, without depending on a parent launchpad shell or trusting a URL user ID.

1. Verify the current SAP session and obtain its user ID.
2. Read `userinfo` and require a matching `UserId` for app access.
3. Read filtered `UserRole`, recheck `SAP_USER`, and grant modules only from `ACTIVE: "X"` assignments.
4. Show “No modules assigned” when app access exists without recognized active module permissions.

There is no hard-coded administrator account, enterprise-role administrator bypass, or cached permission fallback in login or the operational role hook. Approval levels remain distinct. A generic `PTW_APPROVER` assignment does not grant all three approval levels; assign explicit tiers.

## Localhost

- Run `npm run dev` and open `http://localhost:5173`.
- Configure `VITE_SAP_TARGET` and, when needed, `VITE_SAP_CLIENT` in the existing local environment configuration. Do not put passwords in Vite environment variables.
- The Vite proxy forwards relative `/sap/...` requests to SAP. VPN/network access and functioning SAP startup/OData services are required.
- The development build retains manual SAP credentials to establish a real SAP identity through the proxy. The returned identity must match the entered account. There is no local mock-user bypass.
- A Fiori session cookie on the SAP hostname is not automatically a localhost cookie. Local development may therefore require signing in separately.

## BSP/UI5 deployment

- Run `npm run build` and use the existing BSP upload process for `dist/`.
- Production uses existing SAP session cookies, relative API paths, and relative build asset paths. No localhost proxy or development password form is included in the production login flow.
- If session verification fails, the screen asks the user to sign in through SAP Fiori and retry.
- Opening from Fiori in a new tab does not require an embedded UI5 shell in this React-based BSP application.

## Items requiring live confirmation

- Obtain the actual `/sap/bc/ui2/start_up` JSON response to verify the identity field. The current parser supports the existing `id`, `userId`, `userName`, nested user, and wrapped response shapes; unsupported responses deny entry.
- Verify same-system/client cookies through the new-tab Fiori launch and the DEV proxy.
- Permit creation and former requester module permissions use `PTW_ISSU`. The separate requester role has been removed.
- Confirm whether administrators should continue to receive all modules and approval tiers.

## Remaining planned stages

This milestone does not complete the entire audit remediation. Admin role writes still need their offline success fallbacks removed. Protected permit caches still need user/client scoping and logout cleanup. The existing local 30-minute inactivity prompt and ICF logout behavior need alignment with Basis-configured SAP/Fiori settings for the new-tab launch; this is not yet a verified shared Fiori logout integration.

SAP backend checks must enforce the same authorization on every protected operation. Automated local tests do not establish backend enforcement or prove live SAP connectivity.

## Automated checks

`npm test` includes isolated production-login tests for failed SAP identity, mismatched accounts, userinfo membership, inactive and cross-user roles, approval tiers, revoked assignments, DEV-only credentials, and login/logout races. `npm run build` checks TypeScript and produces the BSP assets. `node --test tests/bsp-assets.test.mjs` verifies the generated BSP assets after building.
