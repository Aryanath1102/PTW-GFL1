# GitHub Pages frontend deployment

The Pages workflow builds `feature/dashboard/report-module` with `npm ci` and
`npm run test:bsp`, then publishes **only `dist/`**. The artifact checks also
verify that JavaScript and the logo resolve beneath `/PTW-GFL1/`.

In repository **Settings > Pages > Build and deployment**, set **Source** to
**GitHub Actions**. Allow `feature/dashboard/report-module` in the `github-pages`
environment's deployment branch rules if they restrict publishing.

Do not publish the source branch's root directory directly: its `index.html`
references `src/main.tsx`, which browsers cannot execute as production JavaScript.
Vite compiles that entry into `dist/assets/*.js` and copies `public/GFL-Logo.webp`
to `dist/GFL-Logo.webp`. Keep `base: './'` so these assets work under both the
GitHub Pages project path and SAP BSP paths.

This publishes the frontend only. Production login and API requests still use
same-origin `/sap/` services and an authenticated SAP/Fiori session. GitHub Pages
does not provide those services or Vite's development proxy. Use SAP BSP/Fiori
hosting for the connected application; Pages is not a replacement SAP backend.
