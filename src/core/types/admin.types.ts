/**
 * Normalized UserRole record for UI controls (ACTIVE is boolean here).
 * Service Namespace: com.sap.gateway.srvd_a2x.zptw_services.v0001
 * Endpoint: /sap/opu/odata4/sap/zptw_mamagement_srv/srvd_a2x/sap/zptw_services/0001/UserRole
 */
export interface SapUserRoleRecord {
  SAP_USER: string;
  PTW_ROLE: string;
  ACTIVE: boolean;
  CREATED_BY?: string;
  CREATED_ON?: string | null;
  CREATED_AT?: string;
  CHANGED_BY?: string;
  CHANGED_ON?: string | null;
  CHANGED_AT?: string;
  SAP__Messages?: Array<{
    code?: string;
    message?: string;
    severity?: string;
    target?: string;
  }>;
}

/** SAP transport representation: only the exact string "X" means active. */
export type SapUserRoleResponse = Omit<SapUserRoleRecord, 'ACTIVE'> & { ACTIVE?: string | null };

/**
 * Enterprise User Record matching SAP OData V4 /PFCGUsers schema:
 * Service Endpoint: /sap/opu/odata4/sap/zptw_mamagement_srv/srvd_a2x/sap/zptw_services/0001/PFCGUsers
 */
export interface PFCGUserRecord {
  SAPUser: string;
  PFCGRole: string;
  FirstName: string;
  LastName: string;
  EmailAddress: string;
}

export type PtwRoleCode =
  | 'PTW_ADMIN'
  | 'PTW_ACCP'
  | 'PTW_ACCEPTOR'
  | 'PTW_APPR1'
  | 'PTW_APPR2'
  | 'PTW_APPR3'
  | 'PTW_AREA_OPP'
  | 'PTW_AOPR'
  | 'PTW_GAS'
  | 'PTW_HOLD'
  | 'PTW_ISO_REQ'
  | 'PTW_ISOLATION_REQUESTOR'
  | 'PTW_ISSU'
  | 'PTW_SAFE'
  | 'PTW_HOLDER'
  | 'PTW_APPROVER'
  | 'PTW_ISSUER'
  | 'PTW_AREA_OWNER'
  | 'PTW_ISOLATOR'
  | 'PTW_GAS_TESTER'
  | 'PTW_SAFETY_OFFICER';

export interface PtwRoleMetadata {
  code: PtwRoleCode | string;
  configType?: string;
  legacyCode: string;
  label: string;
  description: string;
  icon: string;
  colorBadge: string;
  category: 'GOVERNANCE' | 'FIELD' | 'AUTHORIZATION' | 'SAFETY';
}

/**
 * Official SAP Config Table Master PTW Roles:
 * Source: /Config?$filter=startswith(Config_Type, 'PTW_')
 */
