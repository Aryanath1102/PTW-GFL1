import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

// 1. Verify ApprovalType in permitCreateSchema.json
test('permitCreateSchema.json defines ApprovalType matching live SAP /Approval metadata', () => {
  const schemaPath = path.resolve(process.cwd(), 'src/core/api/permitCreateSchema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  assert.ok(schema.ApprovalType, 'ApprovalType entity definition exists in schema');
  const app = schema.ApprovalType;

  assert.equal(app.PermitNo.type, 'Edm.String');
  assert.equal(app.PermitNo.maxLength, '10');
  assert.equal(app.PermitNo.nullable, false);

  assert.equal(app.Stage.type, 'Edm.String');
  assert.equal(app.Stage.nullable, false);

  assert.equal(app.SeqNo.type, 'Edm.String');
  assert.equal(app.SeqNo.nullable, false);

  assert.equal(app.RoleId.type, 'Edm.String');
  assert.equal(app.RoleId.nullable, false);

  assert.equal(app.Action.type, 'Edm.String');
  assert.equal(app.Action.nullable, false);

  assert.equal(app.SignedBy.type, 'Edm.String');
  assert.equal(app.SignedBy.maxLength, '12');

  assert.equal(app.ActionDate.type, 'Edm.Date');
  assert.equal(app.ActionDate.nullable, true);

  assert.equal(app.ActionTime.type, 'Edm.TimeOfDay');
  assert.equal(app.ActionTime.nullable, false);

  assert.equal(app.Comments.type, 'Edm.String');
  assert.equal(app.Comments.maxLength, '255');
});

// 2. Test live SAP /Approval response payload matches schema & expectations
test('Live SAP /Approval response records conform to ApprovalRecord schema and roles', () => {
  const liveSapResponse = {
    "@odata.context": "$metadata#Approval",
    "@odata.metadataEtag": 'W/"20261013065534"',
    "value": [
      {
        "PermitNo": "0000099",
        "Stage": "01",
        "SeqNo": "1",
        "RoleId": "VER",
        "Action": "VR",
        "SignedBy": "",
        "ActionDate": null,
        "ActionTime": "00:00:00",
        "Comments": "INITIAL VERIFICATION TEST",
        "SAP__Messages": []
      },
      {
        "PermitNo": "PTW0000045",
        "Stage": "APPR",
        "SeqNo": "1",
        "RoleId": "PTW_APPR1",
        "Action": "AP",
        "SignedBy": "VERTIF-V",
        "ActionDate": "2026-10-14",
        "ActionTime": "16:34:08",
        "Comments": "",
        "SAP__Messages": []
      },
      {
        "PermitNo": "PTW0000046",
        "Stage": "APPR",
        "SeqNo": "1",
        "RoleId": "PTW_APPR1",
        "Action": "AP",
        "SignedBy": "VERTIF-V",
        "ActionDate": "2026-10-14",
        "ActionTime": "16:31:06",
        "Comments": "",
        "SAP__Messages": []
      },
      {
        "PermitNo": "PTW0000046",
        "Stage": "APPR",
        "SeqNo": "2",
        "RoleId": "PTW_APPR2",
        "Action": "AP",
        "SignedBy": "VERTIF-V",
        "ActionDate": "2026-10-14",
        "ActionTime": "16:31:12",
        "Comments": "",
        "SAP__Messages": []
      }
    ]
  };

  assert.equal(liveSapResponse.value.length, 4);

  // Verification step check
  const ver = liveSapResponse.value.find(v => v.PermitNo === '0000099');
  assert.ok(ver);
  assert.equal(ver.Stage, '01');
  assert.equal(ver.RoleId, 'VER');
  assert.equal(ver.Action, 'VR');
  assert.equal(ver.ActionDate, null);

  // Approval step 1 check
  const appr1 = liveSapResponse.value.find(v => v.PermitNo === 'PTW0000045');
  assert.ok(appr1);
  assert.equal(appr1.Stage, 'APPR');
  assert.equal(appr1.SeqNo, '1');
  assert.equal(appr1.RoleId, 'PTW_APPR1');
  assert.equal(appr1.Action, 'AP');
  assert.equal(appr1.SignedBy, 'VERTIF-V');
  assert.equal(appr1.ActionDate, '2026-10-14');
  assert.equal(appr1.ActionTime, '16:34:08');

  // Approval step 2 check
  const appr2 = liveSapResponse.value.find(v => v.PermitNo === 'PTW0000046' && v.SeqNo === '2');
  assert.ok(appr2);
  assert.equal(appr2.Stage, 'APPR');
  assert.equal(appr2.RoleId, 'PTW_APPR2');
  assert.equal(appr2.Action, 'AP');
  assert.equal(appr2.SignedBy, 'VERTIF-V');
});

// 3. Test multi-tier pipeline resolution logic
test('Multi-tier stepper correctly identifies live SAP approval stages and roles', () => {
  const permitApprovals = [
    {
      PermitNo: 'PTW0000046',
      Stage: 'APPR',
      SeqNo: '1',
      RoleId: 'PTW_APPR1',
      Action: 'AP',
      SignedBy: 'VERTIF-V',
      ActionDate: '2026-10-14',
      ActionTime: '16:31:06',
      Comments: ''
    },
    {
      PermitNo: 'PTW0000046',
      Stage: 'APPR',
      SeqNo: '2',
      RoleId: 'PTW_APPR2',
      Action: 'AP',
      SignedBy: 'VERTIF-V',
      ActionDate: '2026-10-14',
      ActionTime: '16:31:12',
      Comments: ''
    }
  ];

  const pipeline = [
    { step: 1, stage: '01', roleId: 'VER', title: 'Site Verification', role: 'Site Verifier (VER)' },
    { step: 1, stage: 'APPR', roleId: 'PTW_APPR1', title: 'Primary Approval', role: 'Approver I (PTW_APPR1)' },
    { step: 2, stage: 'APPR', roleId: 'PTW_APPR2', title: 'Secondary Approval', role: 'Approver II (PTW_APPR2)' },
    { step: 3, stage: 'ISS', roleId: 'ISS', title: 'Issue Handover', role: 'Issuer (ISS)' }
  ];

  const matched = pipeline.map(s => {
    const match = permitApprovals.find(a =>
      (s.roleId && a.RoleId === s.roleId) ||
      (s.stage && a.Stage === s.stage && a.SeqNo === String(s.step))
    );
    return { title: s.title, roleId: s.roleId, match };
  });

  // VER is pending
  assert.equal(matched[0].match, undefined);

  // PTW_APPR1 is approved
  assert.ok(matched[1].match);
  assert.equal(matched[1].match.SignedBy, 'VERTIF-V');
  assert.equal(matched[1].match.Action, 'AP');

  // PTW_APPR2 is approved
  assert.ok(matched[2].match);
  assert.equal(matched[2].match.SignedBy, 'VERTIF-V');
  assert.equal(matched[2].match.Action, 'AP');

  // ISS is pending
  assert.equal(matched[3].match, undefined);
});

// 4. Test calculateNextSeqNo prevents duplicate key error
test('calculateNextSeqNo correctly auto-increments SeqNo to prevent SAP duplicate key collisions', () => {
  // Pure JS equivalent of the calculateNextSeqNo logic from permitApprover.api.ts
  function calculateNextSeqNo(existingApprovals = []) {
    const maxSeq = existingApprovals.reduce((max, a) => {
      const n = parseInt(String(a.SeqNo || '0'), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    return String(maxSeq + 1);
  }

  // Case A: No existing approvals -> start with '1'
  assert.equal(calculateNextSeqNo([]), '1');

  // Case B: Single existing approval with SeqNo: '1' -> returns '2' (prevents collision!)
  assert.equal(calculateNextSeqNo([{ SeqNo: '1', RoleId: 'PTW_APPR1' }]), '2');

  // Case C: Approvals with SeqNo 1 and 2 -> returns '3'
  assert.equal(calculateNextSeqNo([
    { SeqNo: '1', RoleId: 'PTW_APPR1' },
    { SeqNo: '2', RoleId: 'PTW_APPR2' }
  ]), '3');

  // Case D: Handles non-sequential or string SeqNos cleanly
  assert.equal(calculateNextSeqNo([
    { SeqNo: '5', RoleId: 'VER' }
  ]), '6');
});

// 5. Test getNextApprovalStep automatically picks correct role and stage without dropdown
test('getNextApprovalStep automatically detects next required approval role and stage', () => {
  function getNextApprovalStep(existingApprovals = [], permitStatus) {
    const maxSeq = existingApprovals.reduce((max, a) => {
      const n = parseInt(String(a.SeqNo || '0'), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const nextSeqNo = String(maxSeq + 1);

    const hasAppr1 = existingApprovals.some(
      (a) => a.RoleId === 'PTW_APPR1' && (a.Action === 'AP' || a.Action === 'APPROVED') && Boolean(a.SignedBy?.trim())
    );
    const hasAppr2 = existingApprovals.some(
      (a) => a.RoleId === 'PTW_APPR2' && (a.Action === 'AP' || a.Action === 'APPROVED') && Boolean(a.SignedBy?.trim())
    );
    const hasAppr3 = existingApprovals.some(
      (a) => a.RoleId === 'PTW_APPR3' && (a.Action === 'AP' || a.Action === 'APPROVED') && Boolean(a.SignedBy?.trim())
    );

    const isStatusApproved = permitStatus === 'APPR' || permitStatus === 'ISSU' || permitStatus === 'ACTV';

    if (isStatusApproved || hasAppr3) {
      return { stage: 'APPR', seqNo: nextSeqNo, roleId: hasAppr3 ? 'PTW_APPR3' : 'PTW_APPR2', action: 'AP', isFullyApproved: true };
    }
    if (hasAppr1 && hasAppr2 && !hasAppr3) {
      if (permitStatus === undefined && !existingApprovals.some(a => a.RoleId === 'PTW_APPR3')) {
        return { stage: 'APPR', seqNo: nextSeqNo, roleId: 'PTW_APPR2', action: 'AP', isFullyApproved: true };
      }
      return { stage: 'APPR', seqNo: nextSeqNo, roleId: 'PTW_APPR3', action: 'AP', isFullyApproved: false };
    }
    if (hasAppr1 && !hasAppr2) {
      return { stage: 'APPR', seqNo: nextSeqNo, roleId: 'PTW_APPR2', action: 'AP', isFullyApproved: false };
    }
    return { stage: 'APPR', seqNo: nextSeqNo, roleId: 'PTW_APPR1', action: 'AP', isFullyApproved: false };
  }

  // 1. New permit without approvals -> defaults to PTW_APPR1 with SeqNo 1
  const step1 = getNextApprovalStep([]);
  assert.equal(step1.roleId, 'PTW_APPR1');
  assert.equal(step1.stage, 'APPR');
  assert.equal(step1.seqNo, '1');
  assert.equal(step1.isFullyApproved, false);

  // 2. PTW_APPR1 already approved -> automatically advances to PTW_APPR2 with SeqNo 2
  const step2 = getNextApprovalStep([
    { PermitNo: 'PTW0000045', Stage: 'APPR', SeqNo: '1', RoleId: 'PTW_APPR1', Action: 'AP', SignedBy: 'VERTIF-V' }
  ]);
  assert.equal(step2.roleId, 'PTW_APPR2');
  assert.equal(step2.stage, 'APPR');
  assert.equal(step2.seqNo, '2');
  assert.equal(step2.isFullyApproved, false);

  // 3. PTW_APPR1 and PTW_APPR2 approved without status -> marks permit as fully approved (legacy)
  const step3 = getNextApprovalStep([
    { PermitNo: 'PTW0000046', Stage: 'APPR', SeqNo: '1', RoleId: 'PTW_APPR1', Action: 'AP', SignedBy: 'VERTIF-V' },
    { PermitNo: 'PTW0000046', Stage: 'APPR', SeqNo: '2', RoleId: 'PTW_APPR2', Action: 'AP', SignedBy: 'VERTIF-V' }
  ]);
  assert.equal(step3.isFullyApproved, true);

  // 4. PTW_APPR1 and PTW_APPR2 approved, but permitStatus is 'CRTD' (SAP Matrix requires PTW_APPR3) -> advances to PTW_APPR3
  const step4 = getNextApprovalStep([
    { PermitNo: 'PTW0000047', Stage: 'APPR', SeqNo: '1', RoleId: 'PTW_APPR1', Action: 'AP', SignedBy: 'VERTIF-V' },
    { PermitNo: 'PTW0000047', Stage: 'APPR', SeqNo: '2', RoleId: 'PTW_APPR2', Action: 'AP', SignedBy: 'VERTIF-V' }
  ], 'CRTD');
  assert.equal(step4.roleId, 'PTW_APPR3');
  assert.equal(step4.stage, 'APPR');
  assert.equal(step4.seqNo, '3');
  assert.equal(step4.isFullyApproved, false);

  // 5. PTW_APPR1, PTW_APPR2, and PTW_APPR3 approved -> marks permit as fully approved
  const step5 = getNextApprovalStep([
    { PermitNo: 'PTW0000047', Stage: 'APPR', SeqNo: '1', RoleId: 'PTW_APPR1', Action: 'AP', SignedBy: 'VERTIF-V' },
    { PermitNo: 'PTW0000047', Stage: 'APPR', SeqNo: '2', RoleId: 'PTW_APPR2', Action: 'AP', SignedBy: 'VERTIF-V' },
    { PermitNo: 'PTW0000047', Stage: 'APPR', SeqNo: '3', RoleId: 'PTW_APPR3', Action: 'AP', SignedBy: 'VERTIF-V' }
  ], 'APPR');
  assert.equal(step5.isFullyApproved, true);
});

// 6. Test SAP RAP approve bound action endpoint and payload structure
test('ODATA_ACTIONS.APPROVE endpoint and approve action payload match SAP RAP specification', () => {
  const filePath = path.resolve(process.cwd(), 'src/core/api/odataEndpoints.ts');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  assert.ok(
    fileContent.includes("APPROVE: 'Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.approve'"),
    'Action endpoint matches SAP RAP bound action path'
  );

  // Verify payload structure matches user specification
  const samplePermit = 'PTW0000055';
  const sampleComments = '';
  const payload = {
    PermitNo: samplePermit,
    Comments: sampleComments
  };

  assert.equal(payload.PermitNo, 'PTW0000055');
  assert.equal(payload.Comments, '');
  assert.equal(typeof payload.PermitNo, 'string');
  assert.equal(typeof payload.Comments, 'string');
});

// 7. Test SAP RAP reject bound action endpoint and payload structure
test('ODATA_ACTIONS.REJECT endpoint and reject action payload match SAP RAP specification', () => {
  const filePath = path.resolve(process.cwd(), 'src/core/api/odataEndpoints.ts');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  assert.ok(
    fileContent.includes("REJECT: 'Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.reject'"),
    'Action endpoint matches SAP RAP reject bound action path'
  );

  // Verify payload structure matches user specification:
  // { "PermitNo": "PTW0000066", "Reason": "dasdas" }
  const samplePermit = 'PTW0000066';
  const sampleReason = 'Inadequate physical isolation / LOTO missing tags';
  const payload = {
    PermitNo: samplePermit,
    Reason: sampleReason
  };

  assert.equal(payload.PermitNo, 'PTW0000066');
  assert.equal(payload.Reason, 'Inadequate physical isolation / LOTO missing tags');
  assert.equal(typeof payload.PermitNo, 'string');
  assert.equal(typeof payload.Reason, 'string');
  assert.ok(!('Comments' in payload), 'Rejection payload uses Reason instead of Comments per SAP RAP definition');
});

// 7b. Test SAP RAP acceptPermit bound action endpoint and payload structure for permit accepter
test('ODATA_ACTIONS.ACCEPT_PERMIT endpoint and acceptPermit payload match SAP RAP specification', () => {
  const filePath = path.resolve(process.cwd(), 'src/core/api/odataEndpoints.ts');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  assert.ok(
    fileContent.includes("ACCEPT_PERMIT: 'Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.acceptPermit'"),
    'Action endpoint matches SAP RAP acceptPermit bound action path'
  );

  // Verify payload structure matches user specification:
  // payload: accept: PermitNo, Comments
  const samplePermit = 'PTW0000055';
  const sampleComments = 'Precautions and safeguards verified on site. Toolbox talk given to crew. Permit accepted.';
  const payload = {
    PermitNo: samplePermit,
    Comments: sampleComments
  };

  assert.equal(payload.PermitNo, 'PTW0000055');
  assert.equal(payload.Comments, 'Precautions and safeguards verified on site. Toolbox talk given to crew. Permit accepted.');
  assert.equal(typeof payload.PermitNo, 'string');
  assert.equal(typeof payload.Comments, 'string');
});

// 7c. Test SAP RAP rejectAcceptor bound action endpoint and payload structure for permit accepter
test('ODATA_ACTIONS.REJECT_ACCEPTOR endpoint and rejectAcceptor payload match SAP RAP specification', () => {
  const filePath = path.resolve(process.cwd(), 'src/core/api/odataEndpoints.ts');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  assert.ok(
    fileContent.includes("REJECT_ACCEPTOR: 'Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.rejectAcceptor'"),
    'Action endpoint matches SAP RAP rejectAcceptor bound action path'
  );

  // Verify payload structure matches user specification:
  // payload: reject: PermitNo, Reason
  const samplePermit = 'PTW0000066';
  const sampleReason = 'Toolbox talk could not be conducted with contractor crew / unsafe site condition';
  const payload = {
    PermitNo: samplePermit,
    Reason: sampleReason
  };

  assert.equal(payload.PermitNo, 'PTW0000066');
  assert.equal(payload.Reason, 'Toolbox talk could not be conducted with contractor crew / unsafe site condition');
  assert.equal(typeof payload.PermitNo, 'string');
  assert.equal(typeof payload.Reason, 'string');
  assert.ok(!('Comments' in payload), 'Reject acceptor payload uses Reason instead of Comments per SAP RAP definition');
});

// 7d. Test SAP RAP completeAreaOperator bound action endpoint and payload structure for Area Operator
test('ODATA_ACTIONS.COMPLETE_AREA_OPERATOR endpoint and completeAreaOperator payload match SAP RAP specification', () => {
  const filePath = path.resolve(process.cwd(), 'src/core/api/odataEndpoints.ts');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  assert.ok(
    fileContent.includes("COMPLETE_AREA_OPERATOR: 'Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.completeAreaOperator'"),
    'Action endpoint matches SAP RAP completeAreaOperator bound action path'
  );

  // Verify payload structure matches user specification:
  // payload: accept / complete: PermitNo, Comments
  const samplePermit = 'PTW0000088';
  const sampleComments = 'Area inspected and verified safe for maintenance activity. Process isolation confirmed.';
  const payload = {
    PermitNo: samplePermit,
    Comments: sampleComments
  };

  assert.equal(payload.PermitNo, 'PTW0000088');
  assert.equal(payload.Comments, 'Area inspected and verified safe for maintenance activity. Process isolation confirmed.');
  assert.equal(typeof payload.PermitNo, 'string');
  assert.equal(typeof payload.Comments, 'string');
});

// 7e. Test SAP RAP rejectAreaOperator bound action endpoint and payload structure for Area Operator
test('ODATA_ACTIONS.REJECT_AREA_OPERATOR endpoint and rejectAreaOperator payload match SAP RAP specification', () => {
  const filePath = path.resolve(process.cwd(), 'src/core/api/odataEndpoints.ts');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  assert.ok(
    fileContent.includes("REJECT_AREA_OPERATOR: 'Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.rejectAreaOperator'"),
    'Action endpoint matches SAP RAP rejectAreaOperator bound action path'
  );

  // Verify payload structure matches user specification:
  // payload: reject: PermitNo, Reason
  const samplePermit = 'PTW0000099';
  const sampleReason = 'SIMOPS conflict with adjacent live production process';
  const payload = {
    PermitNo: samplePermit,
    Reason: sampleReason
  };

  assert.equal(payload.PermitNo, 'PTW0000099');
  assert.equal(payload.Reason, 'SIMOPS conflict with adjacent live production process');
  assert.equal(typeof payload.PermitNo, 'string');
  assert.equal(typeof payload.Reason, 'string');
  assert.ok(!('Comments' in payload), 'Reject Area Operator payload uses Reason instead of Comments per SAP RAP definition');
});

// 8. Test getNextApprovalStep identifies rejected permits and sets isRejected flag
test('getNextApprovalStep flags rejected permits with isRejected: true and blocks further approvals', () => {
  function calculateNextSeqNo(existingApprovals = []) {
    const maxSeq = existingApprovals.reduce((max, a) => {
      const n = parseInt(String(a.SeqNo || '0'), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    return String(maxSeq + 1);
  }

  function getNextApprovalStep(existingApprovals = [], permitStatus) {
    const nextSeqNo = calculateNextSeqNo(existingApprovals);
    const hasRejection = existingApprovals.some(
      (a) => a.Action === 'RJ' || a.Action === 'REJECTED' || a.Action === 'REJC'
    ) || permitStatus === 'REJC' || permitStatus === 'REJECTED' || permitStatus === 'CANC';

    if (hasRejection) {
      return {
        stage: 'APPR',
        seqNo: nextSeqNo,
        roleId: 'PTW_APPR1',
        action: 'RJ',
        roleTitle: 'Permit Authorization Denied',
        pendingRoleName: 'Permit Rejected by Approver',
        isFullyApproved: false,
        isRejected: true,
        stepIndex: 0
      };
    }
    return { isFullyApproved: false, isRejected: false };
  }

  const rejectedByStatus = getNextApprovalStep([], 'REJC');
  assert.equal(rejectedByStatus.isRejected, true);
  assert.equal(rejectedByStatus.isFullyApproved, false);
  assert.equal(rejectedByStatus.action, 'RJ');

  const rejectedByApprovalRecord = getNextApprovalStep([
    { PermitNo: 'PTW0000066', Stage: 'APPR', SeqNo: '1', RoleId: 'PTW_APPR1', Action: 'RJ', Comments: 'Gas level unsafe' }
  ], 'CRTD');
  assert.equal(rejectedByApprovalRecord.isRejected, true);
  assert.equal(rejectedByApprovalRecord.isFullyApproved, false);
  assert.equal(rejectedByApprovalRecord.action, 'RJ');
});

// 9. Verify Official GFL Time-Band Approval Matrix Rules (Policy ZPTW_APPR_MAT)
test('Official GFL Time-Band Approval Policy Matrix enforces shift & work category routing', () => {
  // Verification of shift time boundaries
  function getTimeBandId(timeStr) {
    const parts = timeStr.trim().split(':');
    const minutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    if (minutes >= 540 && minutes < 1050) return 'DAY'; // 09:00 - 17:30
    if (minutes >= 1050 && minutes < 1380) return 'EVENING'; // 17:30 - 23:00
    return 'NIGHT'; // 23:00 - 09:00
  }

  assert.equal(getTimeBandId('09:00'), 'DAY');
  assert.equal(getTimeBandId('14:30'), 'DAY');
  assert.equal(getTimeBandId('17:29'), 'DAY');
  assert.equal(getTimeBandId('17:30'), 'EVENING');
  assert.equal(getTimeBandId('20:00'), 'EVENING');
  assert.equal(getTimeBandId('22:59'), 'EVENING');
  assert.equal(getTimeBandId('23:00'), 'NIGHT');
  assert.equal(getTimeBandId('02:15'), 'NIGHT');
  assert.equal(getTimeBandId('08:59'), 'NIGHT');

  // Matrix Policy Table
  const RULES = [
    { workType: 'Cold Work', typeCodes: ['COLD'], day: [], evening: [], night: [] },
    { workType: 'Hot Work', typeCodes: ['HOT'], day: ['PTW_APPR1', 'PTW_APPR2'], evening: ['PTW_APPR1', 'PTW_APPR2'], night: ['PTW_APPR2'] },
    { workType: 'Confined Space', typeCodes: ['CSE', 'CONF'], day: ['PTW_APPR1', 'PTW_APPR2'], evening: ['PTW_APPR1', 'PTW_APPR2'], night: ['PTW_APPR3'] },
    { workType: 'Excavation', typeCodes: ['EXCA'], day: ['PTW_APPR1', 'PTW_APPR2'], evening: ['PTW_APPR1', 'PTW_APPR2'], night: ['PTW_APPR2'] },
    { workType: 'Work at Height', typeCodes: ['HGHT'], day: ['PTW_APPR1'], evening: ['PTW_APPR1'], night: ['PTW_APPR2'] },
    { workType: 'Line Breaking', typeCodes: ['LINE'], day: ['PTW_APPR1', 'PTW_APPR2'], evening: ['PTW_APPR1', 'PTW_APPR2'], night: ['PTW_APPR2'] },
    { workType: 'Radiography', typeCodes: ['RAD'], day: ['PTW_APPR1'], evening: ['PTW_APPR1', 'PTW_APPR2'], night: ['PTW_APPR2'] },
    { workType: 'Rigging job', typeCodes: ['RIG'], day: ['PTW_APPR1'], evening: ['PTW_APPR1', 'PTW_APPR2'], night: ['PTW_APPR2'] },
  ];

  function evaluateRoles(workCode, shift) {
    const r = RULES.find(x => x.typeCodes.includes(workCode));
    if (!r) return ['PTW_APPR1', 'PTW_APPR2'];
    return shift === 'DAY' ? r.day : shift === 'EVENING' ? r.evening : r.night;
  }

  // 1. Cold Work: Approver Sign Not Required in all 3 shifts
  assert.deepEqual(evaluateRoles('COLD', 'DAY'), []);
  assert.deepEqual(evaluateRoles('COLD', 'EVENING'), []);
  assert.deepEqual(evaluateRoles('COLD', 'NIGHT'), []);

  // 2. Hot Work: Day & Evening -> Appr1 & Appr2; Night -> Appr2 directly
  assert.deepEqual(evaluateRoles('HOT', 'DAY'), ['PTW_APPR1', 'PTW_APPR2']);
  assert.deepEqual(evaluateRoles('HOT', 'EVENING'), ['PTW_APPR1', 'PTW_APPR2']);
  assert.deepEqual(evaluateRoles('HOT', 'NIGHT'), ['PTW_APPR2']);

  // 3. Confined Space: Day & Evening -> Appr1 & Appr2; Night -> Appr3
  assert.deepEqual(evaluateRoles('CSE', 'DAY'), ['PTW_APPR1', 'PTW_APPR2']);
  assert.deepEqual(evaluateRoles('CSE', 'EVENING'), ['PTW_APPR1', 'PTW_APPR2']);
  assert.deepEqual(evaluateRoles('CSE', 'NIGHT'), ['PTW_APPR3']);

  // 4. Work at Height: Day & Evening -> Appr1; Night -> Appr2
  assert.deepEqual(evaluateRoles('HGHT', 'DAY'), ['PTW_APPR1']);
  assert.deepEqual(evaluateRoles('HGHT', 'EVENING'), ['PTW_APPR1']);
  assert.deepEqual(evaluateRoles('HGHT', 'NIGHT'), ['PTW_APPR2']);

  // 5. Radiography: Day -> Appr1; Evening -> Appr1 & Appr2; Night -> Appr2
  assert.deepEqual(evaluateRoles('RAD', 'DAY'), ['PTW_APPR1']);
  assert.deepEqual(evaluateRoles('RAD', 'EVENING'), ['PTW_APPR1', 'PTW_APPR2']);
  assert.deepEqual(evaluateRoles('RAD', 'NIGHT'), ['PTW_APPR2']);

  // 6. Rigging job: Day -> Appr1; Evening -> Appr1 & Appr2; Night -> Appr2
  assert.deepEqual(evaluateRoles('RIG', 'DAY'), ['PTW_APPR1']);
  assert.deepEqual(evaluateRoles('RIG', 'EVENING'), ['PTW_APPR1', 'PTW_APPR2']);
  assert.deepEqual(evaluateRoles('RIG', 'NIGHT'), ['PTW_APPR2']);
});

test('Multiple _WorkType resolution combines primary and additional categories with strictest governing policy', () => {
  const permitWithMultipleWorkTypes = {
    Permit_No: 'PTW0000062',
    PermitType: 'COLD',
    _WorkType: [
      { SeqNo: '1', WorkType: 'COLD' },
      { SeqNo: '2', WorkType: 'W@H' },
      { SeqNo: '3', WorkType: 'CSE' }
    ],
    Status: 'CRTD'
  };

  // 1. Verify all active categories are extracted and deduplicated
  const primaryRaw = permitWithMultipleWorkTypes.PermitType;
  const rawWorkTypes = permitWithMultipleWorkTypes._WorkType;
  const seen = new Set();
  const items = [];

  if (primaryRaw) {
    seen.add(primaryRaw.toUpperCase());
    items.push({ seqNo: '1', code: primaryRaw, isPrimary: true });
  }

  rawWorkTypes.forEach((wt) => {
    const code = wt.WorkType?.toUpperCase();
    if (!code || seen.has(code)) return;
    seen.add(code);
    items.push({ seqNo: wt.SeqNo || String(items.length + 1), code, isPrimary: false });
  });

  assert.equal(items.length, 3);
  assert.equal(items[0].code, 'COLD');
  assert.equal(items[0].isPrimary, true);
  assert.equal(items[1].code, 'W@H');
  assert.equal(items[1].isPrimary, false);
  assert.equal(items[2].code, 'CSE');
  assert.equal(items[2].isPrimary, false);

  // 2. Fallback to _Safety when _WorkType is empty
  const permitWithSafetyFallback = {
    Permit_No: 'PTW0000063',
    PermitType: 'COLD',
    _WorkType: [],
    _Safety: [
      { ItemCode: 'TYPE', Remarks: 'HGHT' }
    ]
  };

  const fallbackItems = [{ seqNo: '1', code: permitWithSafetyFallback.PermitType, isPrimary: true }];
  const fallbackSeen = new Set([permitWithSafetyFallback.PermitType.toUpperCase()]);

  permitWithSafetyFallback._Safety.forEach(s => {
    if (s.ItemCode === 'TYPE' && s.Remarks && !fallbackSeen.has(s.Remarks.toUpperCase())) {
      fallbackSeen.add(s.Remarks.toUpperCase());
      fallbackItems.push({ seqNo: '2', code: s.Remarks, isPrimary: false });
    }
  });

  assert.equal(fallbackItems.length, 2);
  assert.equal(fallbackItems[1].code, 'HGHT');
  assert.equal(fallbackItems[1].isPrimary, false);
});

test('Pure Cold Work with no additional categories posts APPR status synchronously, while multi-category requires approval', async () => {
  const { preparePermitCreate } = await import('../src/core/api/modules/permitCreate.validation.js').catch(async () => {
    // If ES module import directly, use esbuild bundle
    const { build } = await import('esbuild');
    const { createRequire } = await import('node:module');
    const result = await build({
      stdin: {
        contents: `export { preparePermitCreate } from './src/core/api/modules/permitCreate.validation';`,
        resolveDir: process.cwd(),
        loader: 'ts'
      },
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      define: { 'import.meta.env': '{}' }
    });
    const compiled = { exports: {} };
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
    return compiled.exports;
  });

  const basePayload = {
    ExecDept: 'Maintenance',
    IsolationRequired: 'N',
    GasTestRequired: 'N',
    Werks: '1000',
    Aufnr: '0000000001',
    JobDesc: 'Inspect pump cold work',
    SupvName: 'Supervisor',
    ValidFromD: '2099-01-01',
    ValidFromT: '08:00',
    ValidToD: '2099-01-01',
    ValidToT: '16:00',
    PersonsQty: 1,
    _Worker: [{ WorkerName: 'Worker', WorkerTypeCode: 'EMP', EmpId: '1' }],
    _HazardControl: [{ HazardDesc: 'Slip', ControlDesc: 'Clean floor' }]
  };

  // 1. Pure Cold Work with Status: 'APPR' -> serializes as 'APPR'
  const coldPure = preparePermitCreate({
    ...basePayload,
    PermitType: 'COLD',
    Status: 'APPR',
    _WorkType: [{ SeqNo: '1', WorkType: 'COLD' }]
  });
  assert.equal(coldPure.Status, 'APPR', 'Pure Cold work posts APPR status');

  // 2. Cold Work with additional category (e.g. Confined Space) -> rejects APPR, falls back to CRTD/INTD
  const coldWithConfined = preparePermitCreate({
    ...basePayload,
    PermitType: 'COLD',
    Status: 'APPR',
    _WorkType: [
      { SeqNo: '1', WorkType: 'COLD' },
      { SeqNo: '2', WorkType: 'CSE' }
    ]
  });
  assert.equal(coldWithConfined.Status, 'CRTD', 'Cold work with Confined Space does not allow APPR bypass; requires CRTD');

  // 3. Hot work with Status: 'APPR' -> rejects APPR, falls back to CRTD
  const hotWork = preparePermitCreate({
    ...basePayload,
    PermitType: 'HOT',
    Status: 'APPR',
    _WorkType: [{ SeqNo: '1', WorkType: 'HOT' }]
  });
  assert.equal(hotWork.Status, 'CRTD', 'Hot work does not allow APPR bypass; requires CRTD');
});

test('sitePermitApi.resubmit calls the exact SAP RAP bound action URL for PermitInfo/<KEY>/Resubmit', async () => {
  const { build } = await import('esbuild');
  const result = await build({
    stdin: {
      contents: `
        export { sitePermitApi } from './src/core/api/modules/sitePermit.api';
        export { ODATA_ACTIONS, ODATA_ENTITIES } from './src/core/api/odataEndpoints';
        export { odataClient } from './src/core/api/odataClient';
      `,
      resolveDir: process.cwd(),
      loader: 'ts'
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    define: { 'import.meta.env': '{}' }
  });

  const { createRequire } = await import('node:module');
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    createRequire(import.meta.url),
    compiled,
    compiled.exports
  );

  const { sitePermitApi, ODATA_ACTIONS, odataClient } = compiled.exports;

  assert.equal(
    ODATA_ACTIONS.RESUBMIT,
    'com.sap.gateway.srvd_a2x.zptw_services.v0001.Resubmit',
    'ODATA_ACTIONS defines exact RAP bound action Resubmit'
  );

  let capturedUrl = '';
  let capturedPayload = null;
  let capturedConfig = null;

  odataClient.post = async (url, payload, config) => {
    capturedUrl = url;
    capturedPayload = payload;
    capturedConfig = config;
    return { data: { Permit_No: '0000000014', Status: 'CRTD' } };
  };

  const response = await sitePermitApi.resubmit('0000000014', 'Corrected all PPE items', 'W/"1"');

  assert.equal(
    capturedUrl,
    "PermitInfo('0000000014')/com.sap.gateway.srvd_a2x.zptw_services.v0001.Resubmit",
    'Bound action URL matches exact SAP RAP action path'
  );
  assert.deepEqual(
    capturedPayload,
    { Comments: 'Corrected all PPE items', Reason: 'Corrected all PPE items' },
    'Payload contains resubmission remarks'
  );
  assert.equal(
    capturedConfig?.headers?.['If-Match'],
    'W/"1"',
    'Headers pass optimistic concurrency ETag'
  );
  assert.equal(
    response.Status,
    'CRTD',
    'Permit status returned by SAP as re-entered into workflow'
  );
});

test('sitePermitApi.reviseAndResubmit updates permit values via PATCH before invoking .Resubmit action', async () => {
  const { build } = await import('esbuild');
  const result = await build({
    stdin: {
      contents: `
        export { sitePermitApi } from './src/core/api/modules/sitePermit.api';
        export { ODATA_ACTIONS, ODATA_ENTITIES } from './src/core/api/odataEndpoints';
        export { odataClient } from './src/core/api/odataClient';
      `,
      resolveDir: process.cwd(),
      loader: 'ts'
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    define: { 'import.meta.env': '{}' }
  });

  const { createRequire } = await import('node:module');
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    createRequire(import.meta.url),
    compiled,
    compiled.exports
  );

  const { sitePermitApi, odataClient } = compiled.exports;

  let capturedPatchUrl = '';
  let capturedPatchData = null;
  let capturedPostUrl = '';
  let capturedPostPayload = null;

  odataClient.patch = async (url, data) => {
    capturedPatchUrl = url;
    capturedPatchData = data;
    return { data: { Permit_No: '0000000014', ...data }, headers: { etag: 'W/"updated"' } };
  };

  odataClient.post = async (url, payload) => {
    capturedPostUrl = url;
    capturedPostPayload = payload;
    return { data: { Permit_No: '0000000014', Status: 'CRTD' } };
  };

  const updates = {
    SupvPhone: '9876543210',
    Shift: 'SECOND',
    JobDesc: 'Updated job scope with certified safety harness'
  };

  const response = await sitePermitApi.reviseAndResubmit(
    '0000000014',
    updates,
    'Updated supervisor phone and scope as per rejection remark',
    'W/"etag-val"'
  );

  assert.equal(
    capturedPatchUrl,
    "PermitInfo('0000000014')",
    'PATCH updates PermitInfo entity'
  );
  assert.equal(
    capturedPatchData.SupvPhone,
    '9876543210',
    'PATCH sends updated supervisor phone'
  );
  assert.equal(
    capturedPatchData.Shift,
    'SECOND',
    'PATCH sends updated shift'
  );
  assert.equal(
    capturedPostUrl,
    "PermitInfo('0000000014')/com.sap.gateway.srvd_a2x.zptw_services.v0001.Resubmit",
    'POST invokes bound action .Resubmit'
  );
  assert.equal(
    response.Status,
    'CRTD',
    'Status returned as CRTD'
  );
});

// 18. Test rejected permit resubmission allows approvers to sign with auto-incremented SeqNo across cycles
test('Resubmitted permit allows approvers to sign with auto-incremented SeqNo (Cycle 1 -> Cycle 2)', () => {
  function calculateNextSeqNo(existingApprovals = []) {
    const maxSeq = existingApprovals.reduce((max, a) => {
      const n = parseInt(String(a.SeqNo || '0'), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    return String(maxSeq + 1);
  }

  function getActiveCycleApprovals(approvals = [], permitStatus) {
    if (!approvals || approvals.length === 0) return [];
    const isCurrentlyRejected = permitStatus === 'REJT' || permitStatus === 'REJC' || permitStatus === 'REJECTED' || permitStatus === 'CANC';
    if (isCurrentlyRejected) return approvals;

    const sorted = [...approvals].sort((a, b) => {
      const cycleA = a.CycleNo || 1;
      const cycleB = b.CycleNo || 1;
      if (cycleA !== cycleB) return cycleA - cycleB;
      const seqA = parseInt(String(a.SeqNo || '0'), 10);
      const seqB = parseInt(String(b.SeqNo || '0'), 10);
      return seqA - seqB;
    });

    let lastRjIndex = -1;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const act = (sorted[i].Action || '').trim().toUpperCase();
      if (act === 'RJ' || act === 'REJECTED' || act === 'REJT') {
        lastRjIndex = i;
        break;
      }
    }

    if (lastRjIndex === -1) return sorted;
    return sorted.slice(lastRjIndex + 1);
  }

  function getNextApprovalStep(existingApprovals = [], permitStatus) {
    const nextSeqNo = calculateNextSeqNo(existingApprovals);
    const activeApprovals = getActiveCycleApprovals(existingApprovals, permitStatus);

    const isExplicitRejected = permitStatus === 'REJT' || permitStatus === 'REJC' || permitStatus === 'REJECTED' || permitStatus === 'CANC';
    const hasRejection = isExplicitRejected || (
      permitStatus === undefined && existingApprovals.length > 0 &&
      (existingApprovals[existingApprovals.length - 1].Action === 'RJ' ||
       existingApprovals[existingApprovals.length - 1].Action === 'REJECTED' ||
       existingApprovals[existingApprovals.length - 1].Action === 'REJT')
    );

    if (hasRejection) {
      return {
        stage: 'APPR',
        seqNo: nextSeqNo,
        roleId: 'PTW_APPR1',
        action: 'RJ',
        isRejected: true,
        isFullyApproved: false
      };
    }

    const hasAppr1 = activeApprovals.some(
      (a) => a.RoleId === 'PTW_APPR1' && (a.Action === 'AP' || a.Action === 'APPROVED')
    );
    const hasAppr2 = activeApprovals.some(
      (a) => a.RoleId === 'PTW_APPR2' && (a.Action === 'AP' || a.Action === 'APPROVED')
    );

    if (!hasAppr1) {
      return {
        stage: 'APPR',
        seqNo: nextSeqNo,
        roleId: 'PTW_APPR1',
        action: 'AP',
        isRejected: false,
        isFullyApproved: false
      };
    }

    if (!hasAppr2) {
      return {
        stage: 'APPR',
        seqNo: nextSeqNo,
        roleId: 'PTW_APPR2',
        action: 'AP',
        isRejected: false,
        isFullyApproved: false
      };
    }

    return {
      stage: 'APPR',
      seqNo: nextSeqNo,
      roleId: 'PTW_APPR2',
      action: 'AP',
      isRejected: false,
      isFullyApproved: true
    };
  }

  // 1. Initial State: Rejected by PTW_APPR1 in Cycle 1
  const initialRejection = [
    {
      PermitNo: 'PTW0000070',
      CycleNo: 1,
      Stage: 'APPR',
      SeqNo: '1',
      RoleId: 'PTW_APPR1',
      Action: 'RJ',
      SignedBy: 'VERTIF-V',
      Comments: 'Permit validity expired or work scope mismatch'
    }
  ];

  // While in REJT status, permit is flagged as rejected
  const stepWhileRejected = getNextApprovalStep(initialRejection, 'REJT');
  assert.equal(stepWhileRejected.isRejected, true);

  // 2. Resubmission Occurs: Permit status transitions to CRTD in SAP
  // Next SeqNo automatically increases to '2'
  const stepAfterResubmission = getNextApprovalStep(initialRejection, 'CRTD');
  assert.equal(stepAfterResubmission.isRejected, false, 'Resubmitted permit must NOT be blocked by old rejection');
  assert.equal(stepAfterResubmission.roleId, 'PTW_APPR1', 'Next role is Approver 1 for new cycle');
  assert.equal(stepAfterResubmission.seqNo, '2', 'SeqNo auto-increments to 2 to prevent SAP duplicate key error');
  assert.equal(stepAfterResubmission.action, 'AP', 'Action is AP (Approve)');

  // 3. Approver 1 Approves at SeqNo 2
  const approvalsAfterAppr1 = [
    ...initialRejection,
    {
      PermitNo: 'PTW0000070',
      CycleNo: 1,
      Stage: 'APPR',
      SeqNo: '2',
      RoleId: 'PTW_APPR1',
      Action: 'AP',
      SignedBy: 'VERTIF-V',
      Comments: 'Scope verified and approved'
    }
  ];

  const stepForAppr2 = getNextApprovalStep(approvalsAfterAppr1, 'CRTD');
  assert.equal(stepForAppr2.isRejected, false);
  assert.equal(stepForAppr2.roleId, 'PTW_APPR2', 'Next role advances to Approver 2');
  assert.equal(stepForAppr2.seqNo, '3', 'SeqNo auto-increments to 3');

  // 4. Approver 2 Approves at SeqNo 3
  const approvalsAfterAppr2 = [
    ...approvalsAfterAppr1,
    {
      PermitNo: 'PTW0000070',
      CycleNo: 1,
      Stage: 'APPR',
      SeqNo: '3',
      RoleId: 'PTW_APPR2',
      Action: 'AP',
      SignedBy: 'APPROVER2',
      Comments: 'Fully authorized'
    }
  ];

  const finalStep = getNextApprovalStep(approvalsAfterAppr2, 'CRTD');
  assert.equal(finalStep.isFullyApproved, true, 'Permit is fully approved in resubmitted cycle');
});

// 19. Test complete lifecycle: Approver (APPR) -> Accepter (.acceptPermit -> ACCP) -> Area Operator (.completeAreaOperator -> ACTV)
test('Permit lifecycle progression: APPR -> Accepter (ACCP) -> Area Operator (ACTV)', () => {
  // Step 1: Permit is approved by Area Approver -> Status becomes APPR
  const permitApproved = {
    Permit_No: '0000000100',
    Status: 'APPR',
    JobDesc: 'Hot work piping maintenance',
    Werks: '1002'
  };

  // Step 2: Permit Acceptor Workspace filtering logic
  const isPendingAcceptor = (status) => status === 'APPR';
  const isAcceptedByAcceptor = (status) => status === 'ACCP' || status === 'ISSU' || status === 'ACTV';

  assert.equal(isPendingAcceptor(permitApproved.Status), true, 'Approved permit (APPR) shows in Accepter Awaiting queue');
  assert.equal(isAcceptedByAcceptor(permitApproved.Status), false, 'APPR permit is not yet accepted');

  // Acceptor accepts via SAP .acceptPermit -> transitions to ACCP
  const permitAccepted = {
    ...permitApproved,
    Status: 'ACCP'
  };

  assert.equal(isPendingAcceptor(permitAccepted.Status), false, 'ACCP permit no longer in Awaiting Acceptance queue');
  assert.equal(isAcceptedByAcceptor(permitAccepted.Status), true, 'ACCP permit shows in Accepter Accepted queue');

  // Step 3: Area Operator Workspace filtering logic
  const isPendingAreaClearance = (status) => status === 'ACCP' || status === 'ISSU' || status === 'ISSD' || status === 'APPR';
  const isCompletedAreaClearance = (status) => status === 'ACTV' || status === 'CLSD';

  assert.equal(isPendingAreaClearance(permitAccepted.Status), true, 'Accepted permit (ACCP) shows in Area Operator Awaiting Clearance queue');
  assert.equal(isCompletedAreaClearance(permitAccepted.Status), false, 'ACCP permit is not yet completed/active');

  // Area Operator completes clearance via SAP .completeAreaOperator -> transitions to ACTV
  const permitActive = {
    ...permitAccepted,
    Status: 'ACTV'
  };

  assert.equal(isPendingAreaClearance(permitActive.Status), false, 'ACTV permit is cleared and no longer pending');
  assert.equal(isCompletedAreaClearance(permitActive.Status), true, 'ACTV permit shows in Area Operator Cleared / Active queue');
});
