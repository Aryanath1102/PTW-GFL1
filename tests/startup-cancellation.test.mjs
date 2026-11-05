import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

test('cancelled SAP restoration stops discovery and cancels profile/role requests', async () => {
  const result = await build({
    stdin: {
      contents: "export { authApi } from './src/core/api/modules/auth.api'; export { odataClient } from './src/core/api/odataClient';",
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    define: { 'import.meta.env': '{}' },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports,
  );
  const { authApi, odataClient } = module.exports;
  let calls = 0;
  const controller = new AbortController();
  odataClient.instance.defaults.adapter = async config => {
    calls++;
    assert.equal(config.signal, controller.signal);
    controller.abort();
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
  };
  assert.equal(await authApi.fetchStartupUser('', controller.signal), null);
  assert.equal(calls, 1, 'Do not try another startup endpoint after cancellation');
  await assert.rejects(authApi.fetchUserInfo('TEST', '', controller.signal));
  await assert.rejects(authApi.fetchUserRoles('TEST', '', controller.signal));
  assert.equal(calls, 1, 'Cancelled profile and role requests must not reach SAP');
});