export const PTW_ROLE_CATALOG: PtwRoleMetadata[] = [
  {
    code: 'PTW_ACCP',
    configType: 'PTW_ACCEPTOR_ROLE',
    legacyCode: 'PTW_ACCEPTOR',
    label: 'Permit Acceptor',
    description: 'Toolbox Briefing, Section K Agreement & Field Acceptance',
    icon: 'verified_user',
    colorBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10',
    category: 'AUTHORIZATION'
  },
  {
    code: 'PTW_ADMIN',
    configType: 'PTW_ADMIN',
    legacyCode: 'ZPTW_ADMIN',
    label: 'PTW Administrator',
    description: 'System Administration, SAP Role Assignments, Plant Master Data & Global Audits',
    icon: 'admin_panel_settings',
    colorBadge: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/10',
    category: 'GOVERNANCE'
  },
  {
    code: 'PTW_APPR1',
    configType: 'PTW_APPROVAL_ROLE',
    legacyCode: 'PTW_APPROVER',
    label: 'Permit Approver-I',
    description: 'Tier-1 Technical & Process Safety Review Signoff',
    icon: 'draw',
    colorBadge: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/10',
    category: 'AUTHORIZATION'
  },
  {
    code: 'PTW_APPR2',
    configType: 'PTW_APPROVAL_ROLE',
    legacyCode: 'PTW_APPROVER',
    label: 'Permit Approver-II',
    description: 'Tier-2 Departmental / Plant Section Authority Signoff',
    icon: 'draw',
    colorBadge: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/10',
    category: 'AUTHORIZATION'
  },
  {
    code: 'PTW_APPR3',
    configType: 'PTW_APPROVAL_ROLE',
    legacyCode: 'PTW_APPROVER',
    label: 'Permit Approver-III',
    description: 'Tier-3 EHS Head / Unit Head Final Authorization',
    icon: 'draw',
    colorBadge: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/10',
    category: 'AUTHORIZATION'
  },
  {
    code: 'PTW_AREA_OPP',
    configType: 'PTW_AREA_ROLE',
    legacyCode: 'PTW_AREA_OWNER',
    label: 'Permit Area Operator',
    description: 'Process Unit Authority, Area Demarcation & Field Safe Clearance',
    icon: 'domain',
    colorBadge: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/10',
    category: 'AUTHORIZATION'
  },
  {
    code: 'PTW_AOPR',
    configType: 'PTW_AREA_ROLE',
    legacyCode: 'PTW_AREA_OWNER',
    label: 'Permit Area Operator',
    description: 'Process Unit Authority, Area Demarcation & Field Safe Clearance',
    icon: 'domain',
    colorBadge: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/10',
    category: 'AUTHORIZATION'
  },
  {
    code: 'PTW_GAS',
    configType: 'PTW_GASTESTER_ROLE',
    legacyCode: 'PTW_GAS_TESTER',
    label: 'Permit Gas Tester',
    description: 'Atmospheric O2, LEL%, H2S, CO Calibration & Retest Log Records',
    icon: 'air',
    colorBadge: 'bg-cyan-50 text-cyan-700 border-cyan-200 ring-cyan-500/10',
    category: 'SAFETY'
  },
  {
    code: 'PTW_HOLD',
    configType: 'PTW_HOLDER_ROLE',
    legacyCode: 'PTW_HOLDER',
    label: 'Permit Holder',
    description: 'Field Execution, On-Site Worker Ledger, Suspension & Site Restoration',
    icon: 'engineering',
    colorBadge: 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-500/10',
    category: 'FIELD'
  },
  {
    code: 'PTW_ISO_REQ',
    configType: 'PTW_ISOLATION_ROLE',
    legacyCode: 'PTW_ISOLATOR',
    label: 'Isolation Requestor',
    description: 'Zero-Energy Breaker, Valve Lock & Blind Flange Isolation Request',
    icon: 'lock_reset',
    colorBadge: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/10',
    category: 'SAFETY'
  },
  {
    code: 'PTW_ISSU',
    configType: 'PTW_ISSUER_ROLE',
    legacyCode: 'PTW_ISSUER',
    label: 'Permit Issuer',
    description: 'Toolbox Briefing, Site Handover & Field Issuance Clearance',
    icon: 'verified',
    colorBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10',
    category: 'AUTHORIZATION'
  },
  {
    code: 'PTW_SAFE',
    configType: 'PTW_SAFETY_ROLE',
    legacyCode: 'PTW_SAFETY_OFFICER',
    label: 'Permit Safety Officer',
    description: 'Site Safety Oversight, OSHA PSM Compliance & Incident Governance',
    icon: 'health_and_safety',
    colorBadge: 'bg-teal-50 text-teal-700 border-teal-200 ring-teal-500/10',
    category: 'SAFETY'
  }
];

