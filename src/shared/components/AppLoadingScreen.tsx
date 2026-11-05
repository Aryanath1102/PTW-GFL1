import React, { useState, useEffect } from 'react';
import { ShieldCheck, Server, Lock, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';

export interface AppLoadingScreenProps {
  /** Main loading title / status */
  message?: string;
  /** Secondary explanatory detail */
  submessage?: string;
  /** Whether this is an inline/compact loading state within a container */
  compact?: boolean;
  /** Optional callback to allow the user to skip waiting and go directly to sign-in */
  onManualSignIn?: () => void;
  /** Optional callback to reload the application */
  onReload?: () => void;
}

const DEFAULT_STAGES = [
  { label: 'Connecting to SAP NetWeaver S/4HANA Gateway', detail: 'Negotiating HTTPS TLS 1.3 channel' },
  { label: 'Verifying PFCG Safety Authorizations & Roles', detail: 'Validating single sign-on user context' },
  { label: 'Loading Dahej Chemical Safety Matrix', detail: 'Synchronizing site isolation & hazard registries' },
  { label: 'Initializing PTW Enterprise Workspaces', detail: 'Preparing operational safety consoles' }
];

export const AppLoadingScreen: React.FC<AppLoadingScreenProps> = ({
  message = 'Restoring SAP User Session...',
  submessage = 'Validating single sign-on credentials & authorization matrix with SAP Gateway',
  compact = false,
  onManualSignIn,
  onReload = () => window.location.reload()
}) => {
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(18);
  const [showSlowWarning, setShowSlowWarning] = useState(false);

  // Progressive simulation of initialization stages
  useEffect(() => {
    const stageInterval = setInterval(() => {
      setCurrentStageIndex((prev) => {
        if (prev < DEFAULT_STAGES.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 1800);

    const progressInterval = setInterval(() => {
      setProgressPercent((prev) => {
        if (prev < 92) {
          const increment = Math.max(2, Math.floor((95 - prev) / 6));
          return prev + increment;
        }
        return prev;
      });
    }, 400);

    // After 6 seconds, surface the manual sign-in option if network is sluggish
    const slowTimer = setTimeout(() => {
      setShowSlowWarning(true);
    }, 6000);

    return () => {
      clearInterval(stageInterval);
      clearInterval(progressInterval);
      clearTimeout(slowTimer);
    };
  }, []);

  // Compact mode for inline widget / tab loading
  if (compact) {
    return (
      <div className="w-full py-12 px-6 flex flex-col items-center justify-center text-center select-none">
        <div className="relative mb-5">
          {/* Orbital Spinner Ring */}
          <div className="w-14 h-14 rounded-full border-2 border-slate-200 border-t-[#006398] border-r-[#059669] animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-[#006398]">
              <ShieldCheck className="w-4 h-4 text-[#006398]" />
            </div>
          </div>
        </div>
        <h3 className="font-display font-bold text-sm text-slate-800 tracking-tight">{message}</h3>
        {submessage && <p className="text-xs text-slate-500 mt-1 max-w-sm font-sans">{submessage}</p>}
        {/* Progress Mini Bar */}
        <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3.5 border border-slate-200/80">
          <div
            className="h-full bg-gradient-to-r from-[#006398] via-[#0284c7] to-[#059669] transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  }

  // Full-viewport hero loading screen
  return (
    <div className="min-h-screen w-screen flex flex-col justify-between items-center bg-[#e2edf6] text-[#0b1c30] select-none relative overflow-x-hidden p-4 sm:p-6 font-sans">
      {/* Dynamic Ambient Glowing Orbs */}
      <div className="absolute -top-40 -left-40 w-[650px] h-[650px] rounded-full bg-gradient-to-br from-[#006398]/18 to-sky-400/10 blur-[140px] pointer-events-none transform-gpu" />
      <div className="absolute -top-32 -right-32 w-[650px] h-[650px] rounded-full bg-gradient-to-bl from-[#059669]/14 to-emerald-400/08 blur-[140px] pointer-events-none transform-gpu" />
      <div className="absolute -bottom-40 right-10 w-[550px] h-[550px] rounded-full bg-gradient-to-bl from-[#006398]/15 to-sky-300/08 blur-[140px] pointer-events-none transform-gpu" />
      <div className="absolute -bottom-40 left-10 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-[#059669]/12 to-emerald-300/06 blur-[140px] pointer-events-none transform-gpu" />

      {/* Subtle modern corporate grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.22]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(0, 99, 152, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(5, 150, 105, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Top subtle brand bar */}
      <header className="w-full max-w-5xl h-12 flex items-center justify-between text-xs text-slate-600 relative z-10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-xs tracking-wider text-slate-800 uppercase">
            GFL ChemSafe
          </span>
          <span className="text-slate-300">/</span>
          <span className="text-[11px] font-mono text-slate-500">Dahej Chemical Complex</span>
        </div>
        <div className="flex items-center gap-2 bg-white/70 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200/80 shadow-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-mono font-medium text-slate-700">SAP NetWeaver Gateway Online</span>
        </div>
      </header>

      {/* Centerpiece Hero Card */}
      <main className="w-full max-w-lg my-auto relative z-10">
        <div className="bg-gradient-to-b from-white via-[#fcfdff] to-sky-50/30 border border-slate-200/90 rounded-3xl shadow-[0_4px_6px_rgba(15,23,42,0.02),0_24px_60px_-12px_rgba(0,99,152,0.18),inset_0_1px_0_0_rgba(255,255,255,1)] p-7 sm:p-9 text-center relative overflow-hidden">
          {/* Top Multi-Stop Corporate Accent Gradient */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#006398] via-sky-400 via-[#059669] to-[#006398]" />

          {/* Logo with Concentric Orbital Glowing Rings */}
          <div className="relative inline-flex items-center justify-center mb-6 mt-1">
            {/* Pulsing Backlight */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#006398]/20 to-[#059669]/20 blur-xl animate-pulse" />

            {/* Outer Spinning Gradient Ring */}
            <div
              className="w-24 h-24 rounded-full p-[2.5px] bg-gradient-to-tr from-[#006398] via-sky-400 to-[#059669] animate-spin shadow-md"
              style={{ animationDuration: '3s' }}
            >
              <div className="w-full h-full bg-white rounded-full p-1" />
            </div>

            {/* Counter-Spinning Accent Dots Ring */}
            <div
              className="absolute w-28 h-28 rounded-full border border-dashed border-[#006398]/30 animate-spin"
              style={{ animationDuration: '9s', animationDirection: 'reverse' }}
            />

            {/* Center Logo Container */}
            <div className="absolute w-16 h-16 bg-white rounded-2xl shadow-inner border border-slate-100 flex items-center justify-center p-2.5">
              <img
                src="./GFL-Logo.webp"
                alt="GFL Logo"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
            </div>
          </div>

          {/* Title & System Identity */}
          <div className="space-y-1 mb-5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 border border-sky-200/80 text-[10px] font-mono font-bold text-[#006398] uppercase tracking-wider mb-1">
              <span>Enterprise Safety Platform</span>
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              GFL ChemSafe
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Permit To Work (PTW) • Industrial Hazard Control System
            </p>
          </div>

          {/* Animated Shimmer Progress Bar */}
          <div className="space-y-2 mb-6">
            <div className="flex items-center justify-between text-[11px] font-mono px-1">
              <span className="text-slate-600 font-semibold">{message}</span>
              <span className="text-[#006398] font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/90 relative">
              <div
                className="h-full bg-gradient-to-r from-[#006398] via-[#0284c7] to-[#059669] rounded-full transition-all duration-300 ease-out relative"
                style={{ width: `${progressPercent}%` }}
              >
                {/* Glowing Lead Shimmer */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_1.5s_infinite]" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 font-sans text-left px-1">
              {DEFAULT_STAGES[currentStageIndex]?.detail || submessage}
            </p>
          </div>

          {/* Dynamic Stepper Checklist */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 text-left space-y-2 mb-5">
            {DEFAULT_STAGES.map((stage, idx) => {
              const isDone = idx < currentStageIndex;
              const isCurrent = idx === currentStageIndex;
              return (
                <div key={stage.label} className="flex items-center gap-2.5 text-xs transition-colors">
                  <div className="shrink-0 flex items-center justify-center w-4 h-4">
                    {isDone ? (
                      <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">
                        ✓
                      </span>
                    ) : isCurrent ? (
                      <span className="w-3.5 h-3.5 border-2 border-[#006398] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                    )}
                  </div>
                  <span
                    className={`truncate transition-all ${
                      isDone
                        ? 'text-slate-500 line-through'
                        : isCurrent
                        ? 'text-[#006398] font-semibold'
                        : 'text-slate-400'
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Slow Connection Fallback / Manual Actions */}
          {showSlowWarning && onManualSignIn && (
            <div className="mb-4 p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-left flex items-start gap-2.5 animate-in fade-in duration-300">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[11px] text-amber-800 leading-snug">
                  Session discovery is taking longer than expected. You can continue waiting or sign in directly with your SAP User ID.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onManualSignIn}
                    className="px-3 py-1.5 bg-[#006398] hover:bg-[#004f7a] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <span>Sign In Manually</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onReload}
                    className="px-2.5 py-1.5 border border-slate-300 hover:bg-white text-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reload</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Security & Protocol Badges Strip */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-[#006398]" />
              <span>TLS 1.3 / FIPS 140-3</span>
            </span>
            <span className="flex items-center gap-1">
              <Server className="w-3 h-3 text-emerald-600" />
              <span>OData V4 • S/4HANA</span>
            </span>
          </div>
        </div>
      </main>

      {/* Corporate Minimalist Footer */}
      <footer className="w-full max-w-5xl h-10 flex items-center justify-between text-xs text-slate-500 relative z-10 shrink-0">
        <span className="text-[11px] font-medium text-slate-500">
          © Gujarat Fluorochemicals Limited (GFL) • Dahej Complex
        </span>
        <div className="text-[10px] font-mono text-slate-400 hidden sm:flex items-center gap-2">
          <span>OSHA 1910.119 PSM</span>
          <span>•</span>
          <span>ISO 45001:2018 EHS Certified</span>
        </div>
      </footer>
    </div>
  );
};

export default AppLoadingScreen;

