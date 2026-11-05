import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  // Load environment variables based on current mode
  const env = loadEnv(mode, process.cwd(), '');

  if (command === 'build' && env.VITE_ODATA_BASE_URL && (!env.VITE_ODATA_BASE_URL.startsWith('/sap/') || env.VITE_ODATA_BASE_URL.startsWith('//'))) {
    throw new Error('BSP builds require a same-system /sap/ OData path, not a hostname or localhost URL.');
  }
  const sapTarget = env.VITE_SAP_TARGET || 'https://vhgfldevci.sap.gfl.co.in:44300';
  const sapClient = env.VITE_SAP_CLIENT || undefined;
  const proxyHeaders = sapClient ? { 'sap-client': sapClient } : undefined;

  return {
    plugins: [react()],
    // CRITICAL FOR SAP BSP:
    // Forces all asset references (<script src="./assets/...">) to be relative.
    // In SAP BSP, the app is served under /sap/bc/bsp/sap/<app_name>/
    base: './',

    // BSP MIME responses may declare a legacy code page. Escaping Unicode
    // preserves UI punctuation and symbols regardless of that response charset.
    esbuild: {
      charset: 'ascii'
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@core': path.resolve(__dirname, './src/core'),
        '@shared': path.resolve(__dirname, './src/shared'),
        '@features': path.resolve(__dirname, './src/features')
      }
    },

    server: {
      port: 5173,
      strictPort: true,
      open: true,
      proxy: {
        // Proxy SAP OData V4 Services
        '/sap/opu/odata4': {
          target: sapTarget,
          changeOrigin: true,
          cookieDomainRewrite: { '*': '' },
          cookiePathRewrite: { '*': '/' },
          secure: false,
          ...(proxyHeaders ? { headers: proxyHeaders } : {}),
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              const sc = proxyRes.headers['set-cookie'];
              if (sc && Array.isArray(sc)) {
                proxyRes.headers['set-cookie'] = sc.map((c) =>
                  c.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=\w+/gi, '; SameSite=Lax')
                );
              }
            });
            proxy.on('error', (err, _req, res) => {
              if (res && 'writeHead' in res && !(res as any).headersSent) {
                (res as any).writeHead(503, { 'Content-Type': 'application/json' });
                (res as any).end(JSON.stringify({
                  error: 'SAP_GATEWAY_OFFLINE',
                  message: `Cannot connect to SAP Gateway (${sapTarget}): ${err.message}. Please verify VPN connection.`
                }));
              }
            });
          }
        },
        // Proxy SAP User Info and Fiori Launchpad Services
        '/sap/bc/ui2': {
          target: sapTarget,
          changeOrigin: true,
          cookieDomainRewrite: { '*': '' },
          cookiePathRewrite: { '*': '/' },
          secure: false,
          ...(proxyHeaders ? { headers: proxyHeaders } : {}),
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              const sc = proxyRes.headers['set-cookie'];
              if (sc && Array.isArray(sc)) {
                proxyRes.headers['set-cookie'] = sc.map((c) =>
                  c.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=\w+/gi, '; SameSite=Lax')
                );
              }
            });
            proxy.on('error', (err, _req, res) => {
              if (res && 'writeHead' in res && !(res as any).headersSent) {
                (res as any).writeHead(503, { 'Content-Type': 'application/json' });
                (res as any).end(JSON.stringify({
                  error: 'SAP_GATEWAY_OFFLINE',
                  message: `Cannot connect to SAP Gateway (${sapTarget}): ${err.message}. Please verify VPN connection.`
                }));
              }
            });
          }
        },
        '/sap/public': {
          target: sapTarget,
          changeOrigin: true,
          secure: false,
          cookieDomainRewrite: { '*': '' },
          cookiePathRewrite: { '*': '/' }
        },
        // Proxy generic SAP ICF services (MIME repository, authentication)
        '/sap/bc': {
          target: sapTarget,
          changeOrigin: true,
          cookieDomainRewrite: { '*': '' },
          cookiePathRewrite: { '*': '/' },
          secure: false,
          ...(proxyHeaders ? { headers: proxyHeaders } : {}),
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              const sc = proxyRes.headers['set-cookie'];
              if (sc && Array.isArray(sc)) {
                proxyRes.headers['set-cookie'] = sc.map((c) =>
                  c.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=\w+/gi, '; SameSite=Lax')
                );
              }
            });
            proxy.on('error', (err, _req, res) => {
              if (res && 'writeHead' in res && !(res as any).headersSent) {
                (res as any).writeHead(503, { 'Content-Type': 'application/json' });
                (res as any).end(JSON.stringify({
                  error: 'SAP_GATEWAY_OFFLINE',
                  message: `Cannot connect to SAP Gateway (${sapTarget}): ${err.message}. Please verify VPN connection.`
                }));
              }
            });
          }
        }
      }
    },

    build: {
      outDir: 'dist',
      // Keep the icon font inside CSS: BSP uploaders can skip or corrupt WOFF2 MIME files.
      assetsInlineLimit: (filePath) =>
        filePath.replace(/\\/g, '/').endsWith('/material-symbols-outlined.woff2') ? true : undefined,
      sourcemap: mode === 'development',
      rollupOptions: {
        output: {
          // Keep chunk filenames clean and predictable for SAP MIME repository
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    }
  };
});
