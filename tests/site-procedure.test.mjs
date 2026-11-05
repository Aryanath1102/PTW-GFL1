import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

const result = await build({
  stdin: { contents: `export * from './src/core/ptw/siteProcedure'; export * from './src/core/api/modules/permitCreate.validation'; export * from './src/core/api/modules/sitePermit.api'; export * from './src/core/api/modules/gasTester.api'; export * from './src/core/api/modules/auditLog.api'; export { odataClient } from './src/core/api/odataClient';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', define: { 'import.meta.env': '{}' },
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const { emptySitePlan, sitePlanRows, preparePermitCreate, preparationsFor, PERMIT_CATEGORIES, approvalGuidance, sitePermitApi, gasTesterApi, auditLogApi, odataClient } = compiled.exports;
const completePlan = () => ({
  ...emptySitePlan(),
  nature: ['Welding / gas cutting'],
  tools: ['Welding machine'],
  fields: {
    JSA1: 'JSA-001',
    JSA2: 'Issuer, acceptor and contractor visited site',
    SHFT: '2099-01-01T16:00',
    ISSR: 'ISSUER',
    ACCP: 'ACCEPTOR',
    OPER: 'OPERATOR',
    OTHR: 'Special work scope',
    FWNM: 'Fire Watcher 01',
    FWCT: '9876543210',
    SBNM: 'Standby Person 01',
    SBCT: '9876543211',
    RESC: 'Rescue Plan RP-01',
    RIGP: 'Rigging Plan RG-01',
    CHEM: 'Nitrogen purge'
  }
});

function payload(primary = 'HOT', plan = completePlan()) {
  return {
    PermitType: primary, Werks: '1000', JobDesc: 'Maintain equipment', SupvName: 'Supervisor', Aufnr: '000000000123', Qmnum: '', AreaLoc: 'Area A', ExecDept: 'Maintenance',
    ValidFromD: '2099-01-01', ValidFromT: '08:00', ValidToD: '2099-01-01', ValidToT: '16:00', GasTestRequired: 'Y', GasTestFreqHr: '2', PersonsQty: 1, IsolationRequired: 'Y',
    FireWatchName: (plan.fields.FWNM || plan.fields.FWAT || '').trim(),
    FireWatchContact: (plan.fields.FWCT || '').trim() || '0',
    StandByName: (plan.fields.SBNM || plan.fields.STBY || '').trim(),
    StandByContact: (plan.fields.SBCT || '').trim() || '0',
    ChemicalContent: (plan.fields.CHEM || '').trim(),
    RiggingPlanRescuePlan: (() => {
      const rig = (plan.fields.RIGP || '').trim();
      const resc = (plan.fields.RESC || '').trim();
      if (rig && resc) return `${rig} / ${resc}`;
      return rig || resc || '';
    })(),
    _Worker: [{ WorkerName: 'Worker', WorkerTypeCode: 'EMP', EmpId: 'W1' }], _HazardControl: [{ HazardDesc: 'Stored energy', ControlDesc: 'Isolate' }],
    _Isolation: [], _Safety: sitePlanRows(primary, plan)
  };
}

test('permit creation allows blank supervisor details and no crew with site procedure completed', () => {
  for (const crew of [[], undefined]) {
    const body = preparePermitCreate({
      ...payload(), SupvName: '', SupvPhone: '', PersonsQty: 0, _Worker: crew
    });
    assert.equal(body.SupvName, '');
    assert.equal(body.SupvPhone, '');
    assert.ok(!('_Worker' in body));
  }
  assert.throws(() => preparePermitCreate({ ...payload(), PersonsQty: 1, _Worker: [] }), /crew quantity/);
  assert.throws(() => preparePermitCreate({
    ...payload(), _Worker: [{ WorkerName: '', WorkerTypeCode: 'EMP', EmpId: 'W1' }]
  }), /Each worker needs/);
});

test('every procedure category and combined work fits the SAP creation schema without fabricated signatures', () => {
  for (const category of PERMIT_CATEGORIES) {
    const plan = completePlan(); plan.additionalTypes = ['HOT', 'CONF', 'EXCV', 'HGHT', 'LINE', 'RIGG', 'RAD', 'HYPN', 'ELEC', 'OTHER'];
    const body = preparePermitCreate(payload(category.code, plan));
    assert.equal(body.Status, 'INTD');
    assert.ok(body._Safety.some(row => row.ItemCode === 'DOCV'));
    assert.equal(body._Safety.find(row => row.ItemCode === 'JSA1').ReferenceNo, 'JSA-001');
    assert.ok(body._Safety.some(row => row.ItemCode === 'FC02'));
    assert.ok(body._Safety.every(row => row.VerifiedBy === '' && row.VerifiedAt === null));
    assert.equal(new Set(body._Safety.map(row => row.ItemNo)).size, body._Safety.length);
    for (const key of ['_Approval', '_GasTest', '_ShiftRenewal', '_AuditLog']) assert.ok(!(key in body));
  }
});

test('confined space entry maps CONF to CSE in outbound SAP payload and accepts CSE directly', () => {
  const plan = completePlan();
  const bodyConf = preparePermitCreate(payload('CONF', plan));
  assert.equal(bodyConf.PermitType, 'CSE');

  const bodyCse = preparePermitCreate(payload('CSE', plan));
  assert.equal(bodyCse.PermitType, 'CSE');
  assert.throws(() => preparePermitCreate({ ...payload('CSE', plan), IsolationRequired: 'N' }), /positive isolation/);
  assert.throws(() => preparePermitCreate({ ...payload('CSE', plan), GasTestFreqHr: '8' }), /two hours/);
});

test('primary permit type and multiple additional work categories are mapped to SAP child table _WorkType', () => {
  // Single category (primary only, no additional categories): primary permit type is passed in _WorkType
  const singlePlan = completePlan();
  const singleBody = preparePermitCreate(payload('HOT', singlePlan));
  assert.equal(singleBody.PermitType, 'HOT');
  assert.ok(Array.isArray(singleBody._WorkType));
  assert.equal(singleBody._WorkType.length, 1);
  assert.deepEqual(singleBody._WorkType, [
    { SeqNo: '1', WorkType: 'HOT' }
  ]);

  // Multiple categories selected in Section A: primary HOT, additional CONF (CSE) and EXCV
  const multiPlan = completePlan();
  multiPlan.additionalTypes = ['CONF', 'EXCV'];
  const multiBody = preparePermitCreate(payload('HOT', multiPlan));
  assert.equal(multiBody.PermitType, 'HOT');
  assert.ok(Array.isArray(multiBody._WorkType));
  assert.equal(multiBody._WorkType.length, 3);
  assert.deepEqual(multiBody._WorkType, [
    { SeqNo: '1', WorkType: 'HOT' },
    { SeqNo: '2', WorkType: 'CSE' },
    { SeqNo: '3', WorkType: 'EXCV' }
  ]);

  // Explicit payload._WorkType takes precedence with sequential SeqNo
  const explicitBody = preparePermitCreate({
    ...payload('COLD', singlePlan),
    _WorkType: [
      { WorkType: 'COLD' },
      { WorkType: 'ELEC' }
    ]
  });
  assert.equal(explicitBody.PermitType, 'COLD');
  assert.deepEqual(explicitBody._WorkType, [
    { SeqNo: '1', WorkType: 'COLD' },
    { SeqNo: '2', WorkType: 'ELEC' }
  ]);
});

test('compliance checklist responses across categories are validated and serialized into SAP child table _CHK', () => {
  const plan = completePlan();

  // Omitted when empty
  const emptyBody = preparePermitCreate(payload('HOT', plan));
  assert.equal(emptyBody._CHK, undefined);

  // Serialized with uppercase answer, mapped SAP permit type, and trimmed fields
  const bodyWithChk = preparePermitCreate({
    ...payload('HOT', plan),
    _CHK: [
      {
        QuestionnaireId: 'Q001',
        PermitType: 'HOT',
        Answer: 'YES',
        Remarks: 'Fire blankets inspected'
      },
      {
        QuestionnaireId: 'Q002',
        PermitType: 'CONF', // Maps to CSE
        Answer: 'no', // Normalizes to NO
        Remarks: 'Forced air blower pending'
      },
      {
        QuestionnaireId: 'Q003',
        PermitType: 'CSE',
        Answer: 'NA',
        Remarks: ''
      }
    ]
  });

  assert.ok(Array.isArray(bodyWithChk._CHK));
  assert.equal(bodyWithChk._CHK.length, 3);
  assert.deepEqual(bodyWithChk._CHK, [
    {
      QuestionnaireId: 'Q001',
      PermitType: 'HOT',
      Answer: 'YES',
      Remarks: 'Fire blankets inspected'
    },
    {
      QuestionnaireId: 'Q002',
      PermitType: 'CSE',
      Answer: 'NO',
      Remarks: 'Forced air blower pending'
    },
    {
      QuestionnaireId: 'Q003',
      PermitType: 'CSE',
      Answer: 'NA',
      Remarks: ''
    }
  ]);
  assert.ok(!bodyWithChk._Safety.some(r => r.ItemCode?.startsWith('Q')), 'Compliance checklist items must not be added to _Safety entity');

  // Validation: Missing QuestionnaireId rejected
  assert.throws(() => preparePermitCreate({
    ...payload('HOT', plan),
    _CHK: [{ QuestionnaireId: '', PermitType: 'HOT', Answer: 'YES', Remarks: '' }]
  }), /QuestionnaireId/);

  // Validation: Missing Answer rejected
  assert.throws(() => preparePermitCreate({
    ...payload('HOT', plan),
    _CHK: [{ QuestionnaireId: 'Q001', PermitType: 'HOT', Answer: '', Remarks: '' }]
  }), /Answer/);

  // Validation: Duplicate composite key (PermitType + QuestionnaireId) rejected
  assert.throws(() => preparePermitCreate({
    ...payload('HOT', plan),
    _CHK: [
      { QuestionnaireId: 'Q001', PermitType: 'HOT', Answer: 'YES', Remarks: '' },
      { QuestionnaireId: 'Q001', PermitType: 'HOT', Answer: 'NO', Remarks: '' }
    ]
  }), /Duplicate _CHK/);
});

test('initial site validity checks eight-hour and actual shift boundaries, including midnight', () => {
  assert.doesNotThrow(() => preparePermitCreate(payload()));
  assert.throws(() => preparePermitCreate({ ...payload(), ValidToT: '16:01' }), /eight hours/);
  const early = completePlan(); early.fields.SHFT = '2099-01-01T15:45';
  assert.throws(() => preparePermitCreate(payload('HOT', early)), /shift end/);
  const overnight = completePlan(); overnight.fields.SHFT = '2099-01-02T06:00';
  assert.doesNotThrow(() => preparePermitCreate({ ...payload('HOT', overnight), ValidFromT: '22:00', ValidToD: '2099-01-02', ValidToT: '06:00' }));
  overnight.fields.SHFT = '2099-02-30T06:00';
  assert.throws(() => preparePermitCreate(payload('HOT', overnight)), /valid site times/);
});

test('combined activities cannot bypass gas interval or isolation planning checks', () => {
  const plan = completePlan(); plan.additionalTypes = ['CONF'];
  assert.throws(() => preparePermitCreate({ ...payload('COLD', plan), GasTestFreqHr: '8' }), /two hours/);
  assert.throws(() => preparePermitCreate({ ...payload('CONF'), IsolationRequired: 'N' }), /positive isolation/);
  assert.equal(preparePermitCreate({ ...payload(), _Isolation: [] }).Status, 'INTD');
});

test('issuer separation, JSA reference, mandatory scope and NA reasons are checked', () => {
  const plan = completePlan(); plan.fields.ACCP = 'issuer';
  assert.throws(() => preparePermitCreate(payload('HOT', plan)), /different people/);
  plan.fields.ACCP = 'OTHER'; plan.fields.JSA1 = '';
  assert.throws(() => preparePermitCreate(payload('HOT', plan)), /JSA document/);
  plan.fields.JSA1 = 'J1'; plan.checks.F004 = { response: 'NA', remarks: '' };
  assert.throws(() => preparePermitCreate(payload('HOT', plan)), /not applicable/);
  plan.checks.F004.remarks = 'No process equipment opened';
  assert.doesNotThrow(() => preparePermitCreate(payload('HOT', plan)));
  assert.throws(() => preparePermitCreate({ ...payload(), AreaLoc: '' }), /work area/);
});

test('changing category excludes obsolete conditional data but preserves shared preparation', () => {
  const plan = completePlan(); plan.fields.STBY = 'Standby A'; plan.checks.FC02 = { response: 'YES', remarks: 'Entry plan ready' };
  assert.ok(sitePlanRows('CONF', plan).some(row => row.ItemCode === 'STBY'));
  assert.ok(!sitePlanRows('COLD', plan).some(row => row.ItemCode === 'STBY' || row.ItemCode === 'FC02'));
  assert.ok(preparationsFor(['COLD']).some(row => row.code === 'F001'));
});

test('new general safety category fits SAP and retains reported evidence', () => {
  const p = payload(); p._Safety.push({ Category: 'GEN', ItemCode: 'S001', ValueText: 'Additional preparation', Response: 'NO', Remarks: 'Pending' });
  assert.equal(preparePermitCreate(p)._Safety.find(row => row.ItemCode === 'S001').Category, 'GEN');
});

test('approval planning respects time boundaries and exposes unresolved routes', () => {
  assert.match(approvalGuidance(['CONF'], '22:59')[0], /Approvers I and II/);
  assert.match(approvalGuidance(['CONF'], '23:00')[0], /Approver III/);
  assert.match(approvalGuidance(['HOT'], '08:59')[0], /Approver II/);
  assert.match(approvalGuidance(['HOT'], '09:00')[0], /Approvers I and II/);
  assert.match(approvalGuidance(['RAD'], '17:30')[0], /Approvers I and II/);
  assert.match(approvalGuidance(['LINE'], '12:00')[0], /conflict/);
  assert.match(approvalGuidance(['HOT'], 'bad')[0], /start time/);
});

test('gas evaluation never silently chooses disputed thresholds or accepts invalid readings', () => {
  const reading = { oxygenPct: 20.9, flammableLelPct: 0, h2sPpm: 0, coPpm: 0 };
  assert.equal(gasTesterApi.validateLimits(reading).safe, false);
  const limits = { minOxygen: 19.5, maxOxygen: 23.5, maxFlammableLel: 0, maxH2sPpm: 0, maxCoPpm: 0 };
  assert.equal(gasTesterApi.validateLimits(reading, limits).safe, true);
  for (const value of [NaN, Infinity, -1, undefined]) assert.equal(gasTesterApi.validateLimits({ ...reading, coPpm: value }, limits).safe, false);
  assert.equal(gasTesterApi.validateLimits({ ...reading, flammableLelPct: 1 }, limits).safe, false);
  assert.equal(gasTesterApi.validateLimits(reading, { ...limits, minOxygen: 30 }).safe, false);
  assert.equal(gasTesterApi.validateLimits({}, limits).safe, false);
});

test('calibration errors, absent flags, wrong device and expiry never produce calibrated=true', async () => {
  const original = odataClient.get;
  try {
    odataClient.get = async () => { throw new Error('Unavailable'); };
    assert.deepEqual(await gasTesterApi.getDeviceCalibration('M1'), { deviceId: 'M1', validUntil: '', isCalibrated: false });
    for (const data of [{}, { DeviceId: 'M1', IsCalibrated: true, ValidUntil: '2000-01-01' }, { DeviceId: 'M2', IsCalibrated: true, ValidUntil: '2099-01-01' }]) {
      odataClient.get = async () => ({ data }); assert.equal((await gasTesterApi.getDeviceCalibration('M1')).isCalibrated, false);
    }
    odataClient.get = async () => ({ data: { DeviceId: 'M1', IsCalibrated: true, ValidUntil: '2099-01-01' } });
    assert.equal((await gasTesterApi.getDeviceCalibration('M1')).isCalibrated, true);
  } finally { odataClient.get = original; }
});

test('SAP record read uses metadata field names and escapes OData literals', async () => {
  const original = odataClient.get; const calls = [];
  try {
    odataClient.get = async url => { calls.push(url); return { data: { value: [], Permit_No: 'P1' } }; };
    await sitePermitApi.list('1000', "O'Brien", 25);
    const url = new URL(calls[0], 'http://local/');
    assert.match(url.searchParams.get('$filter'), /Werks eq '1000'/);
    assert.match(url.searchParams.get('$filter'), /O''Brien/);
    assert.equal(url.searchParams.get('$skip'), '25');
    await sitePermitApi.read("P'1");
    assert.match(decodeURIComponent(calls[1]), /PermitInfo\('P''1'\)/);
    assert.ok(!new URL(calls[1], 'http://local/').searchParams.get('$expand').includes('_GasTest'));
    assert.ok(!new URL(calls[1], 'http://local/').searchParams.get('$expand').includes('_AuditLog'));
    assert.ok(new URL(calls[1], 'http://local/').searchParams.get('$expand').includes('_Isolation($expand=_Item)'));
    assert.ok(new URL(calls[1], 'http://local/').searchParams.get('$expand').includes('_WorkType'));
    assert.ok(new URL(calls[1], 'http://local/').searchParams.get('$expand').includes('_CHK'));
    assert.ok(new URL(calls[1], 'http://local/').searchParams.get('$expand').includes('_Equipment'));
    assert.ok(new URL(calls[1], 'http://local/').searchParams.get('$expand').includes('_NATW'));
    assert.equal(calls[2], 'GasTest');
    assert.doesNotMatch(calls[1], /GasTests|Hazards|PpeItems/);
    odataClient.get = async () => ({ data: {} });
    await assert.rejects(sitePermitApi.list('', ''), /permit list/);
    await assert.rejects(sitePermitApi.read('P1'), /requested permit/);
  } finally { odataClient.get = original; }
});

test('nature of work and tools/equipment are serialized into SAP child tables _NATW and _Equipment with unique ItemNo keys', () => {
  const plan = completePlan();
  plan.nature = ['Welding / gas cutting', 'Opening line / equipment'];
  plan.tools = ['Welding machine', 'Gas cylinders / cutting set'];
  const body = preparePermitCreate(payload('HOT', plan));

  assert.ok(Array.isArray(body._NATW));
  assert.equal(body._NATW.length, 2);
  assert.deepEqual(body._NATW, [
    { ItemNo: '1', NatwCode: 'WELD', NatwDesc: 'Welding / gas cutting', OtherText: '' },
    { ItemNo: '2', NatwCode: 'OPEN_LINE', NatwDesc: 'Opening line / equipment', OtherText: '' }
  ]);

  assert.ok(Array.isArray(body._Equipment));
  assert.equal(body._Equipment.length, 2);
  assert.deepEqual(body._Equipment, [
    { ItemNo: '1', EquipCode: 'WELD_MCH', EquipDesc: 'Welding machine', OtherText: '' },
    { ItemNo: '2', EquipCode: 'GAS_CYL', EquipDesc: 'Gas cylinders / cutting set', OtherText: '' }
  ]);

  // Explicit payload with single item and custom text
  const explicitBody = preparePermitCreate({
    ...payload('HOT', completePlan()),
    _NATW: [
      { NatwCode: 'WELD', NatwDesc: 'Welding / gas cutting', OtherText: 'Field pipe weld' }
    ],
    _Equipment: [
      { EquipCode: 'WELD_MCH', EquipDesc: 'Welding machine', OtherText: 'Inverter 400A' }
    ]
  });
  assert.equal(explicitBody._NATW.length, 1);
  assert.equal(explicitBody._NATW[0].ItemNo, '1');
  assert.equal(explicitBody._NATW[0].OtherText, 'Field pipe weld');
  assert.equal(explicitBody._Equipment.length, 1);
  assert.equal(explicitBody._Equipment[0].ItemNo, '1');
  assert.equal(explicitBody._Equipment[0].OtherText, 'Inverter 400A');
});

test('other checkboxes in nature and tools capture user input into OtherText and _Safety', () => {
  const plan = completePlan();
  plan.nature = ['Welding / gas cutting', 'Other'];
  plan.tools = ['Welding machine', 'Other'];
  plan.fields.OTHER_NATURE = 'Refractory lining repair';
  plan.fields.OTHER_TOOLS = 'Special diamond wire cutter';

  const body = preparePermitCreate(payload('HOT', plan));

  assert.ok(Array.isArray(body._NATW));
  assert.equal(body._NATW.length, 2);
  const otherNatw = body._NATW.find(n => n.NatwCode === 'OTHER');
  assert.ok(otherNatw);
  assert.equal(otherNatw.OtherText, 'Refractory lining repair');
  assert.equal(otherNatw.NatwDesc, 'Other: Refractory lining repair');

  assert.ok(Array.isArray(body._Equipment));
  assert.equal(body._Equipment.length, 2);
  const otherEquip = body._Equipment.find(e => e.EquipCode === 'OTHER');
  assert.ok(otherEquip);
  assert.equal(otherEquip.OtherText, 'Special diamond wire cutter');
  assert.equal(otherEquip.EquipDesc, 'Other: Special diamond wire cutter');

  // Verify _Safety row contains the specific user input
  assert.ok(body._Safety.some(s => s.ItemCode === 'NATR' && s.Remarks === 'Other: Refractory lining repair'));
  assert.ok(body._Safety.some(s => s.ItemCode === 'TOOL' && s.Remarks === 'Other: Special diamond wire cutter'));
});

test('legacy gas writes cannot silently persist a manufactured pass flag', async () => {
  await assert.rejects(gasTesterApi.recordTest({}), /SAP workflow action/);
});

test('special safety roles and plan references are validated and serialized into OData payload', () => {
  const plan = completePlan();

  // 1. Valid payload serializes all 6 fields
  const body = preparePermitCreate(payload('HOT', plan));
  assert.equal(body.FireWatchName, 'Fire Watcher 01');
  assert.equal(body.FireWatchContact, '9876543210');
  assert.equal(body.StandByName, 'Standby Person 01');
  assert.equal(body.StandByContact, '9876543211');
  assert.equal(body.ChemicalContent, 'Nitrogen purge');
  assert.equal(body.RiggingPlanRescuePlan, 'Rigging Plan RG-01 / Rescue Plan RP-01');

  // 2. Default contacts serialize as "0" when not applicable (e.g. COLD permit)
  const defaultContactPayload = payload('COLD', plan);
  defaultContactPayload.FireWatchContact = '0';
  defaultContactPayload.StandByContact = '0';
  const serializedDefaults = preparePermitCreate(defaultContactPayload);
  assert.equal(serializedDefaults.FireWatchContact, '0');
  assert.equal(serializedDefaults.StandByContact, '0');

  // 3. Hot work enforces mandatory FireWatchName and mandatory 10-digit FireWatchContact
  const noFwPayload = payload('HOT', plan);
  noFwPayload.FireWatchName = '';
  noFwPayload._Safety = noFwPayload._Safety.filter(r => r.ItemCode !== 'FWNM' && r.ItemCode !== 'FWAT');
  assert.throws(() => preparePermitCreate(noFwPayload), /FireWatchName/);

  const noFwPhonePayload = payload('HOT', plan);
  noFwPhonePayload.FireWatchContact = '0';
  noFwPhonePayload._Safety = noFwPhonePayload._Safety.filter(r => r.ItemCode !== 'FWCT');
  assert.throws(() => preparePermitCreate(noFwPhonePayload), /FireWatchContact/);

  // 4. Confined Space Entry enforces mandatory StandByName, StandByContact and Rescue plan
  const confPlan = completePlan();
  const confPayload = payload('CONF', confPlan);
  confPayload.StandByName = '';
  confPayload._Safety = confPayload._Safety.filter(r => r.ItemCode !== 'SBNM' && r.ItemCode !== 'STBY');
  assert.throws(() => preparePermitCreate(confPayload), /StandByName/);

  const confNoPhonePayload = payload('CONF', confPlan);
  confNoPhonePayload.StandByContact = '0';
  confNoPhonePayload._Safety = confNoPhonePayload._Safety.filter(r => r.ItemCode !== 'SBCT');
  assert.throws(() => preparePermitCreate(confNoPhonePayload), /StandByContact/);

  const confNoRescuePayload = payload('CONF', confPlan);
  confNoRescuePayload.RiggingPlanRescuePlan = '';
  confNoRescuePayload._Safety = confNoRescuePayload._Safety.filter(r => r.ItemCode !== 'RESC');
  assert.throws(() => preparePermitCreate(confNoRescuePayload), /Rescue plan/);

  // 5. Rigging enforces mandatory Rigging plan
  const rigPlan = completePlan();
  const rigPayload = payload('RIGG', rigPlan);
  rigPayload.RiggingPlanRescuePlan = '';
  rigPayload._Safety = rigPayload._Safety.filter(r => r.ItemCode !== 'RIGP');
  assert.throws(() => preparePermitCreate(rigPayload), /Rigging plan/);

  // 6. 10-digit phone number validation for FireWatchContact and StandByContact (< 10 digits rejected)
  const invalidFwPhone = payload('HOT', plan);
  invalidFwPhone.FireWatchContact = '9825';
  assert.throws(() => preparePermitCreate(invalidFwPhone), /10 digits required/);

  const invalidSbPhone = payload('CONF', confPlan);
  invalidSbPhone.StandByContact = '12345';
  assert.throws(() => preparePermitCreate(invalidSbPhone), /10 digits required/);
});

test('AuditLog is queried directly from standalone AuditLog entity set and sorted chronologically without fallback mock data', async () => {
  const original = odataClient.get;
  const calls = [];
  try {
    odataClient.get = async (url) => {
      calls.push(url);
      if (url.includes('AuditLog')) {
        return {
          data: {
            value: [
              {
                PermitNo: 'PTW0000085',
                AuditId: '025C0C2FEE661FE1B4D6795455BDE994',
                Action: 'CREATE',
                NewStatus: '',
                Actor: 'VERTIF-V',
                EventAt: '2026-10-28T09:41:46.966958Z',
                Comments: 'CREATE: 1 field(s) changed.'
              },
              {
                PermitNo: 'PTW0000085',
                AuditId: '025C0C2FEE661FE1B4D730EEA217E994',
                Action: 'GAS_CREATE',
                NewStatus: 'CRTD',
                Actor: 'VERTIF-V',
                EventAt: '2026-10-28T10:22:51.794988Z',
                Comments: 'Gas Test record(s) created'
              }
            ]
          }
        };
      }
      return { data: { value: [] } };
    };

    const logs = await auditLogApi.getAuditLogs('PTW0000085');
    assert.equal(logs.length, 2);
    // Should sort newest first (GAS_CREATE at 10:22 before CREATE at 09:41)
    assert.equal(logs[0].Action, 'GAS_CREATE');
    assert.equal(logs[1].Action, 'CREATE');
    assert.match(calls[0], /AuditLog/);
    assert.match(decodeURIComponent(calls[0]), /PermitNo(\+| )eq(\+| )'PTW0000085'/);

    // Test empty response returns [] without fake records
    calls.length = 0;
    odataClient.get = async () => ({ data: { value: [] } });
    const emptyLogs = await auditLogApi.getAuditLogs('PTW0000099');
    assert.deepEqual(emptyLogs, []);

    // Test error returns [] without fake records
    odataClient.get = async () => { throw new Error('SAP Gateway 500'); };
    const errorLogs = await auditLogApi.getAuditLogs('PTW0000099');
    assert.deepEqual(errorLogs, []);
  } finally {
    odataClient.get = original;
  }
});

