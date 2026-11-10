import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

const result = await build({
  stdin: {
    contents: `
      export {
        getValidationTarget,
        buildPlantSelectOptions,
        DEFAULT_PLANT_CODE,
        BLANK_PERMIT_AUFNR,
        BLANK_PERMIT_QMNUM,
        BLANK_PERMIT_COMMENT
      } from './src/features/permits/PermitCreateModule';
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
  getValidationTarget,
  buildPlantSelectOptions,
  DEFAULT_PLANT_CODE,
  BLANK_PERMIT_AUFNR,
  BLANK_PERMIT_QMNUM,
  BLANK_PERMIT_COMMENT
} = compiled.exports;

test('Validation Target: Validity period expiration properly maps to Step 2 and field-valid-to-datetime', () => {
  const target = getValidationTarget('The permit validity period has already ended.');
  assert.equal(target.tab, 'general');
  assert.equal(target.stepNumber, 2);
  assert.equal(target.fieldId, 'field-valid-to-datetime');
  assert.equal(target.fieldLabel, 'Permit Expiry Window (Valid To)');
  assert.ok(target.advice.includes('validity period has ended'));
});

test('Validation Target: Validity start/end order and 8-hour max map to Step 2 validity fields', () => {
  const orderTarget = getValidationTarget('Permit end date/time must be after its start.');
  assert.equal(orderTarget.tab, 'general');
  assert.equal(orderTarget.stepNumber, 2);
  assert.equal(orderTarget.fieldId, 'field-valid-to-datetime');

  const eightHourTarget = getValidationTarget('Initial validity must end within eight hours or at shift end, whichever is earlier. Request an authorized extension separately.');
  assert.equal(eightHourTarget.tab, 'general');
  assert.equal(eightHourTarget.stepNumber, 2);
  assert.equal(eightHourTarget.fieldId, 'field-valid-to-datetime');
  assert.ok(eightHourTarget.advice.includes('+8h Max'));

  const startTarget = getValidationTarget('Complete ValidFromD before creating the permit.');
  assert.equal(startTarget.tab, 'general');
  assert.equal(startTarget.stepNumber, 2);
  assert.equal(startTarget.fieldId, 'field-valid-from-datetime');
});

test('Validation Target: Shift end timing maps to Step 3 Section D shift field', () => {
  const shiftTarget = getValidationTarget('Enter valid site times and a shift end after work starts.');
  assert.equal(shiftTarget.tab, 'procedure');
  assert.equal(shiftTarget.stepNumber, 3);
  assert.equal(shiftTarget.fieldId, 'procedure-field-SHFT');
});

test('Validation Target: Missing work selection maps to Step 1', () => {
  const workTarget = getValidationTarget('Select a real SAP order or notification.');
  assert.equal(workTarget.tab, 'work');
  assert.equal(workTarget.stepNumber, 1);
  assert.equal(workTarget.fieldId, 'field-work-selection');
});

test('Validation Target: General permit details map to Step 2 appropriate fields', () => {
  const jobTarget = getValidationTarget('Complete JobDesc before creating the permit.');
  assert.equal(jobTarget.tab, 'general');
  assert.equal(jobTarget.stepNumber, 2);
  assert.equal(jobTarget.fieldId, 'field-job-desc');

  const deptTarget = getValidationTarget('Complete ExecDept before creating the permit.');
  assert.equal(deptTarget.tab, 'general');
  assert.equal(deptTarget.stepNumber, 2);
  assert.equal(deptTarget.fieldId, 'field-exec-dept-container');

  const supvTarget = getValidationTarget('Complete SupvName before creating the permit.');
  assert.equal(supvTarget.tab, 'general');
  assert.equal(supvTarget.stepNumber, 2);
  assert.equal(supvTarget.fieldId, 'field-supv-name');

  const phoneTarget = getValidationTarget('Supervisor Phone: Enter a valid 10-digit mobile number.');
  assert.equal(phoneTarget.tab, 'general');
  assert.equal(phoneTarget.stepNumber, 2);
  assert.equal(phoneTarget.fieldId, 'field-supv-phone');
});

test('Validation Target: Safety roles (Fire Watch, Standby, Rescue, Rigging) map to Step 3 procedure fields', () => {
  const fwName = getValidationTarget('Fire watch person name (FireWatchName) is mandatory for Hot Work operations.');
  assert.equal(fwName.tab, 'procedure');
  assert.equal(fwName.stepNumber, 3);
  assert.equal(fwName.fieldId, 'procedure-field-FWNM');

  const fwPhone = getValidationTarget('Fire watch contact phone is incomplete (7/10 digits). 10 digits required.');
  assert.equal(fwPhone.tab, 'procedure');
  assert.equal(fwPhone.stepNumber, 3);
  assert.equal(fwPhone.fieldId, 'procedure-field-FWCT');

  const sbName = getValidationTarget('Standby person name (StandByName) is mandatory for Confined Space Entry.');
  assert.equal(sbName.tab, 'procedure');
  assert.equal(sbName.stepNumber, 3);
  assert.equal(sbName.fieldId, 'procedure-field-SBNM');

  const sbPhone = getValidationTarget('Standby person contact phone (StandByContact) is mandatory for Confined Space Entry.');
  assert.equal(sbPhone.tab, 'procedure');
  assert.equal(sbPhone.stepNumber, 3);
  assert.equal(sbPhone.fieldId, 'procedure-field-SBCT');

  const rescue = getValidationTarget('Rescue plan reference (RiggingPlanRescuePlan) is mandatory for Confined Space Entry.');
  assert.equal(rescue.tab, 'procedure');
  assert.equal(rescue.stepNumber, 3);
  assert.equal(rescue.fieldId, 'procedure-field-RESC');

  const rigging = getValidationTarget('Rigging plan and approval reference (RiggingPlanRescuePlan) is mandatory for Rigging operations.');
  assert.equal(rigging.tab, 'procedure');
  assert.equal(rigging.stepNumber, 3);
  assert.equal(rigging.fieldId, 'procedure-field-RIGP');
});

test('Validation Target: Crew muster, PPE, hazards and checklists map to their respective steps', () => {
  const workerTarget = getValidationTarget('Add the actual crew and make the crew quantity match the worker list.');
  assert.equal(workerTarget.tab, 'workers');
  assert.equal(workerTarget.stepNumber, 4);
  assert.equal(workerTarget.fieldId, 'field-worker-name');

  const ppeTarget = getValidationTarget('Each PPE item needs its real code and description.');
  assert.equal(ppeTarget.tab, 'ppe');
  assert.equal(ppeTarget.stepNumber, 5);
  assert.equal(ppeTarget.fieldId, 'field-ppe-code');

  const hazardTarget = getValidationTarget('Add the work hazards and required controls.');
  assert.equal(hazardTarget.tab, 'hazards');
  assert.equal(hazardTarget.stepNumber, 6);
  assert.equal(hazardTarget.fieldId, 'field-hazard-desc');

  const prepTarget = getValidationTarget('Review preparation: Gas detector calibrated and verified.');
  assert.equal(prepTarget.tab, 'procedure');
  assert.equal(prepTarget.stepNumber, 3);
  assert.equal(prepTarget.fieldId, 'procedure-prep-checklist');

  const chkTarget = getValidationTarget('Each checklist response requires a QuestionnaireId.');
  assert.equal(chkTarget.tab, 'procedure');
  assert.equal(chkTarget.stepNumber, 3);
  assert.equal(chkTarget.fieldId, 'procedure-chk-modal-btn');
});

test('Validation Target: Incomplete category compliance checklist maps to Step 5 with target button ID', () => {
  const cseTarget = getValidationTarget(
    'Compliance checklist (_CHK) for "Confined space Entry" is incomplete (0/23 questions verified). Complete all questionnaire items before proceeding.',
    'checklist-cat-CSE',
    'ppe'
  );
  assert.equal(cseTarget.tab, 'ppe');
  assert.equal(cseTarget.stepNumber, 5);
  assert.equal(cseTarget.fieldId, 'checklist-cat-CSE');
  assert.ok(cseTarget.fieldLabel.includes('Confined space Entry'));

  const wahTarget = getValidationTarget(
    'Compliance checklist (_CHK) for "Work at height" is incomplete (0/19 questions verified). Complete all questionnaire items before proceeding.',
    'checklist-cat-W@H',
    'ppe'
  );
  assert.equal(wahTarget.tab, 'ppe');
  assert.equal(wahTarget.stepNumber, 5);
  assert.equal(wahTarget.fieldId, 'checklist-cat-W@H');
  assert.ok(wahTarget.fieldLabel.includes('Work at height'));
});

test('Blank Permit & Plant (Werks) dropdown defaults, options, and validation mapping work accurately', () => {
  assert.equal(DEFAULT_PLANT_CODE, '1002');
  assert.equal(BLANK_PERMIT_AUFNR, '-');
  assert.equal(BLANK_PERMIT_QMNUM, '-');
  assert.ok(BLANK_PERMIT_AUFNR.length <= 12, 'SAP PermitInfo.Aufnr maxLength is 12');
  assert.ok(BLANK_PERMIT_QMNUM.length <= 12, 'SAP PermitInfo.Qmnum maxLength is 12');
  assert.ok(BLANK_PERMIT_COMMENT.includes('Blank Permit'));

  assert.deepEqual(buildPlantSelectOptions(), ['1001', '1002']);
  assert.deepEqual(buildPlantSelectOptions('1002'), ['1001', '1002']);
  assert.deepEqual(buildPlantSelectOptions('1001'), ['1001', '1002']);
  assert.deepEqual(buildPlantSelectOptions('1003'), ['1001', '1002', '1003']);

  const werksTarget = getValidationTarget('Plant (Werks) is mandatory. Select the SAP plant code.');
  assert.equal(werksTarget.tab, 'general');
  assert.equal(werksTarget.stepNumber, 2);
  assert.equal(werksTarget.fieldId, 'field-werks');
  assert.equal(werksTarget.fieldLabel, 'Plant (Werks)');

  const schemaWerksTarget = getValidationTarget('Complete Werks before creating the permit.');
  assert.equal(schemaWerksTarget.tab, 'general');
  assert.equal(schemaWerksTarget.fieldId, 'field-werks');
});


