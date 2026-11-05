import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

// Test the upload artifacts, including vendor code and every generated chunk.
// Run with npm run test:bsp to build the artifacts first.
const dist = resolve('dist');
const assets = await readdir(resolve(dist, 'assets'));

test('BSP scripts and styles survive legacy charset decoding', async () => {
  const textAssets = assets.filter(name => /\.(js|css)$/.test(name));
  assert.ok(textAssets.some(name => name.endsWith('.js')));
  assert.ok(textAssets.some(name => name.endsWith('.css')));
  for (const name of textAssets) {
    const bytes = await readFile(resolve(dist, 'assets', name));
    const nonAscii = bytes.findIndex(byte => byte > 127);
    assert.equal(nonAscii, -1, `${name} has a charset-sensitive byte at ${nonAscii}`);
    assert.equal(bytes.toString('utf8'), bytes.toString('latin1'), name);
  }
  const scripts = (await Promise.all(textAssets.filter(name => name.endsWith('.js'))
    .map(name => readFile(resolve(dist, 'assets', name), 'utf8')))).join('\n');
  // The screenshot's bullet, middle dot, and missing-equipment dash remain present.
  for (const code of ['2022', 'b7', '2014']) {
    assert.match(scripts, new RegExp(`\\\\(?:u0*${code}|x${code})(?![a-f0-9])`, 'i'));
  }
});

test('icons ship locally and asset URLs stay inside the nested BSP application', async () => {
  const html = await readFile(resolve(dist, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /fonts\.googleapis\.com[^"']*Material\+Symbols/i);
  const base = new URL('https://sap.example/sap/bc/bsp/sap/zptw_app/');
  const htmlPaths = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"?]+)"/g)]
    .map(match => [match[1], base]);
  assert.ok(htmlPaths.length >= 2);
  const sourceFont = await readFile(resolve('src/assets/fonts/material-symbols-outlined.woff2'));
  for (const name of assets.filter(name => name.endsWith('.css'))) {
    const css = await readFile(resolve(dist, 'assets', name), 'utf8');
    assert.match(css, /font-family:["']?Material Symbols Outlined/);
    assert.match(css, /font-feature-settings:["']liga["']/);
    const embeddedFont = css.match(/url\(["']?data:font\/woff2;base64,([A-Za-z0-9+/=]+)["']?\)/);
    assert.ok(embeddedFont, 'Icon font must be embedded, with no separate SAP font request');
    assert.deepEqual(Buffer.from(embeddedFont[1], 'base64'), sourceFont,
      'Embedded font must preserve the complete source font, including dynamic icons');
    assert.doesNotMatch(css, /url\(["']?(?!data:)[^\)"']+\.woff2/);
  }
  for (const [path, parent] of htmlPaths) {
    const url = new URL(path, parent);
    assert.ok(url.href.startsWith(base.href), `Asset escapes BSP path: ${path}`);
    const localPath = resolve(dist, url.pathname.slice(base.pathname.length));
    const bytes = await readFile(localPath);
    if (path.endsWith('.woff2')) {
      assert.equal(bytes.subarray(0, 4).toString('ascii'), 'wOF2');
    }
  }
});

test('SAP upload rules classify the icon font and logo as binary', async () => {
  const rules = (await readFile(resolve(dist, '.Ui5RepositoryBinaryFiles'), 'utf8'))
    .split(/\r?\n/).filter(line => line.trim()).map(line => new RegExp(line));
  const binaryFiles = [
    ...assets.filter(name => name.endsWith('.woff2')).map(name => `assets/${name}`),
    'GFL-Logo.webp',
  ];
  for (const name of binaryFiles) {
    await readFile(resolve(dist, name));
    // The filesystem uploader can supply Windows paths; OData archives use '/'.
    for (const path of [name, `D:\\App\\PTW\\dist\\${name.replaceAll('/', '\\')}`]) {
      assert.ok(rules.some(rule => rule.test(path)), `SAP would skip ${path}`);
    }
  }
  for (const name of ['index.html', 'assets/index.js', 'assets/index.css']) {
    assert.ok(!rules.some(rule => rule.test(name)), `Text must not be uploaded as binary: ${name}`);
  }
});

test('production upload excludes source files, credentials, maps and development identities', async () => {
  const entries = await readdir(dist, {recursive: true});
  for (const name of entries) {
    assert.doesNotMatch(name, /(^|[\\/])(?:\.env(?:\.|$)|node_modules|src)(?:[\\/]|$)|\.(?:map|tsx?|pem|key)$/i);
  }
  const html = await readFile(resolve(dist, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /(?:src|href)=["'](?:https?:)?\/\//i);
  const scripts = (await Promise.all(assets.filter(name => name.endsWith('.js')).map(name => readFile(resolve(dist, 'assets', name), 'utf8')))).join('\n');
  for (const forbidden of ['VERTIF-V', 'vhgfldevci.sap.gfl.co.in', 'INITIAL_ADMIN_USER_ROLE', 'localRolesStore', 'VITE_INITIAL_USER_ID']) {
    assert.ok(!scripts.includes(forbidden), 'Production contains ' + forbidden);
  }
  assert.ok(scripts.includes('/sap/bc/ui2/start_up'));
  assert.ok(scripts.includes('/sap/opu/odata4/'));
});

test('new plant drawing and original PDF are included intact in the BSP package', async () => {
  for (const name of ['maps/gfl-a-d1376.png','maps/GFL-COM-CIVL-LYOD-D1376.pdf']) {
    assert.deepEqual(await readFile(resolve(dist,name)),await readFile(resolve('public',name)),name);
    const rules=(await readFile(resolve(dist,'.Ui5RepositoryBinaryFiles'),'utf8')).split(/\r?\n/).filter(Boolean).map(line=>new RegExp(line));
    assert.ok(rules.some(rule=>rule.test(name)),name+' must be uploaded as binary');
  }
});
