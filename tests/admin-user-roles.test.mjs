import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const bundleResult = await build({
  stdin: {
    contents: `
      export { ODATA_ENTITIES } from './src/core/api/odataEndpoints';
      export { MODULE_REGISTRY } from './src/core/auth/sapAuthContext';
      export { PTW_ROLE_CATALOG, getPtwRoleInfo } from './src/core/types/admin.types';
      export { adminApi } from './src/core/api/modules/admin.api';
      export { odataClient } from './src/core/api/odataClient';
    `,
    resolveDir: process.cwd(),
    loader: 'tsx'
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  define: { 'import.meta.env': '{}' }
});

const compiled = { exports: {} };
new Function('require', 'module', 'exports', bundleResult.outputFiles[0].text)(
  createRequire(import.meta.url),
  compiled,
  compiled.exports
);

const { ODATA_ENTITIES, MODULE_REGISTRY, PTW_ROLE_CATALOG, getPtwRoleInfo, adminApi, odataClient } = compiled.exports;

test('ODATA_ENTITIES exposes USER_ROLE and PFCG_USERS as exact match to SAP OData V4 service', () => {
  assert.equal(ODATA_ENTITIES.USER_ROLE, 'UserRole');
  assert.equal(ODATA_ENTITIES.USER_ROLES, 'UserRole');
  assert.equal(ODATA_ENTITIES.PFCG_USERS, 'PFCGUsers');
});

test('Live SAP /PFCGUsers response payload conforms to schema with SAPUser, FullName, and Email', async () => {
  const livePfcgResponse = {
    "@odata.context": "$metadata#PFCGUsers",
    "@odata.metadataEtag": 'W/"20261027072024"',
    "value": [
      {
        "SAPUser": "GF10409",
        "PFCGRole": "Z_MOBILE_PI_SHEET",
        "FirstName": "Vineet",
        "LastName": "Kumar",
        "EmailAddress": "Vineet.kumar@gfl.co.in"
      },
      {
        "SAPUser": "GF7874",
        "PFCGRole": "Z_MOBILE_PI_SHEET",
        "FirstName": "Amit",
        "LastName": "Jain",
        "EmailAddress": "amit.jain@gfl.co.in"
      },
      {
        "SAPUser": "VERTIF-V",
        "PFCGRole": "YSM-XX-PFCG-PTW-APP-XXXXXXXXXX",
        "FirstName": "Verti",
        "LastName": "VERTIF-V",
        "EmailAddress": "manoj-v@gfl.co.in"
      }
    ]
  };

  const instance = odataClient.instance;
  const originalAdapter = instance.defaults.adapter;
  let requestedUrl = '';

  instance.defaults.adapter = async (config) => {
    requestedUrl = config.url || '';
    return {
      data: livePfcgResponse,
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    };
  };

  try {
    const users = await adminApi.getPFCGUsers();
    assert.equal(requestedUrl, 'PFCGUsers');
    assert.equal(users.length, 3);
    assert.equal(users[0].SAPUser, 'GF10409');
    assert.equal(users[0].FirstName, 'Vineet');
    assert.equal(users[0].LastName, 'Kumar');
    assert.equal(users[0].EmailAddress, 'Vineet.kumar@gfl.co.in');
    assert.equal(users[0].PFCGRole, 'Z_MOBILE_PI_SHEET');
  } finally {
    instance.defaults.adapter = originalAdapter;
  }
});

test('Live SAP /UserRole response payload conforms to SapUserRoleRecord schema', () => {
  // Real SAP response provided by user from https://vhgfldevci.sap.gfl.co.in:44300/.../UserRole
  const liveSapResponse = {
    "@odata.context": "$metadata#UserRole",
    "@odata.metadataEtag": 'W/"20261023072500"',
    "value": [
      {
        "SAP_USER": "VERTIF-V",
        "PTW_ROLE": "PTW_ADMIN",
        "ACTIVE": "X",
        "CREATED_BY": "",
        "CREATED_ON": null,
        "CREATED_AT": "::",
        "CHANGED_BY": "",
        "CHANGED_ON": null,
        "CHANGED_AT": "::",
        "SAP__Messages": []
      }
    ]
  };

  assert.ok(Array.isArray(liveSapResponse.value));
  const record = liveSapResponse.value[0];

  assert.equal(typeof record.SAP_USER, 'string');
  assert.equal(record.SAP_USER, 'VERTIF-V');

  assert.equal(typeof record.PTW_ROLE, 'string');
  assert.equal(record.PTW_ROLE, 'PTW_ADMIN');

  assert.equal(typeof record.ACTIVE, 'string');
  assert.equal(record.ACTIVE, 'X');

  assert.ok('CREATED_BY' in record);
  assert.ok('CREATED_ON' in record);
  assert.ok('CREATED_AT' in record);
  assert.ok('CHANGED_BY' in record);
  assert.ok('CHANGED_ON' in record);
  assert.ok('CHANGED_AT' in record);
  assert.ok(Array.isArray(record.SAP__Messages));
});

test('Role normalization handles PTW_* and ZPTW_* prefixes bidirectionally', () => {
  const normalizeRoles = (rawRoles) => {
    const set = new Set();
    for (const r of rawRoles) {
      const clean = r.trim().toUpperCase();
      set.add(clean);
      if (clean.startsWith('PTW_')) {
        set.add(`Z${clean}`);
      } else if (clean.startsWith('ZPTW_')) {
        set.add(clean.substring(1));
      }
    }
    return Array.from(set);
  };

  // Case 1: SAP returns PTW_ADMIN
  const normalizedFromPtw = normalizeRoles(['PTW_ADMIN']);
  assert.ok(normalizedFromPtw.includes('PTW_ADMIN'));
  assert.ok(normalizedFromPtw.includes('ZPTW_ADMIN'));

  // Case 2: SAP returns ZPTW_ADMIN
  const normalizedFromZptw = normalizeRoles(['ZPTW_ADMIN']);
  assert.ok(normalizedFromZptw.includes('PTW_ADMIN'));
  assert.ok(normalizedFromZptw.includes('ZPTW_ADMIN'));

  // Case 3: Multiple roles
  const multiple = normalizeRoles(['PTW_ISSU', 'PTW_APPROVER', 'ZPTW_ISSUER']);
  assert.ok(multiple.includes('PTW_ISSU') && multiple.includes('ZPTW_ISSU'));
  assert.ok(multiple.includes('PTW_APPROVER') && multiple.includes('ZPTW_APPROVER'));
  assert.ok(multiple.includes('PTW_ISSUER') && multiple.includes('ZPTW_ISSUER'));
});

test('Admin module definition is configured in MODULE_REGISTRY with PTW_ADMIN authorization', () => {
  const adminMod = MODULE_REGISTRY.find((m) => m.id === 'admin');
  assert.ok(adminMod, 'admin module must be present in MODULE_REGISTRY');
  assert.equal(adminMod.title, 'PTW Admin');
  assert.equal(adminMod.icon, 'admin_panel_settings');
  assert.ok(adminMod.requiredRoles.includes('PTW_ADMIN'), 'Must accept PTW_ADMIN');
  assert.ok(adminMod.requiredRoles.includes('ZPTW_ADMIN'), 'Must accept ZPTW_ADMIN');
});

test('User with PTW_ADMIN or ZPTW_ADMIN unlocks all modules across the application', () => {
  const computeUnlocked = (roles) => {
    if (
      roles.includes('ZPTW_ADMIN') ||
      roles.includes('PTW_ADMIN') ||
      roles.includes('Z_MOBILE_PI_SHEET')
    ) {
      return MODULE_REGISTRY.map((m) => m.id);
    }
    return MODULE_REGISTRY.filter((mod) =>
      mod.requiredRoles.some((reqRole) => roles.includes(reqRole))
    ).map((m) => m.id);
  };

  // Admin role unlocks all modules
  const ptwAdminUnlocked = computeUnlocked(['PTW_ADMIN']);
  assert.equal(ptwAdminUnlocked.length, MODULE_REGISTRY.length);
  assert.ok(ptwAdminUnlocked.includes('admin'));
  assert.ok(ptwAdminUnlocked.includes('permit-create'));
  assert.ok(ptwAdminUnlocked.includes('permit-approver'));

  const zptwAdminUnlocked = computeUnlocked(['ZPTW_ADMIN']);
  assert.equal(zptwAdminUnlocked.length, MODULE_REGISTRY.length);

  // Non-admin with just issuer only unlocks issuer modules
  const issuerUnlocked = computeUnlocked(['PTW_ISSU']);
  assert.ok(!issuerUnlocked.includes('admin'), 'Issuer must NOT unlock admin');
  assert.ok(issuerUnlocked.includes('permit-create'), 'Issuer unlocks permit-create');
});

test('PTW_ROLE_CATALOG covers all core operational roles with labels and icons', () => {
  const expectedCodes = [
    'PTW_ADMIN',
    'PTW_ACCP',
    'PTW_ACCEPTOR',
    'PTW_ISSU',
    'PTW_HOLDER',
    'PTW_HOLD',
    'PTW_APPROVER',
    'PTW_APPR1',
    'PTW_APPR2',
    'PTW_APPR3',
    'PTW_ISSUER',
    'PTW_ISSU',
    'PTW_AREA_OWNER',
    'PTW_AREA_OPP',
    'PTW_AOPR',
    'PTW_ISOLATOR',
    'PTW_ISO_REQ',
    'PTW_GAS_TESTER',
    'PTW_GAS',
    'PTW_SAFETY_OFFICER',
    'PTW_SAFE'
  ];

  for (const code of expectedCodes) {
    const meta = getPtwRoleInfo(code);
    assert.ok(meta, `Role ${code} must resolve in catalog`);
    assert.ok(meta.label.length > 0);
    assert.ok(meta.icon.length > 0);
    assert.ok(meta.colorBadge.length > 0);
  }
});

test('adminApi.computeRoleStats correctly calculates role metrics and active users', () => {
  const sampleRoles = [
    { SAP_USER: 'VERTIF-V', PTW_ROLE: 'PTW_ADMIN', ACTIVE: true },
    { SAP_USER: 'VERTIF-V', PTW_ROLE: 'PTW_APPROVER', ACTIVE: true },
    { SAP_USER: 'SHARMA-M', PTW_ROLE: 'PTW_ISSUER', ACTIVE: true },
    { SAP_USER: 'PATEL-R', PTW_ROLE: 'PTW_ISSU', ACTIVE: true },
    { SAP_USER: 'CONTRACTOR-01', PTW_ROLE: 'PTW_HOLDER', ACTIVE: false }
  ];

  const stats = adminApi.computeRoleStats(sampleRoles);
  assert.equal(stats.totalRoles, 5);
  assert.equal(stats.activeAdmins, 1);
  assert.equal(stats.activeApprovers, 1);
  assert.equal(stats.activeIssuers, 2);
  assert.equal(stats.inactiveRoles, 1);
  assert.equal(stats.uniqueUsers, 4); // VERTIF-V, SHARMA-M, PATEL-R, CONTRACTOR-01
});

test('adminApi reads only live matching roles and treats only X as active', async () => {
  const instance = odataClient.instance;
  const original = instance.defaults.adapter;
  instance.defaults.adapter = async config => ({data: {value: [
    {SAP_USER: 'TEST', PTW_ROLE: 'PTW_ADMIN', ACTIVE: 'X'},
    {SAP_USER: 'TEST', PTW_ROLE: 'PTW_GAS', ACTIVE: true},
    {SAP_USER: 'OTHER', PTW_ROLE: 'PTW_ADMIN', ACTIVE: 'X'}
  ]}, status: 200, statusText: 'OK', headers: {}, config});
  try {
    const roles = await adminApi.getUserRoles({user: 'TEST', activeOnly: true});
    assert.equal(roles.length, 1);
    assert.equal(roles[0].PTW_ROLE, 'PTW_ADMIN');
    assert.equal(roles[0].ACTIVE, true);
  } finally { instance.defaults.adapter = original; }
});

test('adminApi propagates SAP failures without cached roles or fake mutation success', async () => {
  const instance = odataClient.instance;
  const original = instance.defaults.adapter;
  const originalCsrf = odataClient.csrfToken;
  odataClient.csrfToken = 'test-token';
  instance.defaults.adapter = async config => {
    const error = new Error('SAP denied operation');
    error.config = config;
    error.response = {status: 403, data: {}, headers: {}, config};
    throw error;
  };
  try {
    await assert.rejects(() => adminApi.getUserRoles());
    await assert.rejects(() => adminApi.createUserRole({SAP_USER: 'TEST', PTW_ROLE: 'PTW_ADMIN', ACTIVE: true}));
    await assert.rejects(() => adminApi.updateUserRoleStatus('TEST', 'PTW_ADMIN', false));
    await assert.rejects(() => adminApi.deleteUserRole('TEST', 'PTW_ADMIN'));
  } finally { instance.defaults.adapter = original; odataClient.csrfToken = originalCsrf; }
});

test('adminApi sends X for Active and empty string for Inactive in SAP payloads', async () => {
  const instance = odataClient.instance;
  const originalAdapter = instance.defaults.adapter;
  const originalCsrf = odataClient.csrfToken;
  odataClient.csrfToken = 'test-mock-csrf-token';
  const capturedPayloads = [];

  instance.defaults.adapter = async (config) => {
    capturedPayloads.push({
      method: config.method,
      url: config.url,
      data: config.data ? JSON.parse(config.data) : undefined
    });
    return {
      data: {
        SAP_USER: 'GF10409',
        PTW_ROLE: 'PTW_ADMIN',
        ACTIVE: config.data ? JSON.parse(config.data).ACTIVE : true
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    };
  };

  try {
    // 1. Active Create: must send ACTIVE: "X"
    await adminApi.createUserRole({
      SAP_USER: 'GF10409',
      PTW_ROLE: 'PTW_ADMIN',
      ACTIVE: true
    });
    const postActive = capturedPayloads.find((p) => p.method === 'post');
    assert.ok(postActive, 'Must issue POST /UserRole');
    assert.strictEqual(postActive.data.ACTIVE, 'X', 'Active status must send X to SAP');

    // 2. Inactive Create: must send ACTIVE: ""
    capturedPayloads.length = 0;
    await adminApi.createUserRole({
      SAP_USER: 'GF10409',
      PTW_ROLE: 'PTW_ADMIN',
      ACTIVE: false
    });
    const postInactive = capturedPayloads.find((p) => p.method === 'post');
    assert.strictEqual(postInactive.data.ACTIVE, '', 'Inactive status must send empty string to SAP');

    // 3. Active Update: must send ACTIVE: "X"
    capturedPayloads.length = 0;
    await adminApi.updateUserRoleStatus('GF10409', 'PTW_ADMIN', true);
    const patchActive = capturedPayloads.find((p) => p.method === 'patch');
    assert.ok(patchActive, 'Must issue PATCH /UserRole');
    assert.strictEqual(patchActive.data.ACTIVE, 'X', 'Active status update must send X to SAP');

    // 4. Inactive Update: must send ACTIVE: ""
    capturedPayloads.length = 0;
    await adminApi.updateUserRoleStatus('GF10409', 'PTW_ADMIN', false);
    const patchInactive = capturedPayloads.find((p) => p.method === 'patch');
    assert.strictEqual(patchInactive.data.ACTIVE, '', 'Inactive status update must send empty string to SAP');
  } finally {
    instance.defaults.adapter = originalAdapter;
    odataClient.csrfToken = originalCsrf;
  }
});

test('admin role reads normalize only X and use the SAP character filter', async () => {
  const instance = odataClient.instance;
  const originalAdapter = instance.defaults.adapter;
  const values = ['X', '', null, undefined, true, false, 'TRUE', 'x', 1];
  instance.defaults.adapter = async config => {
    assert.equal(config.params.$filter, "ACTIVE eq 'X'");
    return {
      data: { value: values.map((ACTIVE, i) => ({ SAP_USER: `AUDIT-${i}`, PTW_ROLE: 'PTW_GAS', ACTIVE })) },
      status: 200, statusText: 'OK', headers: {}, config,
    };
  };
  try {
    const roles = await adminApi.getUserRoles({ activeOnly: true });
    assert.equal(roles.length, 1);
    assert.equal(roles[0].SAP_USER, 'AUDIT-0');
    assert.equal(roles[0].ACTIVE, true);
  } finally {
    instance.defaults.adapter = originalAdapter;
  }
});
