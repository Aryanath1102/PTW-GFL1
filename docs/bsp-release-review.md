# BSP test upload review — 29 October 2026

Status: package prepared for controlled SAP development-system testing. No BSP upload or live SAP authorization/session test was performed. This is a frontend source and generated-artifact review, not an ABAP security certification.

## Verified locally

- TypeScript and Vite production build passed (Vite 6.4.5).
- 143 application tests passed, including login identity, ACTIVE=X, role failures, rejection stages, missing tester identity, checklist failure, and storage cleanup.
- 4 generated BSP artifact tests passed: nested relative assets, ASCII-safe scripts/styles, embedded local icon font, binary upload rules, and excluded source/config artifacts.
- Final npm audit: zero known vulnerabilities across production and development dependencies. Patched follow-redirects, source-map-js, postcss-selector-parser, and Vite/esbuild dependencies.
- Generated JavaScript does not contain VERTIF-V, the development SAP hostname, initial admin seed, or local role-store fallback. No source maps, environment files, private keys, or TypeScript source are included in dist.
- Logo and icon assets are local. Production OData configuration must use a same-system /sap/ path. Localhost proxy settings do not become BSP server settings.

## Component review and changes

| Area | Result |
| --- | --- |
| Login / launchpad / module access | SAP startup verifies identity, userinfo membership gates entry, matching UserRole records with ACTIVE exactly X unlock modules. No default administrator or PFCG-to-admin bypass. Production uses SAP session cookies. |
| Admin role maintenance | Removed offline administrator seed and false-success create/update/delete paths. SAP failures propagate. ACTIVE writes X or empty. Composite role keys escape apostrophes. |
| Permit creation | Shared recent-permit cache disabled in production. Initial config/checklist seed paths are development-only, including direct UI references. Missing required live checklist blocks submission. Draft keys include SAP client and user. |
| Approver / accepter / area operator | Removed shared offline worklist fallback. Partial/failed detail loading blocks accepter/area actions. Required gas and approval-history failures now propagate when loading the permit dossier. Approval-history authorization failures do not retry as empty workflow. Signatory uses signed-in user. |
| Permit display | Accepter rejection retains earlier completed approvals and shows rejection remarks. No editable approval signatory or default VERTIF-V signer. |
| Gas tests | Missing tester identity fails before save. No hard-coded test signer. Shared recent-permit lookup is development-only. |
| Isolation | Local isolation-to-permit link fallback and recent-permit merge disabled in production. Live SAP must persist PermitNo. Existing workflow confirmation logic retained. |
| Reports | Shared recent-created permit merge disabled in production. Report contents must come from live SAP. |
| Safety map | Uses static plant drawing/master coordinates; previously simulated permit overlays are not used. It must not be represented as live incident/permit telemetry. |
| Session storage | Logout clears PTW drafts and legacy shared records plus in-memory config/checklist caches. Storage access failures are tolerated. Browser drafts remain client-side data, not an authorization source. |
| Holder / permit details / workflow API | Reviewed alongside API callers; backend operations and authorization must be confirmed on SAP. No live behavior certification. |

## Remaining hard-coded/reference behavior

- Default plant 1002 and site-specific procedure, PPE/hazard, JHA, status/role, and map catalogs remain. These are business configuration/reference content, not identity grants. Confirm they match the target SAP client/site before functional sign-off.
- Development-only seed data remains available for localhost work. Do not upload source, node_modules, .env files, or the development proxy configuration.
- Some non-authoritative read failures still produce empty panels (for example optional audit enrichment). An empty panel is not proof that no SAP records exist.
- Role-key replacement is a create-then-delete operation, not a transaction. If deletion fails after creation, reconcile both role assignments in SAP before retrying.
- Workflow APIs retaining wildcard ETags require backend concurrency/state checks. Client UI gating does not establish server-side authorization.
- The icon font makes CSS about 5.53 MB uncompressed; JavaScript is about 1.59 MB. The build warns about chunk size. Verify first load over the actual network and SAP MIME/compression configuration.

## SAP test gate before production approval

