import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

// Exercise production login code with isolated SAP responses; never contact SAP.
async function harness(dev = false) {
  const result = await build({
    stdin: { contents: `export { SapAuthProvider } from './src/core/auth/sapAuthContext'; export { authApi, odataClient } from './src/core/api'; export { normalizePtwRoles } from './src/core/auth/ptwAccess';`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    define: { 'import.meta.env': JSON.stringify({ DEV: dev }) },
    plugins: [{ name: 'isolated-react', setup(b) {
      b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'test' }));
      b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
        export const useState = v => [v, () => {}];
        export const useEffect = () => {};
        export const useRef = v => ({ current: v });
        export const createContext = () => ({ Provider: 'provider' });
        export const useContext = () => {};
        export default { useState, useEffect, useRef, createContext, useContext };
      ` }));
    } }],
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  const api = mod.exports;
  globalThis.window = { location: { search: '?user=IMPOSTOR' } };
  const storage = () => { const data = new Map(); return { setItem: (k,v) => data.set(k,v), getItem: k => data.get(k), removeItem: k => data.delete(k) }; };
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();
  api.odataClient.instance.defaults.adapter = async () => { throw new Error('Unexpected network request'); };
  api.authApi.fetchStartupUser = async () => ({ id: 'VERTIF-V' });
  api.authApi.fetchUserInfo = async () => [{ UserId: 'VERTIF-V', Role: 'YSM-XX-PFCG-PTW-APP-XXXXXXXXXX' }];
  api.authApi.fetchUserRoles = async () => [];
  api.authApi.triggerIcfLogoff = async () => {};
  const context = api.SapAuthProvider({ children: null }).props.value;
  return { ...api, context, session: () => JSON.parse(sessionStorage.getItem('gfl_ptw_user_session_v2') || 'null') };
}

test('unverified SAP session cannot grant the former hard-coded administrator', async () => {
  const h = await harness();
  h.authApi.fetchStartupUser = async () => null;
  assert.equal(await h.context.login({ userId: 'VERTIF-V' }), false);
  assert.equal(h.session(), null);
});

test('startup identity takes precedence over URL hints and must match manual identity', async () => {
  const h = await harness();
  assert.equal(await h.context.login({ userId: 'IMPOSTOR' }), false);
  assert.equal(await h.context.login({ userId: '' }), true);
  assert.equal(h.session().user.id, 'VERTIF-V');
});

test('userinfo membership grants entry but enterprise roles grant no modules', async () => {
  const h = await harness();
  assert.equal(await h.context.login({ userId: '' }), true);
  assert.deepEqual(h.session().user.unlockedModules, []);
  h.authApi.fetchUserInfo = async () => [{ UserId: 'OTHER', Role: 'PTW_ADMIN' }];
  assert.equal(await h.context.login({ userId: '' }), false);
  assert.equal(h.session(), null);
});

test('only matching active UserRole assignments grant modules and approval tiers stay distinct', async () => {
  const h = await harness();
  h.authApi.fetchUserRoles = async () => [
    { SAP_USER: 'OTHER', PTW_ROLE: 'PTW_ADMIN', ACTIVE: 'X' },
    { SAP_USER: 'VERTIF-V', PTW_ROLE: 'PTW_ADMIN', ACTIVE: false },
    { SAP_USER: 'VERTIF-V', PTW_ROLE: 'PTW_GAS', ACTIVE: 'false' },
    { SAP_USER: 'VERTIF-V', PTW_ROLE: 'PTW_APPR1', ACTIVE: 'X' },
  ];
  assert.equal(await h.context.login({ userId: '' }), true);
  const user = h.session().user;
  assert.ok(user.unlockedModules.includes('permit-approver'));
  assert.ok(!user.unlockedModules.includes('admin'));
  assert.ok(!user.unlockedModules.includes('gas-tester'));
  assert.ok(!user.roles.includes('PTW_APPR2'));
  assert.ok(!h.normalizePtwRoles(['PTW_APPROVER']).includes('PTW_APPR3'));
});

test('active administrator grants admin; later empty or failed roles do not restore permissions', async () => {
  const h = await harness();
  h.authApi.fetchUserRoles = async () => [{ SAP_USER: 'VERTIF-V', PTW_ROLE: 'PTW_ADMIN', ACTIVE: 'X' }];
  assert.equal(await h.context.login({ userId: '' }), true);
  assert.ok(h.session().user.unlockedModules.includes('admin'));
  h.authApi.fetchUserRoles = async () => [];
  assert.equal(await h.context.login({ userId: '' }), true);
  assert.deepEqual(h.session().user.unlockedModules, []);
  h.authApi.fetchUserRoles = async () => { throw new Error('Forbidden'); };
  assert.equal(await h.context.login({ userId: '' }), false);
  assert.equal(h.session(), null);
});

test('only exact SAP X is active; legacy booleans, empty and other values deny access', async () => {
  const h = await harness();
  for (const value of [true, false, '', ' ', 'true', 'TRUE', 'x', 'Y', 1, null, undefined]) {
    h.authApi.fetchUserRoles = async () => [{ SAP_USER: 'VERTIF-V', PTW_ROLE: 'PTW_ADMIN', ACTIVE: value }];
    assert.equal(await h.context.login({ userId: '' }), true);
    assert.deepEqual(h.session().user.unlockedModules, [], `Unexpected access for ${String(value)}`);
  }
});

test('password credentials are allowed only in development and still require matching SAP identity', async () => {
  const production = await harness();
  assert.equal(await production.context.login({ userId: 'VERTIF-V', password: 'test-only' }), false);
  const dev = await harness(true);
  let authorization;
  dev.authApi.fetchStartupUser = async () => {
    authorization = dev.odataClient.instance.defaults.headers.common.Authorization;
    return { id: 'VERTIF-V' };
  };
  assert.equal(await dev.context.login({ userId: 'VERTIF-V', password: 'test-only' }), true);
  assert.equal(authorization, `Basic ${btoa('VERTIF-V:test-only')}`);
});

test('logout invalidates an in-flight login', async () => {
  const h = await harness();
  let resolveIdentity;
  h.authApi.fetchStartupUser = () => new Promise(resolve => { resolveIdentity = resolve; });
  const pending = h.context.login({ userId: '' });
  h.context.logout();
  resolveIdentity({ id: 'VERTIF-V' });
  assert.equal(await pending, false);
  assert.equal(h.session(), null);
});

test('active PTW_ISSU grants permit creation without administrator access', async () => {
  const h = await harness();
  h.authApi.fetchUserRoles = async () => [{ SAP_USER: 'VERTIF-V', PTW_ROLE: 'PTW_ISSU', ACTIVE: 'X' }];
  assert.equal(await h.context.login({ userId: '' }), true);
  assert.ok(h.session().user.unlockedModules.includes('permit-create'));
  assert.ok(!h.session().user.unlockedModules.includes('admin'));
});

test('retired requester role no longer grants module access', async () => {
  const h = await harness();
  h.authApi.fetchUserRoles = async () => [{ SAP_USER: 'VERTIF-V', PTW_ROLE: 'PTW_REQUESTER', ACTIVE: 'X' }];
  assert.equal(await h.context.login({ userId: '' }), true);
  assert.deepEqual(h.session().user.unlockedModules, []);
});
