import type { PermitInfoRecord, PermitDeepInsertResponse } from '../types/ptw.types';

export type GasLevelStatus = 'DONE' | 'REQUIRED_PENDING' | 'NOT_REQUIRED';
export type ApproverLevelStatus = 'APPROVED' | 'IN_PROGRESS' | 'REJECTED' | 'NOT_STARTED';
export type AccepterLevelStatus = 'ACCEPTED' | 'PENDING' | 'AWAITING_APPROVER' | 'BLOCKED' | 'REJECTED';
export type AreaOperatorLevelStatus = 'CLEARED' | 'PENDING' | 'AWAITING_ACCEPTANCE' | 'BLOCKED' | 'REJECTED';

export type OverallWorkflowStage =
  | 'GAS_TEST'
  | 'APPROVER'
  | 'ACCEPTER'
  | 'AREA_OPERATOR'
  | 'ACTIVE_EXECUTION'
  | 'REJECTED'
  | 'CLOSED';

export interface ClearanceLevelItem {
  id: 'gas' | 'approver' | 'accepter' | 'area_operator';
  stepNumber: number;
  title: string;
  shortLabel: string;
  status: string;
  isComplete: boolean;
  isPendingCurrent: boolean;
  isAwaitingPrior: boolean;
  isNotApplicable: boolean;
  isRejected: boolean;
  badgeLabel: string;
  badgeClass: string;
  icon: string;
  detailText: string;
  responsibleRole: string;
}

export interface PermitClearanceSummary {
  gas: ClearanceLevelItem;
  approver: ClearanceLevelItem;
  accepter: ClearanceLevelItem;
  areaOperator: ClearanceLevelItem;
  levels: ClearanceLevelItem[];
  completedCount: number;
  totalApplicableLevels: number;
  overallCurrentLevel: OverallWorkflowStage;
  overallLevelLabel: string;
  overallLevelBadgeClass: string;
  nextActionText: string;
}

/**
 * Evaluates the 4 safety and authorization clearance levels for any permit:
 * 1. Gas Test (Done / Required Pending / Not Required)
 * 2. Approver Level (Approved / In Progress / Rejected)
 * 3. Accepter Level (Accepted / Pending / Awaiting Approver)
 * 4. Area Operator Level (Cleared / Pending / Awaiting Acceptor)
 */
