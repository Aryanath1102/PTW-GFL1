import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({
  stdin: { contents: `export { authApi } from './src/core/api/modules/auth.api'; export * from './src/core/api/modules/permitWorkLookup.api'; export * from './src/core/api/modules/permitCreate.validation'; export * from './src/core/api/modules/permitCreate.api'; export { odataClient } from './src/core/api/odataClient';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', define: { 'import.meta.env': '{}' },
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const { authApi, preparePermitCreate, permitCreateApi, PermitCreateUnconfirmedError, buildWorkFilter, validateWorkSearch, availableSources, availableOrderTypes, referenceKey, toPermitReferenceFields, permitWorkLookupApi, odataClient } = compiled.exports;
const base = { category: 'Preventive', source: 'order', fromDate: '2026-09-01', toDate: '2026-09-25', orderType: '' };
const fixture = {
  ReferenceId: '000040001234', ReferenceSource: 'ORDER', WorkCategory: 'PREVENTIVE', OrderNotifType: 'PM01',
  JobDescription: 'Inspect pump', WorkDate: '2026-09-25', Plant: '1000', EquipmentTag: '000000000010001234',
  FunctionalLocation: 'PLANT-AREA-001', PlannerGroup: '', Priority: '1', SystemStatus: '',
  WorkCenter: '', WorkCenterDesc: '', AreaLoc: '', LocationDesc: '', ColorNumber: 0,
};

test('userinfo serializes sap-client once after merging Axios defaults', async () => {
  const instance = odataClient.instance;
  const adapter = instance.defaults.adapter;
  const savedParams = instance.defaults.params;
  instance.defaults.params = { 'sap-client': '200' };
  const urls = [];
  instance.defaults.adapter = async config => {
    urls.push(new URL(instance.getUri(config), 'http://127.0.0.1:5173'));
    return { config, status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, data: { value: [] } };
  };
  try {
    await authApi.fetchUserInfo('VERTIF-V', '200');
    await authApi.fetchUserInfo(" o'neil ", '300');
    assert.deepEqual(urls[0].searchParams.getAll('sap-client'), ['200']);
    assert.deepEqual(urls[0].searchParams.getAll('$filter'), ["UserId eq 'VERTIF-V'"]);
    assert.deepEqual(urls[1].searchParams.getAll('sap-client'), ['300']);
    assert.deepEqual(urls[1].searchParams.getAll('$filter'), ["UserId eq 'O''NEIL'"]);
    assert.ok(urls.every(url => url.pathname.endsWith('/userinfo')));
  } finally {
    instance.defaults.adapter = adapter;
    instance.defaults.params = savedParams;
  }
});

test('fetchStartupUser discovers user from /sap/bc/ui2/start_up and handles various SAP payloads', async () => {
  const instance = odataClient.instance;
  const adapter = instance.defaults.adapter;
  try {
    // 1. Direct ID in root response
    instance.defaults.adapter = async (config) => ({
      config,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      data: { id: 'VERTIF-V', client: '200' }
    });
    const user1 = await authApi.fetchStartupUser('200');
    assert.equal(user1?.id, 'VERTIF-V');

    // 2. Nested user object (Fiori Launchpad start_up shape)
    instance.defaults.adapter = async (config) => ({
      config,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      data: { user: { id: 'SAFETY_MGR' } }
    });
    const user2 = await authApi.fetchStartupUser('200');
    assert.equal(user2?.id, 'SAFETY_MGR');

    // 3. Rejects HTML login page
    instance.defaults.adapter = async (config) => ({
      config,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/html', 'sap-authenticated': 'pending' },
      data: '<html><head><title>SAP Logon</title></head></html>'
    });
    const user3 = await authApi.fetchStartupUser('200');
    assert.equal(user3, null);
  } finally {
    instance.defaults.adapter = adapter;
  }
});


test('validates real calendar dates and inclusive same-day ranges', () => {
  for (const change of [{ fromDate: '' }, { fromDate: '2026-02-30' }, { fromDate: '2026-09-26' }, { toDate: 'bad' }]) assert.ok(validateWorkSearch({ ...base, ...change }));
  assert.equal(validateWorkSearch({ ...base, fromDate: base.toDate }), null);
});

test('all CDS branches filter by category, source, type and inclusive WorkDate', () => {
  const branches = [
    ['Corrective', 'notification', 'NOTIFICATION', ['M2']], ['Corrective', 'order', 'ORDER', ['PM06']],
    ['Preventive', 'order', 'ORDER', ['PM01']], ['Shutdown', 'shutdown', 'ORDER', ['PM03']],
    ['Inspection', 'order', 'ORDER', ['PM05']], ['Other', 'order', 'ORDER', ['PM07', 'PM08']],
  ];
  for (const [category, source, sapSource, types] of branches) {
    const filter = buildWorkFilter({ ...base, category, source });
    assert.ok(filter.includes(`WorkCategory eq '${category.toUpperCase()}'`));
    assert.ok(filter.includes(`ReferenceSource eq '${sapSource}'`));
    assert.ok(filter.includes('WorkDate ge 2026-09-01 and WorkDate le 2026-09-25'));
    for (const type of types) assert.ok(filter.includes(`OrderNotifType eq '${type}'`));
    assert.doesNotMatch(filter, /\b(Qmart|Auart|IsShutdown|Qmnum|Aufnr)\b/);
    assert.deepEqual([...filter.matchAll(/OrderNotifType eq '([^']+)'/g)].map(match => match[1]), types);
  }
});

test('prevents contradictory category/source/type combinations and injection', () => {
  for (const change of [{ category: 'Predictive' }, { category: 'unknown' }, { source: 'notification' }, { source: 'shutdown' }, { orderType: 'PM06' }, { orderType: "PM01' or true" }]) {
    assert.throws(() => buildWorkFilter({ ...base, ...change }));
  }
  assert.ok(buildWorkFilter({ ...base, category: 'Other', orderType: 'PM08' }).includes("(OrderNotifType eq 'PM08')"));
  assert.throws(() => buildWorkFilter({ ...base, category: 'Corrective', source: 'notification', orderType: 'PM06' }));
});

test('UI choices reflect the CDS and do not invent a Predictive mapping', () => {
  assert.deepEqual(availableSources('Corrective'), ['notification', 'order']);
  assert.deepEqual(availableSources('Shutdown'), ['shutdown']);
  assert.deepEqual(availableSources('Predictive'), []);
  assert.deepEqual(availableOrderTypes('Other'), ['PM07', 'PM08']);
  assert.deepEqual(availableOrderTypes('Inspection'), ['PM05']);
});

test('composite keys distinguish order and notification with the same reference ID', () => {
  assert.notEqual(referenceKey(fixture), referenceKey({ ...fixture, ReferenceSource: 'NOTIFICATION' }));
});

test('maps order fields and clears notification linkage without losing leading zeroes', () => {
  const result = toPermitReferenceFields(fixture);
  assert.equal(result.Aufnr, '000040001234');
  assert.equal(result.Auart, 'PM01');
  assert.equal(result.Qmnum, '');
  assert.equal(result.Qmart, '');
  assert.equal(result.Qmtxt, '');
  assert.equal(result.Qmdat, null);
  assert.equal(result.PmBasicStartD, '2026-09-25');
  assert.equal(result.Equnr, fixture.EquipmentTag);
  assert.equal(result.Tplnr, fixture.FunctionalLocation);
  assert.equal(result.Werks, fixture.Plant);
  assert.equal(result.JobDesc, fixture.JobDescription);
});

test('maps M2 notification and clears order type instead of fabricating a PM02 link', () => {
  const result = toPermitReferenceFields({ ...fixture, ReferenceSource: 'NOTIFICATION', OrderNotifType: 'M2', WorkCategory: 'CORRECTIVE' });
  assert.equal(result.Qmnum, fixture.ReferenceId);
  assert.equal(result.Qmart, 'M2');
  assert.equal(result.Qmtxt, fixture.JobDescription);
  assert.equal(result.Qmdat, fixture.WorkDate);
  assert.equal(result.Aufnr, '');
  assert.equal(result.Auart, '');
  assert.equal(result.PmBasicStartD, null);
});

test('PM03 shutdown remains an ORDER when filling the permit', () => {
  const result = toPermitReferenceFields({ ...fixture, WorkCategory: 'SHUTDOWN', OrderNotifType: 'PM03' });
  assert.equal(result.Aufnr, fixture.ReferenceId);
  assert.equal(result.Auart, 'PM03');
  assert.equal(result.Qmnum, '');
});

test('maps live SAP PMIntegration fields WorkCenter, AreaLoc, ColorNumber, etc. into permit reference', () => {
  const liveNotification = {
    ReferenceId: '10000002',
    ReferenceSource: 'NOTIFICATION',
    WorkCategory: 'Breakdown/Corrective',
    OrderNotifType: 'M2',
    JobDescription: 'E608 top/bottom open for hydrotest work',
    WorkDate: '2025-09-05',
    Plant: '1002',
    EquipmentTag: '',
    FunctionalLocation: '1002-010-CRGSTRT-XXXXXXX-E608A',
    PlannerGroup: '',
    WorkCenter: 'DMEC-TF2',
    WorkCenterDesc: 'MECHANICAL TFE 2',
    AreaLoc: 'POL',
    LocationDesc: 'TFE 2 PLANT',
    Priority: '2',
    SystemStatus: '1',
    ColorNumber: 4,
  };
  const notifResult = toPermitReferenceFields(liveNotification);
  assert.equal(notifResult.Qmnum, '10000002');
  assert.equal(notifResult.Qmart, 'M2');
  assert.equal(notifResult.Arbpl, 'DMEC-TF2');
  assert.equal(notifResult.AreaLoc, 'POL');
  assert.equal(notifResult.WorkCenter, 'DMEC-TF2');
  assert.equal(notifResult.WorkCenterDesc, 'MECHANICAL TFE 2');
  assert.equal(notifResult.LocationDesc, 'TFE 2 PLANT');
  assert.equal(notifResult.ColorNumber, 4);
  assert.equal(notifResult.Werks, '1002');
  assert.equal(notifResult.Tplnr, '1002-010-CRGSTRT-XXXXXXX-E608A');
  assert.equal(notifResult.Qmdat, '2025-09-05');

  const liveOrder = {
    ReferenceId: '100000002',
    ReferenceSource: 'ORDER',
    WorkCategory: 'Maintenance order (Preventive Maint)',
    OrderNotifType: 'PM01',
    JobDescription: 'GENERAL MAINTENANCE ORDER JULY 2025',
    WorkDate: '2025-07-16',
    Plant: '1001',
    EquipmentTag: '',
    FunctionalLocation: '1001-003',
    PlannerGroup: '',
    WorkCenter: 'RWORKSHO',
    WorkCenterDesc: 'CENTRAL WORKSHOP',
    AreaLoc: 'FCM',
    LocationDesc: 'AHF PLANT',
    Priority: '3',
    SystemStatus: '',
    ColorNumber: 5,
  };
  const orderResult = toPermitReferenceFields(liveOrder);
  assert.equal(orderResult.Aufnr, '100000002');
  assert.equal(orderResult.Auart, 'PM01');
  assert.equal(orderResult.Arbpl, 'RWORKSHO');
  assert.equal(orderResult.AreaLoc, 'FCM');
  assert.equal(orderResult.WorkCenter, 'RWORKSHO');
  assert.equal(orderResult.WorkCenterDesc, 'CENTRAL WORKSHOP');
  assert.equal(orderResult.LocationDesc, 'AHF PLANT');
  assert.equal(orderResult.ColorNumber, 5);
  assert.equal(orderResult.Werks, '1001');
  assert.equal(orderResult.PmBasicStartD, '2025-07-16');
});

test('PMIntegration request carries filter, selected client and abort signal; parses ABAP padding', async () => {
  const original = odataClient.get;
  const controller = new AbortController();
  odataClient.get = async (entity, config) => {
    assert.equal(entity, 'PMIntegration');
    assert.equal(config.params['sap-client'], '300');
    assert.equal(config.signal, controller.signal);
    assert.equal(config.params.$filter, buildWorkFilter(base));
    return { data: { value: [{ ...fixture, ReferenceSource: 'ORDER       ' }] } };
  };
  try { assert.deepEqual(await permitWorkLookupApi.search(base, controller.signal, '300'), [fixture]); }
  finally { odataClient.get = original; }
});

test('backend errors, legacy response shapes and incomplete pages do not become successful records', async () => {
  const original = odataClient.get;
  try {
    odataClient.get = async () => { throw new Error('SAP unavailable'); };
    await assert.rejects(permitWorkLookupApi.search(base), /SAP unavailable/);
    for (const data of [{}, { value: [{}] }, { value: [null] }, { value: [{ Aufnr: '40001234' }] },
      { value: [{ ...fixture, ReferenceSource: 'SHUTDOWN' }] }, { value: [{ ...fixture, WorkDate: '2026-02-30' }] }]) {
      odataClient.get = async () => ({ data });
      await assert.rejects(permitWorkLookupApi.search(base), /unexpected/);
    }
    odataClient.get = async () => ({ data: { value: [], '@odata.nextLink': 'next' } });
    await assert.rejects(permitWorkLookupApi.search(base), /Narrow the date range/);
    odataClient.get = async () => ({ data: { value: [] } });
    assert.deepEqual(await permitWorkLookupApi.search(base), []);
    odataClient.get = async () => ({ data: { value: [{ ...fixture, WorkDate: null }] } });
    assert.equal((await permitWorkLookupApi.search(base))[0].WorkDate, null);
  } finally { odataClient.get = original; }
});

function validPermit() {
  return {
    Permit_No: 'DO-NOT-SEND', FormRev: '1', PermitType: 'COLD', Aufnr: '000040001234', Qmnum: '', Auart: 'PM01',
    ExecDept: 'Maintenance', IsolationRequired: 'N', GasTestRequired: 'N', Werks: '1000', JobDesc: 'Pump maintenance', SupvName: 'Site supervisor', PersonsQty: 1,
    ValidFromD: '2099-01-01', ValidFromT: '08:00', ValidToD: '2099-01-01', ValidToT: '18:00',
    Status: 'ISSD', Ernam: 'CLIENT', LastChangedAt: null,
    _Worker: [{ PermitNo: 'DO-NOT-SEND', ItemNo: '7', WorkerName: 'Actual worker', WorkerTypeCode: 'EMP', EmpId: 'E100', PhoneNo: '', Shift: 'GENERAL' }],
    _HazardControl: [{ PermitNo: 'DO-NOT-SEND', ItemNo: '3', HazardCode: 'MECH', HazardDesc: 'Moving equipment', ControlCode: 'ISOL', ControlDesc: 'Isolate equipment', RiskLevel: 'HIGH', ControlStatus: 'OPEN' }],
    _GasTest: [{ TesterSigned: 'Y' }], _Approval: [{}], _AuditLog: [{}], _Attachment: [{}], _ShiftRenewal: [{}],
  };
}

test('create body uses server numbering and excludes unsupported and manufactured lifecycle records', () => {
  const body = preparePermitCreate(validPermit());
  for (const key of ['Permit_No', 'FormRev', 'Ernam', 'LastChangedAt', '_GasTest', '_Approval', '_AuditLog', '_Attachment', '_ShiftRenewal']) assert.ok(!(key in body), key);
  assert.equal(body.Status, 'CRTD');
  assert.equal(body.ValidFromT, '08:00:00');
  assert.equal(body.ValidToT, '18:00:00');
  assert.ok(!('PermitNo' in body._Worker[0]));
  assert.equal(body._Worker[0].ItemNo, '1');
  assert.equal(body._HazardControl[0].ItemNo, '1');
});

test('create validation rejects missing real work, inconsistent crew count, controls, expired or reversed validity and overlong fields', () => {
  for (const change of [
    { Aufnr: '', Qmnum: '' }, { PermitType: '' }, { _Worker: [] }, { PersonsQty: 2 },
    { _HazardControl: [] }, { ValidToT: '07:00' }, { ValidFromD: '2000-01-01', ValidToD: '2000-01-02' },
    { Tplnr: 'X'.repeat(41) }, { JobDesc: 'X'.repeat(256) }, { PersonsQty: -1 },
  ]) assert.throws(() => preparePermitCreate({ ...validPermit(), ...change }));
});

test('real create endpoint posts sanitized data once and returns only the SAP permit number', async () => {
  const original = odataClient.post;
  let count = 0;
  odataClient.post = async (entity, body, config) => {
    count++;
    assert.equal(entity, 'PermitInfo');
    assert.ok(!body.Permit_No);
    assert.equal(config.headers.Prefer, 'return=representation');
    return { data: { Permit_No: 'PTW0098765', Status: 'CRTD' } };
  };
  try {
    const result = await permitCreateApi.createPermitDeepInsert(validPermit());
    assert.equal(result.Permit_No, 'PTW0098765');
    assert.equal(count, 1);
  } finally { odataClient.post = original; }
});

test('failed or ambiguous creates never return a simulated permit or retry automatically', async () => {
  const original = odataClient.post;
  try {
    let count = 0;
    odataClient.post = async () => { count++; throw Object.assign(new Error('SAP validation rejected request'), { response: { status: 400 } }); };
    await assert.rejects(permitCreateApi.createPermitDeepInsert(validPermit()), /SAP validation/);
    assert.equal(count, 1);
    odataClient.post = async () => { throw new Error('timeout'); };
    await assert.rejects(permitCreateApi.createPermitDeepInsert(validPermit()), PermitCreateUnconfirmedError);
    odataClient.post = async () => ({ data: {} });
    await assert.rejects(permitCreateApi.createPermitDeepInsert(validPermit()), PermitCreateUnconfirmedError);
    odataClient.post = async () => ({ data: { Permit_No: 'P1', SAP__Messages: [{ numericSeverity: 4, message: 'Rejected' }] } });
    await assert.rejects(permitCreateApi.createPermitDeepInsert(validPermit()), /Rejected/);
  } finally { odataClient.post = original; }
});

test('SAP login HTML is rejected even when HTTP status is 200', async () => {
  const instance = odataClient.instance;
  const adapter = instance.defaults.adapter;
  let expired = false;
  odataClient.onSessionExpired(() => { expired = true; });
  instance.defaults.adapter = async config => ({ config, status: 200, statusText: 'OK', headers: { 'content-type': 'text/html', 'sap-authenticated': 'pending' }, data: '<html>Log on</html>' });
  try {
    await assert.rejects(odataClient.get('PMIntegration'), /requires sign-in/);
    assert.equal(expired, true);
  } finally { instance.defaults.adapter = adapter; odataClient.onSessionExpired(() => {}); }
});

test('missing CSRF token blocks writes before a POST is sent', async () => {
  const instance = odataClient.instance;
  const adapter = instance.defaults.adapter;
  const tokenFetch = odataClient.fetchCsrfToken;
  odataClient.clearCredentials();
  let posts = 0;
  odataClient.fetchCsrfToken = async () => null;
  instance.defaults.adapter = async config => { posts++; return { config, status: 201, headers: {}, data: {} }; };
  try {
    await assert.rejects(odataClient.post('PermitInfo', {}), error => error.beforeSend === true);
    assert.equal(posts, 0);
  } finally { instance.defaults.adapter = adapter; odataClient.fetchCsrfToken = tokenFetch; }
});

test('blank reference permit create allows empty Aufnr/Qmnum/Auart/Qmtxt when opted in and posts CreatorComment', async () => {
  const blankPermit = {
    ...validPermit(),
    Aufnr: '',
    Qmnum: '',
    Auart: '',
    Qmart: '',
    Qmtxt: '',
    Qmdat: null,
    PmBasicStartD: null,
    Werks: '1002',
    CreatorComment: 'Blank Permit (No SAP Order / Notification Ref)'
  };

  // Without explicit allowBlankReference option, missing order/notification still throws
  assert.throws(() => preparePermitCreate(blankPermit), /Select a real SAP order or notification/);

  // With allowBlankReference: true, blank references succeed while leaving Auart & Qmtxt blank
  const body = preparePermitCreate(blankPermit, { allowBlankReference: true });
  assert.equal(body.Aufnr, '');
  assert.equal(body.Qmnum, '');
  assert.equal(body.Auart, '');
  assert.equal(body.Qmtxt, '');
  assert.equal(body.Werks, '1002');
  assert.equal(body.CreatorComment, 'Blank Permit (No SAP Order / Notification Ref)');

  const original = odataClient.post;
  try {
    odataClient.post = async (entity, posted) => {
      assert.equal(entity, 'PermitInfo');
      assert.equal(posted.Aufnr, '');
      assert.equal(posted.Qmnum, '');
      assert.equal(posted.Auart, '');
      assert.equal(posted.Qmtxt, '');
      assert.equal(posted.Werks, '1002');
      return { data: { Permit_No: 'PTW0099901', Status: 'CRTD' } };
    };
    const res = await permitCreateApi.createPermitDeepInsert(blankPermit, { allowBlankReference: true });
    assert.equal(res.Permit_No, 'PTW0099901');
  } finally {
    odataClient.post = original;
  }
});

