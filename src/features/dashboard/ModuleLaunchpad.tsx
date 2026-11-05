import React, { useState, useMemo } from 'react';
import { ModuleDefinition, ModuleId, MODULE_REGISTRY, SapUser } from '../../core/auth/sapAuthContext';
import { PROCEDURE } from '../../core/ptw/siteProcedure';

interface ModuleLaunchpadProps {
  user: SapUser | null;
  onSelectModule: (moduleId: ModuleId) => void;
}

type DomainCategory = 'ALL' | 'PERMITS' | 'ISOLATION' | 'CLEARANCES' | 'SYSTEM';

const MODULE_DOMAINS: Record<ModuleId, { domain: 'PERMITS' | 'ISOLATION' | 'CLEARANCES' | 'SYSTEM'; badge: string }> = {
  'permit-create': { domain: 'PERMITS', badge: 'Creation & JSA' },
  'permit-details': { domain: 'PERMITS', badge: 'Dossier & Register' },
  'permit-holder': { domain: 'PERMITS', badge: 'Field Execution' },
  isolation: { domain: 'ISOLATION', badge: 'Lockout / Tagout' },
  'create-isolation': { domain: 'ISOLATION', badge: 'Vault Prep' },
  'display-isolation': { domain: 'ISOLATION', badge: 'Certificate Ledger' },
  'gas-tester': { domain: 'ISOLATION', badge: 'Gas Atmosphere' },
  'permit-approver': { domain: 'CLEARANCES', badge: 'Level 1-3 Review' },
  'permit-issuer': { domain: 'CLEARANCES', badge: 'Section K Acceptance' },
  'permit-area-owner': { domain: 'CLEARANCES', badge: 'Area Authority' },
  report: { domain: 'SYSTEM', badge: 'Analytics & Audit' },
  'safety-map': { domain: 'SYSTEM', badge: 'Plot Plan Layout' },
  admin: { domain: 'SYSTEM', badge: 'Master Data & Roles' }
};

// Visual theme configurations with layered depth and light color surfaces
const MODULE_THEMES: Record<
  ModuleId,
  {
    cardBg: string;
    cardBorder: string;
    cardShadow: string;
    iconBg: string;
    text: string;
    border: string;
    accent: string;
    accentGradient: string;
    kpiValue: string;
    kpiLabel: string;
  }