export function getPermitClearanceLevels(
  permit: PermitInfoRecord | PermitDeepInsertResponse | null | undefined
): PermitClearanceSummary {
  if (!permit) {
    const createEmptyLevel = (id: ClearanceLevelItem['id'], title: string, step: number): ClearanceLevelItem => ({
      id,
      stepNumber: step,
      title,
      shortLabel: title,
      status: 'NOT_STARTED',
      isComplete: false,
      isPendingCurrent: false,
      isAwaitingPrior: true,
      isNotApplicable: false,
      isRejected: false,
      badgeLabel: `${title}: —`,
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
      icon: 'pending',
      detailText: 'No permit loaded',
      responsibleRole: '—'
    });

    const gas = createEmptyLevel('gas', 'Gas Test', 1);
    const approver = createEmptyLevel('approver', 'Approver', 2);
    const accepter = createEmptyLevel('accepter', 'Accepter', 3);
    const areaOperator = createEmptyLevel('area_operator', 'Area Operator', 4);

    return {
      gas,
      approver,
      accepter,
      areaOperator,
      levels: [gas, approver, accepter, areaOperator],
      completedCount: 0,
      totalApplicableLevels: 4,
      overallCurrentLevel: 'APPROVER',
      overallLevelLabel: 'No Permit Data',
      overallLevelBadgeClass: 'bg-slate-100 text-slate-600',
      nextActionText: 'Load a permit to view workflow stages'
    };
  }

  const status = (permit.Status || '').trim().toUpperCase();
  const permitType = (permit.PermitType || '').trim().toUpperCase();
  const isRejected = status === 'REJT' || status === 'REJC' || status === 'CANC';
  const approvalHistory = [...((permit as PermitDeepInsertResponse)._Approval || [])].sort((a, b) =>
    (Number(a.CycleNo || 1) - Number(b.CycleNo || 1)) ||
    (Number(a.SeqNo || 0) - Number(b.SeqNo || 0))
  );
  const rejectionActions = ['RJ', 'REJT', 'REJC', 'REJECTED', 'RJA', 'REJECT_ACCEPTOR', 'RAO', 'REJECT_AREA_OPERATOR'];
  const rejection = isRejected ? [...approvalHistory].reverse().find(a => rejectionActions.includes((a.Action || '').trim().toUpperCase())) : undefined;
  const rejectedAction = (rejection?.Action || '').trim().toUpperCase();
  const rejectedRole = (rejection?.RoleId || '').trim().toUpperCase().replace(/^Z(?=PTW_)/, '');
  const rejectedStage = (rejection?.Stage || '').trim().toUpperCase();
  const rejectionLevel = !rejection ? null
    : ['RAO', 'REJECT_AREA_OPERATOR'].includes(rejectedAction) || ['PTW_AREA_OPP', 'PTW_AOPR', 'PTW_AREA_OWNER'].includes(rejectedRole) || ['AREA', 'AREA_OPP', 'CAO'].includes(rejectedStage) ? 'area_operator'
    : ['RJA', 'REJECT_ACCEPTOR'].includes(rejectedAction) || ['PTW_ACCP', 'PTW_ACCEPTOR'].includes(rejectedRole) || ['ACCP', 'ACCEPTOR'].includes(rejectedStage) ? 'accepter'
    : /^PTW_APPR[123]$/.test(rejectedRole) || ['PTW_APPROVER', 'APPR'].includes(rejectedRole) || rejectedStage === 'APPR' ? 'approver' : null;
  const rejectionRemarks = rejection?.Comments?.trim() || 'No rejection remarks recorded.';

  // -------------------------------------------------------------------------
  // 1. Gas Test Level Evaluation
  // -------------------------------------------------------------------------
  const isGasRequired =
    permit.GasTestRequired === 'X' ||
    permit.GasTestRequired === 'Y' ||
    permitType === 'HOT' ||
    permitType === 'CONF' ||
    permitType === 'CSE' ||
    Boolean(permit.GasTestFreqHr && Number(permit.GasTestFreqHr) > 0);

  let isGasDone = false;
  let gasDetail = '';

  const gasRecords = (permit as PermitDeepInsertResponse)._GasTest;
  if (Array.isArray(gasRecords) && gasRecords.length > 0) {
    const latest = gasRecords[gasRecords.length - 1];
    const o2 = Number(latest.O2Pct || 0);
    const lel = Number(latest.LelPct || 0);
    const isSafe = o2 >= 19.5 && o2 <= 23.5 && lel <= 5.0;
    isGasDone = isSafe;
    gasDetail = isSafe
      ? `O2: ${o2.toFixed(1)}%, LEL: ${lel.toFixed(1)}% (Safe) by ${latest.TestedBy || 'Certified Tester'}`
      : `O2: ${o2.toFixed(1)}%, LEL: ${lel.toFixed(1)}% (Threshold Exceeded)`;
  } else {
    // If no gas records array attached (e.g. master list table row):
    if (!isGasRequired) {
      isGasDone = true;
      gasDetail = 'Atmospheric gas testing is not required for this activity';
    } else {
      // In SAP workflow, permit cannot transition to APPR/ACCP/ACTV without gas test pass
      if (status === 'APPR' || status === 'ACCP' || status === 'ISSU' || status === 'ISSD' || status === 'ACTV' || status === 'CLSD') {
        isGasDone = true;
        gasDetail = 'Gas tests verified and cleared in prerequisite stage';
      } else {
        isGasDone = false;
        gasDetail = 'Atmospheric gas test required by certified tester prior to authorization';
      }
    }
  }

  let gasItem: ClearanceLevelItem;
  if (!isGasRequired) {
    gasItem = {
      id: 'gas',
      stepNumber: 1,
      title: 'Gas Testing',
      shortLabel: 'Gas Test',
      status: 'NOT_REQUIRED',
      isComplete: true,
      isPendingCurrent: false,
      isAwaitingPrior: false,
      isNotApplicable: true,
      isRejected: false,
      badgeLabel: 'Gas: Not Req',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      icon: 'air',
      detailText: gasDetail,
      responsibleRole: 'Gas Tester'
    };
  } else if (isGasDone) {
    gasItem = {
      id: 'gas',
      stepNumber: 1,
      title: 'Gas Testing',
      shortLabel: 'Gas Test',
      status: 'DONE',
      isComplete: true,
      isPendingCurrent: false,
      isAwaitingPrior: false,
      isNotApplicable: false,
      isRejected: false,
      badgeLabel: 'Gas: Done',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-500/20',
      icon: 'check_circle',
      detailText: gasDetail,
      responsibleRole: 'Gas Tester'
    };
  } else {
    gasItem = {
      id: 'gas',
      stepNumber: 1,
      title: 'Gas Testing',
      shortLabel: 'Gas Test',
      status: 'REQUIRED_PENDING',
      isComplete: false,
      isPendingCurrent: status === 'CRTD' || !status,
      isAwaitingPrior: false,
      isNotApplicable: false,
      isRejected: false,
      badgeLabel: 'Gas: Req (Pending)',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-500/20',
      icon: 'air',
      detailText: gasDetail,
      responsibleRole: 'Gas Tester'
    };
  }

  // -------------------------------------------------------------------------
  // 2. Approver Level Evaluation
  // -------------------------------------------------------------------------
  const isApproved =
    status === 'APPR' ||
    status === 'ACCP' ||
    status === 'ISSU' ||
    status === 'ISSD' ||
    status === 'ACTV' ||
    status === 'CLSD';

  let approverItem: ClearanceLevelItem;
  if (isRejected) {
    approverItem = {
      id: 'approver',
      stepNumber: 2,
      title: 'Managerial Approver',
      shortLabel: 'Approver',
      status: 'REJECTED',
      isComplete: false,
      isPendingCurrent: false,
      isAwaitingPrior: false,
      isNotApplicable: false,
      isRejected: true,
      badgeLabel: 'Appr: Rejected',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 ring-1 ring-rose-500/20',
      icon: 'cancel',
      detailText: 'Technical approval was denied or rejected in authorization workflow',
      responsibleRole: 'Approver I / II / III'
    };
  } else if (isApproved) {
    approverItem = {
      id: 'approver',
      stepNumber: 2,
      title: 'Managerial Approver',
      shortLabel: 'Approver',
      status: 'APPROVED',
      isComplete: true,
      isPendingCurrent: false,
      isAwaitingPrior: false,
      isNotApplicable: false,
      isRejected: false,
      badgeLabel: 'Appr: Approved',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-500/20',
      icon: 'verified',
      detailText: permit.ApprovedBy
        ? `Fully authorized by ${permit.ApprovedBy}`
        : 'All multi-tier managerial approvals complete',
      responsibleRole: 'Approver I / II / III'
    };
  } else {
    // In Draft / Created / Initiated
    const isPendingNow = isGasDone || !isGasRequired;
    approverItem = {
      id: 'approver',
      stepNumber: 2,
      title: 'Managerial Approver',
      shortLabel: 'Approver',
      status: 'IN_PROGRESS',
      isComplete: false,
      isPendingCurrent: isPendingNow,
      isAwaitingPrior: !isPendingNow,
      isNotApplicable: false,
      isRejected: false,
      badgeLabel: isPendingNow ? 'Appr: In Progress' : 'Appr: Awaiting Gas',
      badgeClass: isPendingNow
        ? 'bg-blue-50 text-[#006398] border-blue-200 ring-1 ring-blue-500/20'
        : 'bg-slate-100 text-slate-500 border-slate-200',
      icon: isPendingNow ? 'draw' : 'schedule',
      detailText: isPendingNow
        ? 'Under technical safety review by designated Approvers (SAP /Approval)'
        : 'Awaiting atmospheric gas test completion before technical sign-off',
      responsibleRole: 'Approver I / II / III'
    };
  }

  // -------------------------------------------------------------------------
  // 3. Permit Acceptor Level Evaluation (Section K Field Acceptance)
  // -------------------------------------------------------------------------
  const isAccepted =
    status === 'ACCP' ||
    status === 'ISSU' ||
    status === 'ISSD' ||
    status === 'ACTV' ||
    status === 'CLSD';

  let accepterItem: ClearanceLevelItem;
  if (isRejected) {
    accepterItem = {
      id: 'accepter',
      stepNumber: 3,
      title: 'Permit Acceptor',
      shortLabel: 'Accepter',
      status: 'BLOCKED',
      isComplete: false,
      isPendingCurrent: false,
      isAwaitingPrior: false,
      isNotApplicable: false,
      isRejected: true,
      badgeLabel: 'Accp: N/A',
      badgeClass: 'bg-slate-100 text-slate-400 border-slate-200',
      icon: 'block',
      detailText: 'Field acceptance unavailable (permit rejected)',
      responsibleRole: 'Permit Acceptor (PTW_ACCP)'
    };
  } else if (isAccepted) {
    accepterItem = {
      id: 'accepter',
      stepNumber: 3,
      title: 'Permit Acceptor',
      shortLabel: 'Accepter',
      status: 'ACCEPTED',
      isComplete: true,
      isPendingCurrent: false,
      isAwaitingPrior: false,
      isNotApplicable: false,
      isRejected: false,
      badgeLabel: 'Accp: Accepted',
      badgeClass: 'bg-teal-50 text-teal-800 border-teal-200 ring-1 ring-teal-500/20',
      icon: 'task_alt',
      detailText: 'Section K Field Acceptance signed by Site Supervisor / Contractor Acceptor',
      responsibleRole: 'Permit Acceptor (PTW_ACCP)'
    };
  } else if (status === 'APPR') {
    accepterItem = {
      id: 'accepter',
      stepNumber: 3,
      title: 'Permit Acceptor',
      shortLabel: 'Accepter',
      status: 'PENDING',
      isComplete: false,
      isPendingCurrent: true,
      isAwaitingPrior: false,
      isNotApplicable: false,
      isRejected: false,
      badgeLabel: 'Accp: Pending',
      badgeClass: 'bg-amber-50 text-amber-900 border-amber-300 ring-1 ring-amber-500/20 font-bold',
      icon: 'hourglass_top',
      detailText: 'Technical approvals complete. Ready for Section K field acceptance (.acceptPermit)',
      responsibleRole: 'Permit Acceptor (PTW_ACCP)'
    };
  } else {
    accepterItem = {
      id: 'accepter',
      stepNumber: 3,
      title: 'Permit Acceptor',
      shortLabel: 'Accepter',
      status: 'AWAITING_APPROVER',
      isComplete: false,
      isPendingCurrent: false,
      isAwaitingPrior: true,
      isNotApplicable: false,
      isRejected: false,
      badgeLabel: 'Accp: Wait Appr',
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
      icon: 'schedule',
      detailText: 'Awaiting managerial approvals before Section K field acceptance can proceed',
      responsibleRole: 'Permit Acceptor (PTW_ACCP)'
    };
  }

  // -------------------------------------------------------------------------
  // 4. Area Operator Level Evaluation (Clearance & Handover)
  // -------------------------------------------------------------------------
  const isAreaCleared = status === 'ACTV' || status === 'CLSD';
  const isAreaPending = status === 'ACCP' || status === 'ISSU' || status === 'ISSD';

  let areaOperatorItem: ClearanceLevelItem;
  if (isRejected) {
    areaOperatorItem = {
      id: 'area_operator',
      stepNumber: 4,
      title: 'Area Operator',
      shortLabel: 'Area Op',
      status: 'BLOCKED',
      isComplete: false,
      isPendingCurrent: false,
      isAwaitingPrior: false,
      isNotApplicable: false,
      isRejected: true,
      badgeLabel: 'Area: N/A',
      badgeClass: 'bg-slate-100 text-slate-400 border-slate-200',
      icon: 'block',
      detailText: 'Area clearance unavailable (permit rejected)',
      responsibleRole: 'Area Operator (PTW_AREA_OPP)'
    };
  } else if (isAreaCleared) {
    areaOperatorItem = {
      id: 'area_operator',
      stepNumber: 4,
      title: 'Area Operator',
      shortLabel: 'Area Op',
      status: 'CLEARED',
      isComplete: true,
      isPendingCurrent: false,
      isAwaitingPrior: false,
      isNotApplicable: false,
      isRejected: false,
      badgeLabel: 'Area: Cleared',
      badgeClass: 'bg-purple-50 text-purple-800 border-purple-200 ring-1 ring-purple-500/20',
      icon: 'domain_verification',
      detailText: 'Plant safe area clearance granted by Area In-Charge. Active for execution on site.',
      responsibleRole: 'Area Operator (PTW_AREA_OPP)'
    };
  } else if (isAreaPending) {
    areaOperatorItem = {
      id: 'area_operator',
      stepNumber: 4,
      title: 'Area Operator',
      shortLabel: 'Area Op',
      status: 'PENDING',
      isComplete: false,
      isPendingCurrent: true,
      isAwaitingPrior: false,
      isNotApplicable: false,
      isRejected: false,
      badgeLabel: 'Area: Pending',
      badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-300 ring-1 ring-indigo-500/20 font-bold',
      icon: 'engineering',
      detailText: 'Field accepted. Awaiting Area Operator site inspection & safe handover clearance',
      responsibleRole: 'Area Operator (PTW_AREA_OPP)'
    };
  } else {
    areaOperatorItem = {
      id: 'area_operator',
      stepNumber: 4,
      title: 'Area Operator',
      shortLabel: 'Area Op',
      status: 'AWAITING_ACCEPTANCE',
      isComplete: false,
      isPendingCurrent: false,
      isAwaitingPrior: true,
      isNotApplicable: false,
      isRejected: false,
      badgeLabel: 'Area: Wait Accp',
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
      icon: 'schedule',
      detailText: 'Awaiting managerial approvals and Section K acceptance prior to area clearance',
      responsibleRole: 'Area Operator (PTW_AREA_OPP)'
    };
  }

  // -------------------------------------------------------------------------
  // Attribute rejection to its recorded stage, retaining completed upstream stages.
  // A rejected header alone does not tell us who rejected the permit.
  if (isRejected) {
    const blocked = (item: ClearanceLevelItem): ClearanceLevelItem => ({
      ...item, status: 'BLOCKED', isComplete: false, isRejected: false,
      isPendingCurrent: false, isAwaitingPrior: true,
      badgeLabel: `${item.shortLabel}: Blocked`, icon: 'block',
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
      detailText: 'Cannot proceed while the permit is rejected.',
    });
    approverItem = blocked(approverItem);
    accepterItem = blocked(accepterItem);
    areaOperatorItem = blocked(areaOperatorItem);
    if (rejectionLevel === 'accepter' || rejectionLevel === 'area_operator') {
      const cycle = Number(rejection?.CycleNo || 1);
      const signedRoles = [...new Set(approvalHistory.filter(a => Number(a.CycleNo || 1) === cycle &&
        Number(a.SeqNo || 0) < Number(rejection?.SeqNo || 0) &&
        ['AP', 'APPROVED'].includes((a.Action || '').trim().toUpperCase()) &&
        /^(Z)?PTW_APPR[123]$/.test(a.RoleId || '')
      ).map(a => `Approver ${a.RoleId.slice(-1)}`))];
      approverItem = { ...approverItem, status: 'APPROVED', isComplete: true, isAwaitingPrior: false,
        badgeLabel: 'Appr: Approved', icon: 'verified',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        detailText: signedRoles.length ? `${signedRoles.join(' and ')} completed approval before this rejection.` : 'Managerial approval completed before the later-stage rejection.',
      };
    }
    if (rejectionLevel === 'area_operator') {
      accepterItem = { ...accepterItem, status: 'ACCEPTED', isComplete: true, isAwaitingPrior: false,
        badgeLabel: 'Accp: Accepted', icon: 'task_alt',
        badgeClass: 'bg-teal-50 text-teal-800 border-teal-200', detailText: 'Field acceptance completed before area clearance was rejected.',
      };
    }
    const rejected = (item: ClearanceLevelItem): ClearanceLevelItem => ({
      ...item, status: 'REJECTED', isComplete: false, isRejected: true, isAwaitingPrior: false,
      badgeLabel: `${item.shortLabel}: Rejected`, icon: 'cancel',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      detailText: `Rejected${rejection?.SignedBy ? ` by ${rejection.SignedBy}` : ''}. Remarks: ${rejectionRemarks}`,
    });
    if (rejectionLevel === 'approver') approverItem = rejected(approverItem);
    if (rejectionLevel === 'accepter') accepterItem = rejected(accepterItem);
    if (rejectionLevel === 'area_operator') areaOperatorItem = rejected(areaOperatorItem);
  }

  // Overall Workflow Level & Next Action
  // -------------------------------------------------------------------------
  let overallCurrentLevel: OverallWorkflowStage;
  let overallLevelLabel: string;
  let overallLevelBadgeClass: string;
  let nextActionText: string;

  if (isRejected) {
    overallCurrentLevel = 'REJECTED';
    overallLevelLabel = 'Rejected';
    overallLevelBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300';
    const stageName = rejectionLevel === 'accepter' ? 'Acceptor' : rejectionLevel === 'area_operator' ? 'Area Operator' : rejectionLevel === 'approver' ? 'Approver' : 'Permit';
    nextActionText = `${stageName} rejected. Remarks: ${rejectionRemarks} Review and revise before resubmitting.`;
  } else if (status === 'CLSD') {
    overallCurrentLevel = 'CLOSED';
    overallLevelLabel = 'Work Completed';
    overallLevelBadgeClass = 'bg-slate-100 text-slate-700 border-slate-300';
    nextActionText = 'Work finished, housekeeping done, and permit closed';
  } else if (status === 'ACTV') {
    overallCurrentLevel = 'ACTIVE_EXECUTION';
    overallLevelLabel = 'Active in Field';
    overallLevelBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
    nextActionText = 'Active execution under authorized safety supervision';
  } else if (isAreaPending) {
    overallCurrentLevel = 'AREA_OPERATOR';
    overallLevelLabel = 'Stage 4: Area Clearance Pending';
    overallLevelBadgeClass = 'bg-indigo-100 text-indigo-800 border-indigo-300 font-bold';
    nextActionText = 'Area Operator must grant safe area clearance';
  } else if (status === 'APPR') {
    overallCurrentLevel = 'ACCEPTER';
    overallLevelLabel = 'Stage 3: Field Acceptance Pending';
    overallLevelBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
    nextActionText = 'Site Supervisor must sign Section K Field Acceptance (.acceptPermit)';
  } else {
    // CRTD or draft
    if (isGasRequired && !isGasDone) {
      overallCurrentLevel = 'GAS_TEST';
      overallLevelLabel = 'Stage 1: Gas Testing Pending';
      overallLevelBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
      nextActionText = 'Certified Gas Tester must record safe atmospheric readings';
    } else {
      overallCurrentLevel = 'APPROVER';
      overallLevelLabel = 'Stage 2: Approvals Pending';
      overallLevelBadgeClass = 'bg-blue-100 text-blue-900 border-blue-300 font-bold';
      nextActionText = 'Designated Approvers must review and approve permit in SAP';
    }
  }

  const levels = [gasItem, approverItem, accepterItem, areaOperatorItem];
  const completedCount = levels.filter(l => l.isComplete && !l.isNotApplicable).length;
  const totalApplicableLevels = levels.filter(l => !l.isNotApplicable).length;

  return {
    gas: gasItem,
    approver: approverItem,
    accepter: accepterItem,
    areaOperator: areaOperatorItem,
    levels,
    completedCount,
    totalApplicableLevels,
    overallCurrentLevel,
    overallLevelLabel,
    overallLevelBadgeClass,
    nextActionText
  };
}
