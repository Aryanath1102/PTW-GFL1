import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ entryPoints: ['src/core/ptw/permitClearanceLevels.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' });
const mod = { exports: {} };
new Function('module', 'exports', result.outputFiles[0].text)(mod, mod.exports);
const { getPermitClearanceLevels: summarize } = mod.exports;
const record = (SeqNo, RoleId, Action, Comments = '') => ({ SeqNo: String(SeqNo), RoleId, Action, Comments, SignedBy: 'TEST_USER', Stage: 'APPR' });
const approvals = [record(1, 'PTW_APPR1', 'AP'), record(2, 'PTW_APPR2', 'AP')];
const permit = records => ({ Status: 'REJT', PermitType: 'HOT', GasTestRequired: 'X', _Approval: records });

test('completed approvers remain green when Acceptor rejects; full remarks are retained', () => {
  const remarks = 'Work area not ready. Barricading and toolbox talk must be completed before acceptance.';
  const value = summarize(permit([...approvals, record(3, 'PTW_ACCP', 'RJ', remarks)]));
  assert.equal(value.approver.status, 'APPROVED');
  assert.equal(value.approver.isRejected, false);
  assert.match(value.approver.detailText, /Approver 1 and Approver 2/);
  assert.equal(value.accepter.status, 'REJECTED');
  assert.match(value.accepter.badgeClass, /rose/);
  assert.ok(value.accepter.detailText.includes(remarks));
  assert.ok(value.nextActionText.includes(remarks));
  assert.equal(value.areaOperator.status, 'BLOCKED');
  assert.equal(value.areaOperator.isRejected, false);
  assert.equal(value.completedCount, 1);
});

test('explicit acceptor action takes precedence over generic APPR stage', () => {
  const value = summarize(permit([...approvals, record(3, '', 'RJA', 'Not ready')]));
  assert.equal(value.accepter.isRejected, true);
  assert.equal(value.approver.isComplete, true);
});

test('Area Operator rejection preserves prior approval and acceptance', () => {
  const value = summarize(permit([...approvals, record(3, 'PTW_ACCP', 'AC'), record(4, 'PTW_AREA_OPP', 'RAO', 'Site unsafe')]));
  assert.equal(value.approver.isComplete, true);
  assert.equal(value.accepter.isComplete, true);
  assert.equal(value.areaOperator.status, 'REJECTED');
  assert.match(value.areaOperator.detailText, /Site unsafe/);
});

test('approver rejection marks only that stage red', () => {
  const value = summarize(permit([record(1, 'PTW_APPR1', 'RJ', 'Revise isolation')]));
  assert.equal(value.approver.status, 'REJECTED');
  assert.match(value.approver.detailText, /Revise isolation/);
  assert.equal(value.accepter.isRejected, false);
});

test('missing rejection history does not falsely blame an approver', () => {
  const value = summarize(permit([]));
  assert.equal(value.overallCurrentLevel, 'REJECTED');
  assert.equal(value.approver.isRejected, false);
  assert.match(value.nextActionText, /No rejection remarks recorded/);
});

test('latest rejection is selected by cycle and sequence, not response order', () => {
  const value = summarize(permit([
    { ...record(3, 'PTW_ACCP', 'RJ', 'Current remarks'), CycleNo: 2 },
    { ...record(1, 'PTW_APPR1', 'RJ', 'Old remarks'), CycleNo: 1 },
  ]));
  assert.match(value.accepter.detailText, /Current remarks/);
  assert.doesNotMatch(value.nextActionText, /Old remarks/);
});

test('resubmitted permit does not display historical rejection as current', () => {
  const value = summarize({ ...permit([record(3, 'PTW_ACCP', 'RJA', 'Old rejection')]), Status: 'APPR' });
  assert.equal(value.approver.status, 'APPROVED');
  assert.equal(value.accepter.status, 'PENDING');
  assert.doesNotMatch(value.nextActionText, /Old rejection/);
});

test('not-required gas is excluded from both completion numerator and denominator', () => {
  const value = summarize({ Status: 'ACTV', PermitType: 'COLD', GasTestRequired: '' });
  assert.equal(value.completedCount, 3);
  assert.equal(value.totalApplicableLevels, 3);
});