> = {
  isolation: {
    cardBg: 'bg-gradient-to-br from-white via-[#fffef7] to-amber-50/70',
    cardBorder: 'border-amber-200/90 hover:border-amber-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(217,119,6,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(217,119,6,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-amber-50 to-white text-amber-700 border-amber-200/90 shadow-[0_2px_6px_rgba(217,119,6,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-amber-800',
    border: 'border-amber-200',
    accent: 'bg-amber-500',
    accentGradient: 'from-amber-400 via-amber-500 to-amber-600',
    kpiValue: 'LOTO Vault',
    kpiLabel: 'Prerequisite Evidence'
  },
  'permit-create': {
    cardBg: 'bg-gradient-to-br from-white via-[#f6faff] to-sky-50/70',
    cardBorder: 'border-sky-200/90 hover:border-sky-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(0,99,152,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(0,99,152,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-sky-50 to-white text-[#006398] border-sky-200/90 shadow-[0_2px_6px_rgba(0,99,152,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-[#006398]',
    border: 'border-sky-200',
    accent: 'bg-[#006398]',
    accentGradient: 'from-sky-500 via-[#006398] to-[#004f7a]',
    kpiValue: 'JSA & PPE',
    kpiLabel: 'Risk Matrix Formulation'
  },
  'permit-details': {
    cardBg: 'bg-gradient-to-br from-white via-[#f7f7ff] to-indigo-50/70',
    cardBorder: 'border-indigo-200/90 hover:border-indigo-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(79,70,229,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(79,70,229,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-indigo-50 to-white text-indigo-700 border-indigo-200/90 shadow-[0_2px_6px_rgba(79,70,229,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    accent: 'bg-indigo-600',
    accentGradient: 'from-indigo-400 via-indigo-600 to-indigo-700',
    kpiValue: 'Live Dossier',
    kpiLabel: 'Deep Inspection & Progress'
  },
  'create-isolation': {
    cardBg: 'bg-gradient-to-br from-white via-[#fffdf8] to-orange-50/70',
    cardBorder: 'border-orange-200/90 hover:border-orange-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(234,88,12,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(234,88,12,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-orange-50 to-white text-orange-700 border-orange-200/90 shadow-[0_2px_6px_rgba(234,88,12,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-orange-800',
    border: 'border-orange-200',
    accent: 'bg-orange-600',
    accentGradient: 'from-orange-400 via-orange-500 to-orange-600',
    kpiValue: 'Positive LOTO',
    kpiLabel: '100% Zero-Energy Lockout'
  },
  'display-isolation': {
    cardBg: 'bg-gradient-to-br from-white via-[#fffef7] to-amber-50/70',
    cardBorder: 'border-amber-200/90 hover:border-amber-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(217,119,6,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(217,119,6,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-amber-50 to-white text-amber-700 border-amber-200/90 shadow-[0_2px_6px_rgba(217,119,6,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-amber-800',
    border: 'border-amber-200',
    accent: 'bg-amber-600',
    accentGradient: 'from-amber-400 via-amber-600 to-amber-700',
    kpiValue: 'Point Ledger',
    kpiLabel: 'Isolation Registers'
  },
  'permit-approver': {
    cardBg: 'bg-gradient-to-br from-white via-[#f6f9fe] to-blue-50/70',
    cardBorder: 'border-blue-200/90 hover:border-blue-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(37,99,235,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(37,99,235,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-blue-50 to-white text-blue-700 border-blue-200/90 shadow-[0_2px_6px_rgba(37,99,235,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-blue-800',
    border: 'border-blue-200',
    accent: 'bg-blue-600',
    accentGradient: 'from-blue-400 via-blue-600 to-blue-700',
    kpiValue: '3-Tier Chain',
    kpiLabel: 'Digital Signatures'
  },
  'permit-issuer': {
    cardBg: 'bg-gradient-to-br from-white via-[#f4fbf7] to-emerald-50/70',
    cardBorder: 'border-emerald-200/90 hover:border-emerald-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(5,150,105,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(5,150,105,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-emerald-50 to-white text-emerald-700 border-emerald-200/90 shadow-[0_2px_6px_rgba(5,150,105,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    accent: 'bg-emerald-600',
    accentGradient: 'from-emerald-400 via-emerald-600 to-emerald-700',
    kpiValue: 'Section K',
    kpiLabel: 'Field Accept & Reject Actions'
  },
  'permit-area-owner': {
    cardBg: 'bg-gradient-to-br from-white via-[#faf7ff] to-indigo-50/70',
    cardBorder: 'border-indigo-200/90 hover:border-indigo-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(99,102,241,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(99,102,241,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-indigo-50 to-white text-indigo-700 border-indigo-200/90 shadow-[0_2px_6px_rgba(99,102,241,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-indigo-800',
    border: 'border-indigo-200',
    accent: 'bg-indigo-600',
    accentGradient: 'from-indigo-400 via-indigo-600 to-indigo-700',
    kpiValue: 'Area Clearance',
    kpiLabel: 'Field Verification & SAP Sign-off'
  },
  'permit-holder': {
    cardBg: 'bg-gradient-to-br from-white via-[#faf7ff] to-purple-50/70',
    cardBorder: 'border-purple-200/90 hover:border-purple-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(147,51,234,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(147,51,234,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-purple-50 to-white text-purple-700 border-purple-200/90 shadow-[0_2px_6px_rgba(147,51,234,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-purple-800',
    border: 'border-purple-200',
    accent: 'bg-purple-600',
    accentGradient: 'from-purple-400 via-purple-600 to-purple-700',
    kpiValue: 'Crew Execution',
    kpiLabel: 'Daily Shift Oversight'
  },
  'gas-tester': {
    cardBg: 'bg-gradient-to-br from-white via-[#f2fcfa] to-cyan-50/70',
    cardBorder: 'border-cyan-200/90 hover:border-cyan-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(8,145,178,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(8,145,178,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-cyan-50 to-white text-cyan-700 border-cyan-200/90 shadow-[0_2px_6px_rgba(8,145,178,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-cyan-800',
    border: 'border-cyan-200',
    accent: 'bg-cyan-600',
    accentGradient: 'from-cyan-400 via-cyan-500 to-cyan-600',
    kpiValue: 'O₂ · LEL · H₂S',
    kpiLabel: '2-Hr Retest Interval Log'
  },
  report: {
    cardBg: 'bg-gradient-to-br from-white via-[#f2fbfc] to-teal-50/70',
    cardBorder: 'border-teal-200/90 hover:border-teal-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(13,148,136,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(13,148,136,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-teal-50 to-white text-teal-700 border-teal-200/90 shadow-[0_2px_6px_rgba(13,148,136,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-teal-800',
    border: 'border-teal-200',
    accent: 'bg-teal-600',
    accentGradient: 'from-teal-400 via-teal-600 to-teal-700',
    kpiValue: 'OSHA & KPI',
    kpiLabel: 'Permit & Audit Records'
  },
  'safety-map': {
    cardBg: 'bg-gradient-to-br from-white via-[#f0f9ff] to-sky-50/70',
    cardBorder: 'border-sky-200/90 hover:border-sky-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(0,99,152,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(0,99,152,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-sky-50 to-white text-[#006398] border-sky-200/90 shadow-[0_2px_6px_rgba(0,99,152,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-[#006398]',
    border: 'border-sky-200',
    accent: 'bg-[#006398]',
    accentGradient: 'from-sky-500 via-[#006398] to-[#004f7a]',
    kpiValue: '26 Districts',
    kpiLabel: 'Demarcation Layout'
  },
  admin: {
    cardBg: 'bg-gradient-to-br from-white via-[#fff8f8] to-rose-50/70',
    cardBorder: 'border-rose-200/90 hover:border-rose-400',
    cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(220,38,38,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(220,38,38,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
    iconBg: 'bg-gradient-to-br from-rose-50 to-white text-rose-700 border-rose-200/90 shadow-[0_2px_6px_rgba(220,38,38,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
    text: 'text-rose-800',
    border: 'border-rose-200',
    accent: 'bg-rose-600',
    accentGradient: 'from-rose-400 via-rose-600 to-rose-700',
    kpiValue: 'SAP Roles',
    kpiLabel: 'Master Data & Governance'
  }
};

export const ModuleLaunchpad: React.FC<ModuleLaunchpadProps> = ({ user, onSelectModule }) => {
  const [selectedDomain, setSelectedDomain] = useState<DomainCategory>('ALL');
  const unlockedIds = user?.unlockedModules || [];

  const authorizedModules = MODULE_REGISTRY.filter((mod) => unlockedIds.includes(mod.id));
  const restrictedModules = MODULE_REGISTRY.filter((mod) => !unlockedIds.includes(mod.id));

  const filteredAuthorized = useMemo(() => {
    if (selectedDomain === 'ALL') return authorizedModules;
    return authorizedModules.filter((mod) => MODULE_DOMAINS[mod.id]?.domain === selectedDomain);
  }, [authorizedModules, selectedDomain]);

  // Human-friendly role information for the user
  const userRoleDisplay = useMemo(() => {
    if (!user) return { title: 'Standard Operator', icon: 'person', tag: 'Standard' };
    const roles = user.roles || [];
    const isAdmin = roles.some((r) => r === 'PTW_ADMIN' || r === 'ZPTW_ADMIN');
    if (isAdmin) {
      return {
        title: 'PTW Administrator',
        icon: 'admin_panel_settings',
        tag: 'Full Access'
      };
    }
    if (roles.some((r) => r.includes('APPR'))) {
      return {
        title: 'Permit Approver',
        icon: 'draw',
        tag: 'Clearance'
      };
    }
    if (roles.some((r) => r.includes('ISSU'))) {
      return {
        title: 'Permit Issuer',
        icon: 'verified',
        tag: 'Issuance'
      };
    }
    if (roles.some((r) => r.includes('AOPR') || r.includes('AREA'))) {
      return {
        title: 'Area Operator',
        icon: 'domain',
        tag: 'Area Authority'
      };
    }
    if (roles.some((r) => r.includes('GAS'))) {
      return {
        title: 'Gas Tester',
        icon: 'air',
        tag: 'Sampling'
      };
    }
    if (roles.some((r) => r.includes('HOLD'))) {
      return {
        title: 'Permit Holder',
        icon: 'engineering',
        tag: 'Field Execution'
      };
    }
    if (roles.includes('Z_MOBILE_PI_SHEET') || roles.includes('YSM-XX-PFCG-PTW-APP-XXXXXXXXXX')) {
      return {
        title: 'Enterprise PTW User',
        icon: 'badge',
        tag: 'PFCG Authorized'
      };
    }
    return {
      title: 'Operational Specialist',
      icon: 'badge',
      tag: `${roles.length} Role${roles.length === 1 ? '' : 's'}`
    };
  }, [user, authorizedModules]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-6 animate-in fade-in duration-200 font-sans">
      {/* Top Welcome & Executive Command Bar */}
      <div className="relative overflow-hidden bg-white/95 border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(0,99,152,0.06)] flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Top subtle brand accent stripe */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#006398] via-sky-500 to-indigo-600" />
        
        {/* Left: Branding & User Welcome */}
        <div className="flex items-center gap-3.5 relative z-10">
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center p-1.5 shrink-0">
            <img
              src="./GFL-Logo.webp"
              alt="GFL"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display font-extrabold text-xl text-slate-900 tracking-tight">
                PTW Module Command Center
              </h1>
              <span className="text-[10px] font-mono font-bold bg-[#006398]/10 text-[#006398] border border-[#006398]/20 px-2 py-0.5 rounded-full shadow-2xs flex items-center gap-1">
                <span>Client {user?.client || 'Automatic'}</span>
                <span>&middot;</span>
                <span>S/4HANA</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Live OData V4</span>
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Welcome back, <strong className="text-slate-900 font-bold">{user?.fullName || user?.id}</strong>.
              Select an authorized operational workspace below.
            </p>
          </div>
        </div>

        {/* Right: Sleek Bento Stat Badges (No awkward text truncation!) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono relative z-10 shrink-0">
          {/* Card 1: Assigned Role */}
          <div
            className="bg-slate-50/80 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl px-3.5 py-2 transition-all flex items-center gap-2.5"
            title={`Assigned Roles: ${user?.roles.join(', ') || 'None'}`}
          >
            <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#006398] shadow-2xs shrink-0">
              <span className="material-symbols-outlined text-[17px]">{userRoleDisplay.icon}</span>
            </div>
            <div className="min-w-0">
              <span className="block text-[9px] uppercase text-slate-400 font-bold tracking-wider">Role</span>
              <span className="text-xs font-bold text-slate-800 truncate block">
                {userRoleDisplay.title}
              </span>
            </div>
          </div>

          {/* Card 2: Authorized Modules */}
          <div className="bg-slate-50/80 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl px-3.5 py-2 transition-all flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-emerald-600 shadow-2xs shrink-0">
              <span className="material-symbols-outlined text-[17px]">apps</span>
            </div>
            <div className="min-w-0">
              <span className="block text-[9px] uppercase text-slate-400 font-bold tracking-wider">Authorized</span>
              <span className="text-xs font-bold text-slate-900 block">
                <span className="text-emerald-700 font-extrabold">{authorizedModules.length}</span>
                <span className="text-slate-400 font-normal"> / {MODULE_REGISTRY.length}</span>
              </span>
            </div>
          </div>

          {/* Card 3: Plant Facility */}
          <div className="bg-slate-50/80 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl px-3.5 py-2 transition-all flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-indigo-600 shadow-2xs shrink-0">
              <span className="material-symbols-outlined text-[17px]">factory</span>
            </div>
            <div className="min-w-0">
              <span className="block text-[9px] uppercase text-slate-400 font-bold tracking-wider">Plant Facility</span>
              <span className="text-xs font-bold text-slate-800 truncate block">
                {user?.plant || ''} 
              </span>
            </div>
          </div>

          {/* Card 4: Safety Link */}
          <div className="bg-slate-50/80 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl px-3.5 py-2 transition-all flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-2xs shrink-0">
              <span className="material-symbols-outlined text-[17px]">verified_user</span>
            </div>
            <div className="min-w-0">
              <span className="block text-[9px] uppercase text-slate-400 font-bold tracking-wider">Safety Link</span>
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>NORMAL</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 1. Operational Domain Pill Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#006398] text-[22px]">apps</span>
          <h2 className="font-display font-bold text-lg text-slate-900 tracking-tight">
            Operational Workspaces
          </h2>
          <span className="text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 rounded-full shadow-xs">
            {authorizedModules.length} Available
          </span>
        </div>

        {/* Domain Filter Chips with Depth */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          {[
            { id: 'ALL', label: 'All Modules' },
            { id: 'PERMITS', label: 'Permits & JSA' },
            { id: 'ISOLATION', label: 'Isolation & LOTO' },
            { id: 'CLEARANCES', label: 'Approvals & Clearances' },
            { id: 'SYSTEM', label: 'Governance' }
          ].map((domain) => (
            <button
              key={domain.id}
              type="button"
              onClick={() => setSelectedDomain(domain.id as DomainCategory)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                selectedDomain === domain.id
                  ? 'bg-gradient-to-r from-[#006398] to-[#004f7a] text-white shadow-[0_2px_8px_rgba(0,99,152,0.25),inset_0_1px_0_rgba(255,255,255,0.25)]'
                  : 'bg-white/90 text-slate-600 border border-slate-200/80 hover:bg-slate-50 hover:border-slate-300 shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
              }`}
            >
              {domain.label}
            </button>
          ))}
        </div>
      </div>

      {/* Authorized Modules KPI Cards Grid with Themed Depth */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filteredAuthorized.map((mod: ModuleDefinition) => {
          const theme = MODULE_THEMES[mod.id] || {
            cardBg: 'bg-gradient-to-br from-white via-[#f6faff] to-sky-50/70',
            cardBorder: 'border-sky-200/90 hover:border-sky-400',
            cardShadow: 'shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_8px_20px_-4px_rgba(0,99,152,0.1),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_16px_32px_-6px_rgba(0,99,152,0.18),0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_0_0_rgba(255,255,255,1)]',
            iconBg: 'bg-gradient-to-br from-sky-50 to-white text-[#006398] border-sky-200/90 shadow-[0_2px_6px_rgba(0,99,152,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]',
            text: 'text-[#006398]',
            border: 'border-sky-200',
            accent: 'bg-[#006398]',
            accentGradient: 'from-sky-500 via-[#006398] to-[#004f7a]',
            kpiValue: 'Active',
            kpiLabel: 'Operational'
          };
          const domainInfo = MODULE_DOMAINS[mod.id];

          return (
            <div
              key={mod.id}
              onClick={() => onSelectModule(mod.id)}
              className={`group ${theme.cardBg} rounded-2xl border ${theme.cardBorder} p-5 ${theme.cardShadow} hover:-translate-y-1.5 transition-all duration-200 cursor-pointer flex flex-col justify-between relative overflow-hidden`}
            >
              {/* Top Accent Gradient Stripe */}
              <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${theme.accentGradient} opacity-90 group-hover:opacity-100 transition-opacity`}></div>
              
              {/* Subtle ambient light aura */}
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/40 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />

              <div className="relative z-10">
                {/* Top Row: Icon + Domain Tag */}
                <div className="flex items-start justify-between mb-3.5">
                  <div
                    className={`w-12 h-12 rounded-2xl ${theme.iconBg} border flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:rotate-1 transition-all`}
                  >
                    <span className="material-symbols-outlined text-[26px]">{mod.icon}</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full bg-white/80 backdrop-blur-xs text-slate-700 border border-slate-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.03)]">
                    {domainInfo?.badge || 'WORKSPACE'}
                  </span>
                </div>

                {/* Title & Description */}
                <h3 className="font-display font-bold text-base text-slate-900 group-hover:text-[#006398] transition-colors leading-tight mb-1.5">
                  {mod.title}
                </h3>
                <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed font-sans">
                  {mod.subtitle}
                </p>
              </div>

              {/* KPI Stat Box with Recessed Inset Tray */}
              <div className="pt-3 border-t border-slate-200/60 relative z-10">
                <div className="flex items-center justify-between font-mono mb-3 bg-white/70 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-slate-200/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <span className="text-[10px] uppercase text-slate-400 font-semibold">
                    {theme.kpiLabel}
                  </span>
                  <span className="text-xs font-bold text-slate-800">{theme.kpiValue}</span>
                </div>

                {/* Launch CTA */}
                <div className="w-full py-2.5 px-3.5 bg-white/90 group-hover:bg-[#006398] rounded-xl text-xs font-mono font-bold text-slate-700 group-hover:text-white border border-slate-200/80 group-hover:border-[#006398] transition-all duration-200 flex items-center justify-between shadow-xs group-hover:shadow-[0_4px_12px_rgba(0,99,152,0.25)]">
                  <span>LAUNCH WORKSPACE</span>
                  <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Restricted Modules Section (If any) */}
      {restrictedModules.length > 0 && (
        <div className="pt-6 border-t border-slate-200/80">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-slate-400 text-[20px]">lock</span>
            <h2 className="font-display font-bold text-base text-slate-600 tracking-tight">
              Restricted Workspaces
            </h2>
            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-500 border border-slate-200/80 px-2.5 py-0.5 rounded-full shadow-xs">
              {restrictedModules.length} Role-Restricted
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {restrictedModules.map((mod: ModuleDefinition) => (
              <div
                key={mod.id}
                className="bg-gradient-to-br from-slate-50/90 to-slate-100/60 border border-slate-200/80 rounded-2xl p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(15,23,42,0.02)] opacity-80 cursor-not-allowed flex flex-col justify-between"
                title={`Access requires SAP Role: ${mod.requiredRoles.join(' or ')}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-400">
                      <span className="material-symbols-outlined text-[18px]">lock</span>
                    </div>
                    <span className="text-[9px] font-mono bg-white text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full font-bold uppercase shadow-xs">
                      Locked
                    </span>
                  </div>

                  <h3 className="font-display font-bold text-sm text-slate-700 mb-1">{mod.title}</h3>
                  <p className="text-[11px] text-slate-500 line-clamp-2">{mod.subtitle}</p>
                </div>

                <div className="pt-2 mt-3 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>Requires:</span>
                  <span className="font-bold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200/60">{mod.requiredRoles[0]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer Info Strip */}
      <div className="border-t border-slate-200 pt-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-mono gap-2">
        <span>Gujarat Fluorochemicals Limited · NetWeaver BSP OData V4</span>
        <span>SAP Client: {user?.client || 'Automatic'} · Plant: {user?.plant || '—'} · Procedure Rev {PROCEDURE.revision}</span>
      </div>
    </div>
  );
};
