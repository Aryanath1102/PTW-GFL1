import { build } from 'esbuild';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

// Isolated audit harness: no network, DOM, or real SAP writes.
const result = await build({
  stdin: { contents: `export { SapAuthProvider } from './src/core/auth/sapAuthContext'; export { adminApi, authApi, odataClient } from './src/core/api';`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'transform',
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'audit-react', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'audit' }));
    b.onLoad({ filter: /.*/, namespace: 'audit' }, () => ({ contents: `
      export const useState = v => [v, next => globalThis.auditStates.push(next)];
      export const useEffect = () => {};
      export const useRef = v => ({ current: v });
      export const createContext = () => ({ Provider: 'provider' });
      export const useContext = () => {};
      export const createElement = (type, props) => props;
      export default { useState, useEffect, useRef, createContext, useContext, createElement };
    ` }));
  } }],
});
const mod = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
const { SapAuthProvider, authApi, adminApi, odataClient } = mod.exports;
globalThis.auditStates = [];
globalThis.window = { location: { search: '' } };
const storage = () => { const data = new Map(); return { setItem: (k,v) => data.set(k,v), getItem: k => data.get(k), removeItem: k => data.delete(k) }; };
globalThis.sessionStorage = storage();
globalThis.localStorage = storage();
const reject = async () => { throw new Error('Simulated SAP rejection'); };
// Block every real request even if a code path unexpectedly reaches the adapter.
odataClient.instance.defaults.adapter = reject;
authApi.fetchUserInfo = reject;
authApi.fetchUserRoles = reject;
adminApi.getPFCGUsers = reject;
const provider = SapAuthProvider({ children: null });
const context = provider.value || provider.props.value;
assert.equal(await context.login({ userId: 'VERTIF-V', password: 'invalid-audit-password' }), true);
assert.ok(JSON.parse(sessionStorage.getItem('gfl_ptw_user_session_v2')).user.roles.includes('PTW_ADMIN'));
console.log('CONFIRMED: failed SAP checks still produce authenticated administrator session.');
authApi.fetchUserInfo = async () => [];
authApi.fetchUserRoles = async () => [];
adminApi.getPFCGUsers = async () => [{ SAPUser: 'AUDIT_USER', PFCGRole: 'Z_MOBILE_PI_SHEET' }];
assert.equal(await context.login({ userId: 'AUDIT_USER' }), true);
assert.ok(JSON.parse(sessionStorage.getItem('gfl_ptw_user_session_v2')).user.unlockedModules.includes('admin'));
console.log('CONFIRMED: generic enterprise role unlocks admin module.');
odataClient.post = reject;
odataClient.patch = reject;
odataClient.delete = reject;
odataClient.get = async () => ({ data: { value: [] } });
const originalWarn = console.warn;
console.warn = () => {};
try {
  const created = await adminApi.createUserRole({ SAP_USER: 'AUDIT_USER', PTW_ROLE: 'PTW_ADMIN', ACTIVE: true });
  assert.equal(created.ACTIVE, true);
  assert.equal((await adminApi.getUserRoles({ user: 'AUDIT_USER', activeOnly: true })).length, 1);
  console.log('CONFIRMED: rejected role creation becomes active local authorization; empty SAP result preserves it.');
  assert.equal((await adminApi.updateUserRoleStatus('AUDIT_USER', 'PTW_ADMIN', false)).ACTIVE, false);
  assert.equal(await adminApi.deleteUserRole('AUDIT_USER', 'PTW_ADMIN'), true);
  console.log('CONFIRMED: rejected role deactivation and deletion report success.');
} finally { console.warn = originalWarn; }
