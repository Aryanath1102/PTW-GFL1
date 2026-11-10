import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

const result = await build({
  stdin: {
    contents: `
      export {
        getOffsetDateString,
        getNextDateStr,
        computeShiftValidityPreset
      } from './src/features/permits/PermitCreateModule';
      export { preparePermitCreate } from './src/core/api/modules/permitCreate.validation';
      export { sitePlanRows } from './src/core/ptw/siteProcedure';
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
new Function('require', 'module', 'exports', result.outputFiles[0].text)(
  createRequire(import.meta.url),
  compiled,
  compiled.exports
);

const { getOffsetDateString, getNextDateStr, computeShiftValidityPreset, preparePermitCreate, sitePlanRows } = compiled.exports;

test('Preset Helpers: getOffsetDateString and getNextDateStr calculate accurate dates including month/year boundaries', () => {
  const base = new Date(2026, 10, 5); // 05-11-2026
  assert.equal(getOffsetDateString(0, base), '2026-11-05');
  assert.equal(getOffsetDateString(1, base), '2026-11-06');

  // Month-end rollover
  const monthEnd = new Date(2026, 10, 30); // 30-11-2026
  assert.equal(getOffsetDateString(1, monthEnd), '2026-12-01');

  // getNextDateStr
  assert.equal(getNextDateStr('2026-11-05'), '2026-11-06');
  assert.equal(getNextDateStr('2026-11-30'), '2026-12-01');
  assert.equal(getNextDateStr('2026-12-31'), '2027-01-01');
});

test('Preset Calculation: Day Shift (General) preset sets 09:00 to 17:00 (8h) with shift end 17:30', () => {
  const date = '2026-11-06';
  const preset = computeShiftValidityPreset('DAY', date);

  assert.equal(preset.shiftType, 'DAY');
  assert.equal(preset.shiftCode, 'G');
  assert.equal(preset.validFromD, date);
  assert.equal(preset.validFromT, '09:00:00');
  assert.equal(preset.validToD, date);
  assert.equal(preset.validToT, '17:00:00');
  assert.equal(preset.plannedShiftEnd, `${date}T17:30`);

  // Verify 8-hour duration (17:00 - 09:00 = 8h)
  const start = new Date(`${preset.validFromD}T${preset.validFromT}+05:30`).getTime();
  const end = new Date(`${preset.validToD}T${preset.validToT}+05:30`).getTime();
  assert.equal(end - start, 8 * 3600 * 1000);
});

test('Preset Calculation: Evening Shift preset sets 17:30 to 23:00 (5.5h) same day', () => {
  const date = '2026-11-06';
  const preset = computeShiftValidityPreset('EVENING', date);

  assert.equal(preset.shiftType, 'EVENING');
  assert.equal(preset.shiftCode, 'B');
  assert.equal(preset.validFromD, date);
  assert.equal(preset.validFromT, '17:30:00');
  assert.equal(preset.validToD, date);
  assert.equal(preset.validToT, '23:00:00');
  assert.equal(preset.plannedShiftEnd, `${date}T23:00`);

  // Verify 5.5-hour duration
  const start = new Date(`${preset.validFromD}T${preset.validFromT}+05:30`).getTime();
  const end = new Date(`${preset.validToD}T${preset.validToT}+05:30`).getTime();
  assert.equal(end - start, 5.5 * 3600 * 1000);
});

test('Preset Calculation: Night Shift preset spans midnight to next day (23:00 to 07:00, 8h)', () => {
  const date = '2026-11-06';
  const preset = computeShiftValidityPreset('NIGHT', date);

  assert.equal(preset.shiftType, 'NIGHT');
  assert.equal(preset.shiftCode, 'C');
  assert.equal(preset.validFromD, date);
  assert.equal(preset.validFromT, '23:00:00');
  assert.equal(preset.validToD, '2026-11-07');
  assert.equal(preset.validToT, '07:00:00');
  assert.equal(preset.plannedShiftEnd, '2026-11-07T09:00');

  // Verify 8-hour duration across midnight
  const start = new Date(`${preset.validFromD}T${preset.validFromT}+05:30`).getTime();
  const end = new Date(`${preset.validToD}T${preset.validToT}+05:30`).getTime();
  assert.equal(end - start, 8 * 3600 * 1000);
});

test('Validation Integration: Permits created with Day, Evening, and Night presets pass site procedure rules', () => {
  const makePlan = (shiftEnd) => ({
    additionalTypes: [],
    checks: { P01: 'YES', P02: 'YES', P03: 'YES', P04: 'YES' },
    nature: ['Inspection'],
    tools: ['Hand tools'],
    fields: {
      JSA1: 'JSA-001',
      JSA2: 'Issuer, acceptor and contractor visited site',
      SHFT: shiftEnd,
      ISSR: 'ISSUER1',
      ACCP: 'ACCP1',
      OPER: 'OPER1'
    }
  });

  const basePayload = (shiftEnd) => {
    const plan = makePlan(shiftEnd);
    return {
      ExecDept: 'MAINT',
      PermitType: 'COLD',
      Werks: '1000',
      AreaLoc: 'BOILER_AREA',
      JobDesc: 'Routine valve check',
      Aufnr: '4000123',
      PersonsQty: 1,
      GasTestRequired: 'N',
      IsolationRequired: 'N',
      _Worker: [{ WorkerName: 'John Doe', Craft: 'FITTER' }],
      _HazardControl: [{ HazardDesc: 'Tripping hazard', ControlDesc: 'Clear pathways' }],
      _Safety: sitePlanRows('COLD', plan)
    };
  };

  // 1. Day Shift validation
  const dayPreset = computeShiftValidityPreset('DAY', '2099-05-10');
  assert.doesNotThrow(() => {
    preparePermitCreate({
      ...basePayload(dayPreset.plannedShiftEnd),
      ValidFromD: dayPreset.validFromD,
      ValidFromT: dayPreset.validFromT,
      ValidToD: dayPreset.validToD,
      ValidToT: dayPreset.validToT,
      Shift: dayPreset.shiftCode
    });
  });

  // 2. Evening Shift validation
  const evePreset = computeShiftValidityPreset('EVENING', '2099-05-10');
  assert.doesNotThrow(() => {
    preparePermitCreate({
      ...basePayload(evePreset.plannedShiftEnd),
      ValidFromD: evePreset.validFromD,
      ValidFromT: evePreset.validFromT,
      ValidToD: evePreset.validToD,
      ValidToT: evePreset.validToT,
      Shift: evePreset.shiftCode
    });
  });

  // 3. Night Shift validation
  const nightPreset = computeShiftValidityPreset('NIGHT', '2099-05-10');
  assert.doesNotThrow(() => {
    preparePermitCreate({
      ...basePayload(nightPreset.plannedShiftEnd),
      ValidFromD: nightPreset.validFromD,
      ValidFromT: nightPreset.validFromT,
      ValidToD: nightPreset.validToD,
      ValidToT: nightPreset.validToT,
      Shift: nightPreset.shiftCode
    });
  });
});

test('Isolation Integration: Permit creation accepts linked IsolationNo and rejects invalid nested _Isolation payload', () => {
  const dayPreset = computeShiftValidityPreset('DAY', '2099-05-10');
  const validPayloadWithIso = {
    ExecDept: 'MAINT',
    PermitType: 'COLD',
    Werks: '1000',
    AreaLoc: 'BOILER_AREA',
    JobDesc: 'Routine valve check',
    Aufnr: '4000123',
    PersonsQty: 1,
    GasTestRequired: 'N',
    IsolationRequired: 'Y',
    IsolationNo: 'ISO-2026-9999',
    ValidFromD: dayPreset.validFromD,
    ValidFromT: dayPreset.validFromT,
    ValidToD: dayPreset.validToD,
    ValidToT: dayPreset.validToT,
    Shift: dayPreset.shiftCode,
    _Worker: [{ WorkerName: 'John Doe', Craft: 'FITTER' }],
    _HazardControl: [{ HazardDesc: 'Tripping hazard', ControlDesc: 'Clear pathways' }],
    _Safety: sitePlanRows('COLD', {
      additionalTypes: [],
      checks: { P01: 'YES', P02: 'YES', P03: 'YES', P04: 'YES' },
      nature: ['Inspection'],
      tools: ['Hand tools'],
      fields: {
        JSA1: 'JSA-001',
        JSA2: 'Issuer, acceptor and contractor visited site',
        SHFT: dayPreset.plannedShiftEnd,
        ISSR: 'ISSUER1',
        ACCP: 'ACCP1',
        OPER: 'OPER1'
      }
    })
  };

  // Valid permit payload with linked IsolationNo
  const prepared = preparePermitCreate(validPayloadWithIso);
  assert.equal(prepared.IsolationRequired, 'X');
  assert.equal(prepared.IsolationNo, 'ISO-2026-9999');
  assert.equal(prepared._Isolation, undefined, 'Must not send nested _Isolation to PermitInfo');

  // Verify backend contract enforces rejection if nested _Isolation is passed
  assert.throws(
    () => preparePermitCreate({ ...validPayloadWithIso, _Isolation: [{ ItemNo: '1' }] }),
    /Create isolation certificates with their _Item points/
  );
});

