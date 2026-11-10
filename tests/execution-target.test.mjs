import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

const result = await build({
  stdin: {
    contents: `
      export { FALLBACK_CONFIG_DATA, configApi } from './src/core/api/modules/config.api';
      export {
        formatExecutionTarget,
        parseCombinedExecutionTarget,
        normalizeWorkCenterTarget,
        isWorkCenterExecutionTarget,
        isSubPlantRequiredForExecutionTarget
      } from './src/features/permits/PermitCreateModule';
      export { preparePermitCreate } from './src/core/api/modules/permitCreate.validation';
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

const {
  FALLBACK_CONFIG_DATA,
  formatExecutionTarget,
  parseCombinedExecutionTarget,
  normalizeWorkCenterTarget,
  isWorkCenterExecutionTarget,
  isSubPlantRequiredForExecutionTarget,
  preparePermitCreate
} = compiled.exports;

const createValidPayload = (execDept) => ({
  ExecDept: execDept,
  IsolationRequired: 'N',
  GasTestRequired: 'N',
  PermitType: 'COLD',
  Werks: '1000',
  Aufnr: '1',
  JobDesc: 'Routine Maintenance',
  SupvName: 'Supervisor',
  ValidFromD: '2099-01-01',
  ValidFromT: '08:00',
  ValidToD: '2099-01-01',
  ValidToT: '16:00',
  PersonsQty: 1,
  _Worker: [{ WorkerName: 'Worker', WorkerTypeCode: 'EMP', EmpId: '1' }],
  _HazardControl: [{ HazardDesc: 'Hazard 1', ControlDesc: 'Control 1' }]
});

test('Live SAP backend PLANT and DEPARTMENT master data matches exact GFL configuration', () => {
  const depts = FALLBACK_CONFIG_DATA.DEPARTMENT;
  const plants = FALLBACK_CONFIG_DATA.PLANT;

  // 11 SAP departments
  assert.equal(depts.length, 11, 'Should have exactly 11 SAP departments');
  const deptCodes = new Set(depts.map(d => d.Config_Code));
  assert.ok(deptCodes.has('CIVIL'));
  assert.ok(deptCodes.has('ELECTRICAL'));
  assert.ok(deptCodes.has('ENV'));
  assert.ok(deptCodes.has('FIRE'));
  assert.ok(deptCodes.has('INSTRU'));
  assert.ok(deptCodes.has('IT'));
  assert.ok(deptCodes.has('MECH'));
  assert.ok(deptCodes.has('MECH_ROTARY'));
  assert.ok(deptCodes.has('MECH_STATIC'));
  assert.ok(deptCodes.has('PROCESS'));
  assert.ok(deptCodes.has('SAFETY'));

  // 29 SAP plants
  assert.equal(plants.length, 29, 'Should have exactly 29 SAP plants');
  for (const plant of plants) {
    assert.equal(plant.Config_Type, 'PLANT');
    assert.equal(plant.Parent_Code, 'DEPARTMENT', 'Every SAP GFL plant has Parent_Code DEPARTMENT');
    assert.equal(plant.Active, 'X');
    assert.ok(plant.Config_Code.length > 0);
    assert.ok(plant.Config_Desc.length > 0);
  }

  // Key known plants exist
  const plantCodes = new Set(plants.map(p => p.Config_Code));
  assert.ok(plantCodes.has('APTFE_PLANT'));
  assert.ok(plantCodes.has('CA_PLANT'));
  assert.ok(plantCodes.has('CMS_PLANT_1'));
  assert.ok(plantCodes.has('COMMON_POLYMER_UTIL'));
  assert.ok(plantCodes.has('ETP_PLANT'));
  assert.ok(plantCodes.has('HCFC_R22_PLANT'));
  assert.ok(plantCodes.has('TFE_PLANT_1'));
  assert.ok(plantCodes.has('VDF_PLANT'));
});

test('Nested dropdown plant mapping resolves plants for every execution department', () => {
  const plants = FALLBACK_CONFIG_DATA.PLANT;
  const depts = FALLBACK_CONFIG_DATA.DEPARTMENT;

  for (const dept of depts) {
    const matchedDept = depts.find(d => d.Config_Desc === dept.Config_Desc || d.Config_Code === dept.Config_Desc);
    const deptCode = (matchedDept?.Config_Code || dept.Config_Desc).trim().toUpperCase();
    const deptDesc = (matchedDept?.Config_Desc || dept.Config_Desc).trim().toUpperCase();

    const filtered = plants.filter(p => {
      const parent = (p.Parent_Code || '').trim().toUpperCase();
      return (
        parent === 'DEPARTMENT' ||
        parent === deptCode ||
        parent === deptDesc ||
        (matchedDept && parent === matchedDept.Config_Code.trim().toUpperCase())
      );
    });

    assert.equal(filtered.length, 29, `Department ${dept.Config_Code} (${dept.Config_Desc}) should resolve all 29 plants under DEPARTMENT`);
  }
});

test('formatExecutionTarget correctly formats executing plant - department within 40 chars for SAP GFL records', () => {
  // Case 1: Standard plant and department (APTFE PLANT - ELECTRICAL)
  const res1 = formatExecutionTarget('APTFE PLANT', 'ELECTRICAL', 'ELECTRICAL');
  assert.equal(res1, 'APTFE PLANT - ELECTRICAL');
  assert.ok(res1.length <= 40);

  // Case 2: Plant with Civil
  const res2 = formatExecutionTarget('CA PLANT', 'CIVIL', 'CIVIL');
  assert.equal(res2, 'CA PLANT - CIVIL');
  assert.ok(res2.length <= 40);

  // Case 3: Long plant description + long department name (COMMON POLYMER UTILS + PROCESS / OPPERATIONS)
  // 'COMMON POLYMER UTILS' (20) + ' - ' (3) + 'PROCESS / OPPERATIONS' (21) = 44 chars (> 40)
  // With deptCode 'PROCESS': 'COMMON POLYMER UTILS - PROCESS' = 30 chars <= 40!
  const res3 = formatExecutionTarget('COMMON POLYMER UTILS', 'PROCESS / OPPERATIONS', 'PROCESS');
  assert.equal(res3, 'COMMON POLYMER UTILS - PROCESS');
  assert.ok(res3.length <= 40);

  // Case 4: Long plant + MECHANICAL (STATIC) with deptCode MECH_STATIC
  // 'EFFLUENT TREATMENT PLANT' (24) + ' - ' (3) + 'MECHANICAL (STATIC)' (19) = 46 chars (> 40)
  // With deptCode 'MECH_STATIC': 'EFFLUENT TREATMENT PLANT - MECH_STATIC' = 38 chars <= 40!
  const res4 = formatExecutionTarget('EFFLUENT TREATMENT PLANT', 'MECHANICAL (STATIC)', 'MECH_STATIC');
  assert.equal(res4, 'EFFLUENT TREATMENT PLANT - MECH_STATIC');
  assert.ok(res4.length <= 40);

  // Case 5: Only department provided
  const res5 = formatExecutionTarget('', 'ELECTRICAL');
  assert.equal(res5, 'ELECTRICAL');

  // Case 6: Only plant provided
  const res6 = formatExecutionTarget('APTFE PLANT', '');
  assert.equal(res6, 'APTFE PLANT');

  // Case 7: Both empty
  const res7 = formatExecutionTarget('', '');
  assert.equal(res7, '');

  // Case 8: Hard clamp to 40 characters
  const longPlant = 'A'.repeat(30);
  const longDept = 'B'.repeat(30);
  const res8 = formatExecutionTarget(longPlant, longDept);
  assert.equal(res8.length, 40);
  assert.equal(res8, `${longPlant} - ${longDept}`.substring(0, 40));
});

test('preparePermitCreate accepts formatted ExecDept plant - department and enforces 40 char schema limit', () => {
  // Valid formatted ExecDept (<= 40 chars)
  const validExecDept = formatExecutionTarget('APTFE PLANT', 'ELECTRICAL');
  const body = preparePermitCreate(createValidPayload(validExecDept));
  assert.equal(body.ExecDept, 'APTFE PLANT - ELECTRICAL');

  // 40 characters exact
  const exact40 = 'A'.repeat(40);
  const body40 = preparePermitCreate(createValidPayload(exact40));
  assert.equal(body40.ExecDept, exact40);

  // Over 40 characters without formatting should be rejected by SAP schema validator
  const over40 = 'A'.repeat(41);
  assert.throws(() => preparePermitCreate(createValidPayload(over40)), /ExecDept must be at most 40 characters/);
});

test('Work Center (Arbpl) description works as execution target alongside dropdown override', () => {
  const wcDesc = '  ELECTRICAL CMS 1  ';
  const normalized = normalizeWorkCenterTarget(wcDesc);
  assert.equal(normalized, 'ELECTRICAL CMS 1');

  // Clamps descriptions longer than SAP 40-char ExecDept limit
  assert.equal(normalizeWorkCenterTarget('W'.repeat(55)).length, 40);

  // Detects active Work Center target cleanly
  assert.equal(isWorkCenterExecutionTarget('ELECTRICAL CMS 1', '', wcDesc), true);
  assert.equal(isWorkCenterExecutionTarget('ELECTRICAL', 'CMS PLANT 1', wcDesc), false);
  assert.equal(isWorkCenterExecutionTarget('ELECTRICAL', '', wcDesc), false);

  // Exempts Work Center target from mandatory sub-plant prompt while still enforcing it for raw dropdown depts
  assert.equal(isSubPlantRequiredForExecutionTarget({
    execDept: 'ELECTRICAL CMS 1',
    execPlant: '',
    workCenterDesc: wcDesc,
    filteredPlantCount: 29
  }), false);

  assert.equal(isSubPlantRequiredForExecutionTarget({
    execDept: 'ELECTRICAL',
    execPlant: '',
    workCenterDesc: wcDesc,
    filteredPlantCount: 29
  }), true);

  assert.equal(isSubPlantRequiredForExecutionTarget({
    execDept: 'ELECTRICAL',
    execPlant: 'CMS PLANT 1',
    workCenterDesc: wcDesc,
    filteredPlantCount: 29
  }), false);

  // Revision mode preserves existing direct ExecDept target without falsely prompting for sub-plant
  assert.equal(isSubPlantRequiredForExecutionTarget({
    execDept: 'ELECTRICAL CMS 1',
    execPlant: '',
    workCenterDesc: undefined,
    filteredPlantCount: 29,
    revisionExecDept: 'ELECTRICAL CMS 1'
  }), false);

  // Payload serialization accepts Work Center description directly
  const formatted = formatExecutionTarget('', normalized);
  assert.equal(formatted, 'ELECTRICAL CMS 1');
  const body = preparePermitCreate(createValidPayload(formatted));
  assert.equal(body.ExecDept, 'ELECTRICAL CMS 1');
});

test('parseCombinedExecutionTarget preserves plant names containing hyphens such as CPP - COAL', () => {
  assert.deepEqual(parseCombinedExecutionTarget('CMS PLANT 1 - ELECTRICAL'), {
    plant: 'CMS PLANT 1',
    dept: 'ELECTRICAL'
  });
  assert.deepEqual(parseCombinedExecutionTarget('CPP - COAL - ELECTRICAL'), {
    plant: 'CPP - COAL',
    dept: 'ELECTRICAL'
  });
  assert.deepEqual(parseCombinedExecutionTarget('ELECTRICAL CMS 1'), {
    plant: '',
    dept: 'ELECTRICAL CMS 1'
  });
});