1. Upload the CONTENTS of dist to the test BSP/UI5 repository using the existing repository upload process. Preserve assets/, licenses/, GFL-Logo.webp, index.html, and .Ui5RepositoryBinaryFiles. Do not add a dist/ parent level. The ZIP contains the same root layout; extract it if the upload report expects a folder.
2. Launch from the Fiori tile in a new tab, under the real nested BSP path. Check all JS/CSS/logo/font requests, MIME types, text encoding, and absence of localhost or cross-system requests. Confirm the BSP startup/client configuration behaves as expected.
3. Confirm /sap/bc/ui2/start_up returns the current SAP user. A mismatched userinfo user must deny entry. Test one active role, multiple roles, no roles, empty ACTIVE, and ACTIVE values other than X. Only X should grant the corresponding module.
4. With a non-admin user, directly call role mutation and workflow endpoints. SAP must reject unauthorized operations regardless of hidden buttons, client-supplied user IDs, or modified JavaScript. Verify record/plant scope and that audit signatories are derived/validated against the server session.
5. Verify APPR1 and APPR2 completed, then ACCP rejected: approver complete, accepter red, rejection remarks shown, later stage blocked. Repeat with approver/area rejection and unavailable history.
6. Verify SAP config and mandatory checklists exist for the target client. Simulate service denial/expiry and confirm no demo data grants access or permits workflow submission.
7. Test CSRF rejection/refresh, expired sessions, simultaneous tabs, revocation of roles during an open session, logout, and browser back/reload. Local idle timeout is not proof of alignment with Fiori/ICF policy; confirm server-session termination and SSO re-entry behavior with Basis.
8. Confirm transport/MIME registration and security headers/cookie policy with Basis. Those server settings are outside this repository.

Evidence: tmp/bsp-tests.log, tmp/bsp-assets.log, tmp/bsp-build.log, tmp/bsp-full-audit.json. Package SHA-256 and per-file hashes accompany the upload ZIP.

## Quick Edit / Resubmit follow-up

Fixed the dialog being nested inside the Approvals tab: the header action now renders its dialog from every detail tab. Fixed the PATCH/action sequence to use the new ETag from the PATCH response, or fetch the current header version after a 204 response. Missing updated versions block the action. A rejected action after a successful header save now reports that partial outcome explicitly. Direct resubmit skips PATCH. Added five regression tests; 148 application tests and four BSP artifact tests pass, and the production build succeeds. Use the newer ptw-bsp-resubmit-fix ZIP instead of the previous test-upload ZIP. Live SAP action execution has not been verified.

## Issuer role replacement

Replaced former requester permissions with PTW_ISSU across module access rules. Removed the requester role from role types, admin metadata, and statistics. PTW_ISSU with ACTIVE=X now grants permit creation and the previously requester-enabled modules; the retired role grants no modules. No SAP table records were changed. Assign PTW_ISSU in SAP UserRole for affected users. All 150 application tests and four BSP artifact checks pass; the compiled production bundle contains no retired requester role. Use the latest ptw-bsp-issuer-role package, which also includes the Quick Edit / Resubmit fixes.

## Three.js plant-map redesign — 3 November 2026

Added a lazy-loaded Three.js plant view with extruded district footprints derived from existing drawing polygons, mapped avenues/streets, district labels, selection highlighting, animated location beacon, eased camera focus, orbit/pan/zoom, whole-plant fit, and top view. Directory search, category tabs and location details are integrated with both 3D and 2D. Selecting a district or road uses its existing drawing center or segment midpoint. No synthetic permit or incident data was added; extrusion heights are illustrative and labeled accordingly. Reduced-motion settings suppress animated camera flights and beacon motion. A WebGL creation/context failure switches to the existing 2D map. GPU resources, textures, listeners and animation frames are cleaned up on unmount.

Validation: 153 tests pass, including drawing-to-world coordinates, road focus midpoints, and preservation of every district mesh footprint. Production build and four BSP artifact tests pass. The actual local browser displayed the new 3D view with a selected district and beacon; automated click checks timed out, so full browser interaction verification remains incomplete. Three.js is a separate lazy chunk (~599 kB raw / 152 kB gzip). Installation reported zero known dependency vulnerabilities. Package uses only local BSP assets; no CDN or external map service. Latest ZIP: ptw-bsp-3d-plant-map-20261103-*.zip. Upload the ZIP contents at the BSP application root. No SAP upload was performed.

## D1376 drawing integration — 4 November 2026

The default map now uses the supplied GFL-COM-CIVL-LYOD-D1376 drawing, preserving its layout and southern extension. Added 87 searchable location points anchored to reviewed PDF labels, a 3D perspective drawing and 2D plan, and an Original PDF link. Existing safety-district geometry remains a separately labeled reference; no old district coordinates or owners are assigned to the new drawing. PNG and PDF upload classifications are included. Details and coordinate provenance: docs/plant-drawing-d1376.md.

Validation: 156 application tests, TypeScript check, Vite production build, and five BSP artifact tests passed. Source PDF hash and packaged asset integrity verified. Rendered source and southern marker alignment were visually inspected. Browser automation timed out; the new runtime interactions and SAP upload still need live verification. Latest package: ptw-bsp-d1376-map-20261104-*.zip. This supersedes earlier upload ZIPs. Upload only the ZIP contents at the BSP application root, preserving maps/ and assets/.