export function getPtwRoleInfo(roleCode: string): PtwRoleMetadata {
  const clean = (roleCode || '').trim().toUpperCase();
  const found = PTW_ROLE_CATALOG.find(
    (r) =>
      r.code === clean ||
      r.legacyCode === clean ||
      r.code === `PTW_${clean}` ||
      clean === `PTW_${r.code}` ||
      (clean === 'PTW_APPROVER' && r.code.startsWith('PTW_APPR')) ||
      (clean === 'PTW_ACCEPTOR' && r.code === 'PTW_ACCP') ||
      (clean === 'PTW_ACCP' && (r.code === 'PTW_ACCP' || r.code === 'PTW_ACCEPTOR')) ||
      (clean === 'PTW_AREA_OWNER' && (r.code === 'PTW_AREA_OPP' || r.code === 'PTW_AOPR')) ||
      (clean === 'PTW_AOPR' && (r.code === 'PTW_AREA_OPP' || r.code === 'PTW_AOPR')) ||
      (clean === 'PTW_AREA_OPP' && (r.code === 'PTW_AREA_OPP' || r.code === 'PTW_AOPR')) ||
      (clean === 'PTW_GAS_TESTER' && r.code === 'PTW_GAS') ||
      (clean === 'PTW_GAS' && r.code === 'PTW_GAS_TESTER') ||
      (clean === 'PTW_HOLDER' && r.code === 'PTW_HOLD') ||
      (clean === 'PTW_HOLD' && r.code === 'PTW_HOLDER') ||
      (clean === 'PTW_ISOLATOR' && (r.code === 'PTW_ISO_REQ' || r.code === 'PTW_ISOLATOR')) ||
      (clean === 'PTW_ISO_REQ' && (r.code === 'PTW_ISO_REQ' || r.code === 'PTW_ISOLATOR')) ||
      (clean === 'PTW_ISOLATION_REQUESTOR' && r.code === 'PTW_ISO_REQ') ||
      (clean === 'PTW_ISSUER' && r.code === 'PTW_ISSU') ||
      (clean === 'PTW_ISSU' && r.code === 'PTW_ISSUER') ||
      (clean === 'PTW_SAFETY_OFFICER' && r.code === 'PTW_SAFE') ||
      (clean === 'PTW_SAFE' && r.code === 'PTW_SAFETY_OFFICER')
  );
  if (found) return found;

  const legacyLookup: Record<string, Partial<PtwRoleMetadata>> = {
    PTW_ACCP: { label: 'Permit Acceptor', icon: 'verified_user', colorBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10', category: 'AUTHORIZATION' },
    ZPTW_ACCP: { label: 'Permit Acceptor', icon: 'verified_user', colorBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10', category: 'AUTHORIZATION' },
    PTW_ACCEPTOR: { label: 'Permit Acceptor', icon: 'verified_user', colorBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10', category: 'AUTHORIZATION' },
    ZPTW_ACCEPTOR: { label: 'Permit Acceptor', icon: 'verified_user', colorBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10', category: 'AUTHORIZATION' },
    PTW_ISO_REQ: { label: 'Isolation Requestor', icon: 'lock_reset', colorBadge: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/10', category: 'SAFETY' },
    ZPTW_ISO_REQ: { label: 'Isolation Requestor', icon: 'lock_reset', colorBadge: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/10', category: 'SAFETY' },
    PTW_ISOLATOR: { label: 'Isolation Engineer / Isolator', icon: 'lock_reset', colorBadge: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/10', category: 'SAFETY' },
    ZPTW_ISOLATOR: { label: 'Isolation Engineer / Isolator', icon: 'lock_reset', colorBadge: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/10', category: 'SAFETY' },
    PTW_APPROVER: { label: 'Permit Approver', icon: 'draw', colorBadge: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/10', category: 'AUTHORIZATION' },
    ZPTW_APPROVER: { label: 'Permit Approver', icon: 'draw', colorBadge: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/10', category: 'AUTHORIZATION' },
    PTW_HOLDER: { label: 'Permit Holder', icon: 'engineering', colorBadge: 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-500/10', category: 'FIELD' },
    PTW_ISSUER: { label: 'Permit Issuer', icon: 'verified', colorBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10', category: 'AUTHORIZATION' },
    PTW_AREA_OPP: { label: 'Permit Area Operator', icon: 'domain', colorBadge: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/10', category: 'AUTHORIZATION' },
    ZPTW_AREA_OPP: { label: 'Permit Area Operator', icon: 'domain', colorBadge: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/10', category: 'AUTHORIZATION' },
    PTW_AREA_OWNER: { label: 'Permit Area Operator', icon: 'domain', colorBadge: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/10', category: 'AUTHORIZATION' },
    PTW_GAS_TESTER: { label: 'Permit Gas Tester', icon: 'air', colorBadge: 'bg-cyan-50 text-cyan-700 border-cyan-200 ring-cyan-500/10', category: 'SAFETY' },
    PTW_SAFETY_OFFICER: { label: 'Permit Safety Officer', icon: 'health_and_safety', colorBadge: 'bg-teal-50 text-teal-700 border-teal-200 ring-teal-500/10', category: 'SAFETY' }
  };
  const extra = legacyLookup[clean];

  return {
    code: (clean.startsWith('PTW_') ? clean : `PTW_${clean}`) as PtwRoleCode,
    legacyCode: clean.startsWith('Z') ? clean : `Z${clean}`,
    label: extra?.label || clean.replace(/^(Z?PTW_)/, '').replace(/_/g, ' '),
    description: extra?.description || `Assigned SAP Authorization: ${clean}`,
    icon: extra?.icon || 'badge',
    colorBadge: extra?.colorBadge || 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-500/10',
    category: extra?.category || 'AUTHORIZATION'
  };
}
