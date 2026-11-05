import React from 'react';
import { ModuleDefinition, SapUser } from '../../core/auth/sapAuthContext';

interface ComingSoonModuleProps {
  module: ModuleDefinition;
  user: SapUser | null;
  onBack?: () => void;
}

export const ComingSoonModule: React.FC<ComingSoonModuleProps> = ({ module, user, onBack }) => {
  return (
    <div className="max-w-4xl mx-auto py-6 px-4 animate-in fade-in duration-300">
      {/* Top Navigation Breadcrumb & Back Button */}
      {onBack && (
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 hover:border-[#006398] text-gray-700 hover:text-[#006398] rounded-xl text-xs font-mono font-semibold transition-all shadow-sm group"
          >
            <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-1 transition-transform">
              arrow_back
            </span>
            <span>Back to All Modules (Launchpad)</span>
          </button>

          <div className="flex items-center gap-1.5 text-xs font-mono text-gray-400">
            <span>Command Center</span>
            <span>&gt;</span>
            <span className="text-gray-900 font-bold">{module.title}</span>
          </div>
        </div>
      )}

      {/* Module Title & Role Verification Banner */}
      <div className="bg-gradient-to-r from-white via-sky-50/25 to-blue-50/40 border border-slate-200/80 rounded-3xl p-6 shadow-[0_2px_4px_rgba(15,23,42,0.03),0_12px_28px_-6px_rgba(0,99,152,0.08),inset_0_1px_0_0_rgba(255,255,255,1)] mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white border border-sky-200/80 flex items-center justify-center text-[#006398] shadow-[0_4px_12px_-2px_rgba(0,99,152,0.15),inset_0_1px_0_rgba(255,255,255,1)] shrink-0">
            <span className="material-symbols-outlined text-[32px]">{module.icon}</span>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="font-display font-bold text-2xl text-slate-900 tracking-tight">
                {module.title}
              </h1>
              <span className="text-xs font-mono font-bold bg-sky-50 text-[#006398] border border-sky-200 px-2 py-0.5 rounded-full shadow-xs">
                {module.badge}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans">
              {module.subtitle}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:items-end font-mono text-xs">
          <span className="text-slate-500 text-[11px]">SAP Authorization:</span>
          <span className="font-bold text-emerald-700 bg-gradient-to-r from-emerald-50 to-emerald-100/50 border border-emerald-200/90 px-3 py-1 rounded-xl mt-0.5 flex items-center gap-1.5 shadow-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse"></span>
            AUTHORIZED FOR {user?.id || 'SAP USER'}
          </span>
        </div>
      </div>

      {/* Primary Coming Soon Showcase Card */}
      <div className="bg-gradient-to-b from-white via-white to-slate-50/60 border border-slate-200/80 rounded-3xl p-10 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.08),inset_0_1px_0_0_rgba(255,255,255,1)] text-center flex flex-col items-center">
        {/* Animated Badge Icon */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-blue-50 to-indigo-50 border border-blue-200 flex items-center justify-center text-[#006398] shadow-inner">
            <span className="material-symbols-outlined text-[42px] animate-bounce">
              construction
            </span>
          </div>
          <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white rounded-full p-1 shadow">
            <span className="material-symbols-outlined text-[14px] block">schedule</span>
          </div>
        </div>

        {/* Coming Soon Title */}
        <span className="text-[11px] font-mono uppercase tracking-widest text-[#006398] bg-blue-50 border border-blue-200 px-3 py-1 rounded-full font-bold mb-3">
          Under Active Development • Phase 2
        </span>
        <h2 className="font-display font-bold text-3xl text-gray-900 mb-3 tracking-tight">
          Coming Soon
        </h2>
        <p className="text-sm text-gray-600 max-w-lg mb-8 leading-relaxed font-sans">
          The <strong className="text-gray-900 font-semibold">{module.title}</strong> module is currently being integrated with SAP S/4HANA OData V4 services on Client <code className="bg-gray-100 text-[#006398] px-1.5 py-0.5 rounded font-mono font-bold">{user?.client || 'Automatic'}</code>.
        </p>

        {/* User Context & Telemetry Grid */}
        <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-3 gap-3 text-left mb-8">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5">
            <span className="block text-[10px] font-mono uppercase text-gray-400 font-bold mb-1">
              Active User
            </span>
            <span className="block text-xs font-mono font-bold text-gray-900 truncate">
              {user?.id}
            </span>
            <span className="block text-[10px] text-gray-500 truncate">
              {user?.fullName}
            </span>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5">
            <span className="block text-[10px] font-mono uppercase text-gray-400 font-bold mb-1">
              Assigned Role
            </span>
            <span className="block text-xs font-mono font-bold text-[#006398] truncate">
              {user?.roles.join(', ')}
            </span>
            <span className="block text-[10px] text-emerald-600 font-bold">
              ✓ Role Match Verified
            </span>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5">
            <span className="block text-[10px] font-mono uppercase text-gray-400 font-bold mb-1">
              SAP Gateway
            </span>
            <span className="block text-xs font-mono font-bold text-gray-900">
              Client {user?.client || 'Automatic'}
            </span>
          
          </div>
        </div>

        {/* Technical Roadmap Cards */}
        <div className="w-full max-w-xl bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-left mb-6">
          <div className="flex items-center gap-2 mb-2 text-[#006398]">
            <span className="material-symbols-outlined text-[18px]">verified</span>
            <span className="text-xs font-mono font-bold uppercase tracking-wider">
              Integration Scope for this Module
            </span>
          </div>
          <ul className="text-xs text-gray-600 space-y-1.5 font-sans">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#006398]"></span>
              Live entity sets connected to SAP Gateway service <code className="font-mono text-[11px] text-gray-800">zptw_services/0001</code>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#006398]"></span>
              CSRF token handshake with ETag concurrency control
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#006398]"></span>
              Standardized Google Stitch Light UI form controls & table views
            </li>
          </ul>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
          <img
            src="./GFL-Logo.webp"
            alt="GFL"
            className="h-5 w-auto object-contain opacity-80"
            onError={(e) => {
              (e.target as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
          <span>Gujarat Fluorochemicals Limited </span>
        </div>
      </div>
    </div>
  );
};
