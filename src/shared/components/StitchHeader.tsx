import React from 'react';
import { useSapAuth } from '../../core/auth/sapAuthContext';

interface StitchHeaderProps {
  onGoHome?: () => void;
  isHome?: boolean;
  onOpenMap?: () => void;
  isMapActive?: boolean;
}

export const StitchHeader: React.FC<StitchHeaderProps> = ({
  onGoHome,
  isHome = true,
  onOpenMap,
  isMapActive = false
}) => {
  const { user, loading, logout } = useSapAuth();

  const userInitials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : user?.id?.slice(0, 2) || 'US';

  const primaryRole = user?.roles && user.roles.length > 0 ? user.roles[0] : 'ZPTW_USER';

  return (
    <header className="no-print fixed top-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-lg border-b border-slate-200/80 z-40 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.06),0_1px_2px_rgba(0,0,0,0.03)] select-none">
      <div className="h-16 w-full px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sm:gap-3 lg:gap-4 overflow-hidden">
        {/* Left Section: Brand & Product Identity */}
        <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 shrink">
          {/* Official GFL Corporate Logo */}
          <div
            onClick={onGoHome}
            className="flex items-center cursor-pointer hover:opacity-90 transition-opacity shrink-0"
            title="Gujarat Fluorochemicals Limited - Return to Launchpad"
          >
            <img
              src="./GFL-Logo.webp"
              alt="GFL Logo"
              className="h-8 sm:h-9 w-auto object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
          </div>

          <div className="h-6 sm:h-7 w-px bg-slate-200 mx-0.5 hidden xs:block sm:block shrink-0" />

          {/* Product Title & Badge */}
          <div
            onClick={onGoHome}
            className="flex flex-col cursor-pointer group min-w-0"
            title="Return to Launchpad"
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-display font-bold text-sm sm:text-base text-slate-900 group-hover:text-[#006398] transition-colors tracking-tight whitespace-nowrap">
                GFL ChemSafe
              </span>
              <span className="hidden sm:inline-flex text-[10px] font-mono font-bold bg-[#006398]/10 text-[#006398] px-1.5 sm:px-2 py-0.5 rounded-md border border-[#006398]/20 shadow-xs shrink-0">
                PTW Suite
              </span>
            </div>
            <span className="text-[10px] sm:text-[11px] font-sans text-slate-500 font-medium tracking-normal hidden md:block whitespace-nowrap">
              Permit To Work System • S/4HANA
            </span>
          </div>

          {/* Return to Launchpad Button (shown when inside any module) */}
          {!isHome && onGoHome && (
            <button
              onClick={onGoHome}
              title="Return to Launchpad - All Workspaces"
              className="ml-1 sm:ml-2 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-slate-100 to-slate-200/80 hover:from-[#006398] hover:to-[#004f7a] text-slate-700 hover:text-white rounded-xl text-xs font-mono font-semibold transition-all shadow-xs group border border-slate-200/80 hover:border-transparent shrink-0"
            >
              <span className="material-symbols-outlined text-[16px] group-hover:-translate-x-0.5 transition-transform">
                arrow_back
              </span>
              <span className="hidden sm:inline">All Workspaces</span>
            </button>
          )}
        </div>

        {/* Center Section: Plant Facility Context & Real-Time Safety Status */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          {/* Plant Map Quick Access */}
          {onOpenMap && (
            <button
              onClick={onOpenMap}
              title="Open GFL Dahej Complex Safety Districts Demarcation Map"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all shadow-xs group ${
                isMapActive
                  ? 'bg-gradient-to-r from-[#006398] to-[#004f7a] text-white shadow-[0_2px_8px_rgba(0,99,152,0.25)]'
                  : 'bg-gradient-to-r from-sky-50 to-blue-50/70 hover:from-[#006398] hover:to-[#004f7a] text-[#006398] hover:text-white border border-sky-200/90 hover:border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[17px] group-hover:rotate-6 transition-transform">
                map
              </span>
              <span>Safety Map</span>
              <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded font-mono">
                Map
              </span>
            </button>
          )}

          {/* Safety Status Pill */}
          <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-emerald-100/50 border border-emerald-200/90 px-3.5 py-1 rounded-full text-xs font-sans text-emerald-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(5,150,105,0.06)]">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]"></span>
            <span className="font-semibold text-[11px] whitespace-nowrap">CONDITION GREEN</span>
            <span className="text-emerald-700/80 text-[10px] font-mono hidden 2xl:inline">| Shift B</span>
          </div>
        </div>

        {/* Right Section: SAP Client Context, User Profile & Logout */}
        <div className="flex items-center gap-2 sm:gap-2.5 lg:gap-3 shrink-0">
          {/* SAP Client Pill */}
          <div className="hidden lg:flex items-center gap-1.5 bg-gradient-to-r from-sky-50 to-blue-50/70 border border-sky-200/90 text-[#006398] px-2.5 py-1 rounded-xl text-xs font-mono font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(0,99,152,0.06)] shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-[#006398]"></span>
            <span>Client: {user?.client || 'Automatic'}</span>
          </div>

          {/* User Profile Pill */}
          <div 
            className="flex items-center gap-2 bg-gradient-to-r from-white to-slate-50 border border-slate-200/90 p-1 sm:pl-1.5 sm:pr-3 sm:py-1 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.04)] shrink-0"
            title={`${user?.fullName || user?.id || 'SAP User'} (${user?.id || ''}) - ${user?.roles?.join(', ') || primaryRole}`}
          >
            {/* User Avatar */}
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#006398] to-sky-600 text-white flex items-center justify-center font-mono font-bold text-xs shadow-sm shrink-0">
              {userInitials}
            </div>

            {/* Name & Role */}
            <div className="hidden sm:flex flex-col text-left min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-900 leading-tight truncate max-w-[85px] md:max-w-[120px] lg:max-w-[150px]">
                  {loading ? 'Authenticating...' : user?.fullName || user?.id || 'SAP User'}
                </span>
                <span className="hidden md:inline-block text-[10px] font-mono bg-slate-200/80 text-slate-700 px-1.5 py-0.2 rounded font-semibold shrink-0">
                  {user?.id}
                </span>
              </div>

              <div className="hidden md:flex items-center gap-1 mt-0.5">
                <span className="text-[10px] text-[#006398] font-mono font-bold truncate max-w-[95px] lg:max-w-[130px]">
                  {primaryRole}
                </span>
                {user?.roles && user.roles.length > 1 && (
                  <span className="text-[9px] font-mono bg-blue-100 text-[#006398] px-1 rounded font-bold shrink-0">
                    +{user.roles.length - 1}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Log Off Button */}
          <button
            onClick={logout}
            title="Log off from SAP NetWeaver Session"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-sans font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 bg-white rounded-lg border border-slate-200 hover:border-red-200 transition-all shadow-xs shrink-0"
          >
            <span className="material-symbols-outlined text-[17px] text-slate-400 group-hover:text-red-600">
              logout
            </span>
            <span className="hidden sm:inline">Log Off</span>
          </button>
        </div>
      </div>
    </header>
  );
};


