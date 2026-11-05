import { getDefaultSapClient } from '../../core/auth/sapClient';
import React, { useState, useEffect } from 'react';
import { useSapAuth } from '../../core/auth/sapAuthContext';
import { toast } from '../context/ToastContext';
import { 
  ShieldCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Server, 
  Globe, 
  AlertTriangle, 
  CheckCircle2, 
  PhoneCall, 
  UserCheck 
} from 'lucide-react';

export const SapLoginPage: React.FC = () => {
  const { login, loading, error, getRememberedUserId } = useSapAuth();

  const [userId, setUserId] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [client, setClient] = useState<string>(getDefaultSapClient);
  const [language, setLanguage] = useState<string>('EN');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberUser, setRememberUser] = useState<boolean>(true);

  // Auto-fill remembered SAP User ID on initial load
  useEffect(() => {
    const remembered = getRememberedUserId();
    if (remembered) {
      setUserId(remembered);
    }
  }, [getRememberedUserId]);

  if (!import.meta.env.DEV) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <section className="max-w-lg bg-white rounded-2xl border p-8 space-y-4">
          <h1 className="text-xl font-bold">SAP PTW access</h1>
          <p role="alert">{error || 'Open this application from SAP Fiori using your signed-in SAP account.'}</p>
          <p>After signing in to SAP Fiori, retry to verify your PTW access.</p>
          <button className="bg-blue-700 text-white rounded-lg px-4 py-2" disabled={loading}
            onClick={() => void login({ userId: '' })}>
            {loading ? 'Verifying SAP access...' : 'Retry SAP session'}
          </button>
        </section>
      </main>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) {
      toast.warning('SAP User ID is required.', { title: 'Mandatory Field Missing' });
      return;
    }
    const cleanPassword = password.trim() ? password : undefined;
    const success = await login({
      userId: userId.trim(),
      password: cleanPassword,
      client,
      language,
      rememberUser,
    });
    if (success) {
      toast.success(`Welcome back, ${userId.toUpperCase()}!`, { title: 'Authentication Successful' });
    } else {
      toast.error(
        error ||
          (cleanPassword
            ? 'Authentication failed. Please verify credentials.'
            : 'No active SAP session detected. Please enter your password or sign in to your SAP host.'),
        { title: 'Sign-in Failed' }
      );
    }
  };

  return (
    <div className="min-h-screen w-screen text-[#0b1c30] flex flex-col justify-between font-sans select-none relative overflow-x-hidden">
      {/* Dynamic Ambient Logo Brand Glow (Blue & Green) - Balanced Light Shade */}
      <div className="absolute -top-40 -left-40 w-[650px] h-[650px] rounded-full bg-gradient-to-br from-[#006398]/13 to-sky-400/08 blur-[140px] pointer-events-none transform-gpu" />
      <div className="absolute -top-32 -right-32 w-[650px] h-[650px] rounded-full bg-gradient-to-bl from-[#059669]/09 to-emerald-400/05 blur-[140px] pointer-events-none transform-gpu" />
      <div className="absolute bottom-0 right-10 w-[550px] h-[550px] rounded-full bg-gradient-to-bl from-[#006398]/10 to-sky-300/05 blur-[140px] pointer-events-none transform-gpu" />
      <div className="absolute bottom-10 left-10 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-[#059669]/08 to-emerald-300/05 blur-[140px] pointer-events-none transform-gpu" />

      {/* Subtle modern brand background grid */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.18]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(0, 99, 152, 0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(5, 150, 105, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: '36px 36px'
        }}
      />

      {/* Top Clean Corporate Header */}
      <header className="h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 sm:px-8 flex items-center justify-between shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] z-20 shrink-0">
        <div className="flex items-center gap-3">
          <img
            src="./GFL-Logo.webp"
            alt="Gujarat Fluorochemicals Limited"
            className="h-8 w-auto object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
          <div className="h-6 w-px bg-slate-200 mx-0.5"></div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-sm text-slate-900 tracking-tight">
                GFL ChemSafe
              </span>
              {/* <span className="text-[10px] font-mono font-bold bg-[#006398]/10 text-[#006398] px-2 py-0.5 rounded-full border border-[#006398]/20">
                DAHEJ COMPLEX
              </span> */}
            </div>
            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
              Gujarat Fluorochemicals Limited • Operations Console
            </span>
          </div>
        </div>

        {/* Header Right Badges */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1 rounded-full text-xs font-mono text-slate-600">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-slate-700">SAP Gateway Online</span>
          </div>
          <span className="bg-sky-50 text-[#006398] border border-sky-200 px-2.5 py-1 rounded-lg text-xs font-mono font-bold">
            Client: {client || 'Automatic'}
          </span>
        </div>
      </header>

      {/* Main Centered Minimalist Login Workspace with Sculpted Depth */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 z-10 my-4">
        <div className="w-full max-w-md bg-gradient-to-b from-white via-[#fcfdff] to-sky-50/25 border border-slate-200/90 rounded-3xl shadow-[0_4px_6px_rgba(15,23,42,0.02),0_20px_48px_-8px_rgba(0,99,152,0.12),inset_0_1px_0_0_rgba(255,255,255,1)] overflow-hidden transition-all relative">
          
          {/* Card Header with GFL Logo */}
          <div className="px-6 sm:px-8 pt-7 pb-6 text-center border-b border-slate-100/90 bg-gradient-to-b from-white to-sky-50/20">
            <div className="inline-flex p-3 bg-gradient-to-br from-white to-sky-50 border border-sky-100/90 rounded-2xl mb-3 shadow-[0_4px_12px_rgba(0,99,152,0.08),inset_0_1px_0_rgba(255,255,255,1)] items-center justify-center">
              <img
                src="./GFL-Logo.webp"
                alt="GFL Logo"
                className="h-10 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
            </div>
            <h1 className="font-display font-bold text-xl text-slate-900 tracking-tight">
              Permit To Work Portal
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Sign in with your corporate SAP credentials
            </p>
          </div>

          {/* Error Alert Banner */}
          {error && (
            <div className="mx-6 sm:mx-8 mt-5 p-3 bg-red-50 border border-red-200 text-red-900 rounded-xl flex items-start gap-2.5 shadow-sm animate-in fade-in duration-150">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex flex-col text-left">
                <span className="text-xs font-mono font-bold tracking-tight text-red-700 uppercase leading-snug">
                  {error}
                </span>
                <span className="text-[11px] text-red-600/80 mt-0.5">
                  Verify assigned SAP roles with Plant Safety or EHS Administrator.
                </span>
              </div>
            </div>
          )}

          {/* Clean Authentication Form */}
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4 text-left">
            {/* SAP User ID Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 tracking-wide">
                  SAP User ID / Staff Badge ID <span className="text-red-500">*</span>
                </label>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 font-medium">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>SSO Ready</span>
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value.toUpperCase())}
                  placeholder="Enter your SAP user ID"
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006398]/15 focus:border-[#006398] focus:bg-white transition-all"
                  required
                />
              </div>
            </div>

            {/* Password Field with Peek Toggle */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 tracking-wide">
                  Password <span className="text-slate-400 font-normal">(Optional for Host SSO)</span>
                </label>
                <span className="text-[11px] text-slate-400 font-medium">
                  Leave empty if signed into SAP
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password or leave blank for Host SSO"
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl pl-10 pr-11 py-2.5 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006398]/15 focus:border-[#006398] focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none p-0.5 rounded transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Client & Language Side-by-Side Selectors */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Server className="w-3 h-3 text-slate-400" />
                  <span>SAP Client</span>
                </label>
                <input
                  value={client}
                  onChange={(e) => setClient(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  inputMode="numeric"
                  maxLength={3}
                  pattern="[0-9]{3}"
                  placeholder="Automatic (SAP session)"
                  aria-label="SAP client (leave blank for automatic)"
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-[#006398] focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-slate-400" />
                  <span>Language</span>
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2 text-xs font-sans font-medium text-slate-900 focus:outline-none focus:border-[#006398] focus:bg-white transition-all"
                >
                  <option value="EN">EN (English)</option>
                  {/* <option value="GU">GU (ગુજરાતી)</option>
                  <option value="HI">HI (हिन्दी)</option>
                  <option value="DE">DE (German)</option> */}
                </select>
              </div>
            </div>

            {/* Remember Me & Security Tag */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberUser}
                  onChange={(e) => setRememberUser(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#006398] focus:ring-[#006398]/20 transition-all cursor-pointer"
                />
                <span className="text-xs text-slate-600 font-medium">
                  Remember User ID
                </span>
              </label>
              <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                {/* <span>FIPS 140-3 TLS 1.3</span> */}
              </span>
            </div>

            {/* Primary Sign-In Action Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-[#006398] to-[#004f7a] hover:from-[#005482] hover:to-[#004166] text-white font-display font-semibold text-sm rounded-xl shadow-[0_4px_14px_rgba(0,99,152,0.3),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_6px_20px_rgba(0,99,152,0.4)] transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Verifying SAP Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to PTW Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Discreet Help Strip with Light Tint */}
          <div className="px-6 sm:px-8 py-3.5 bg-gradient-to-r from-slate-50 via-slate-50 to-sky-50/40 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <PhoneCall className="w-3 h-3 text-[#006398]" />
              <span>EHS Hotline: <strong className="text-slate-700 font-mono">Ext. 4499</strong></span>
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              OData V4 • S/4HANA
            </span>
          </div>
        </div>
      </main>

      {/* Corporate Minimalist Footer */}
      <footer className="h-11 bg-white/90 backdrop-blur-sm border-t border-slate-200/80 px-4 sm:px-8 flex items-center justify-between text-xs text-slate-500 shrink-0 z-20">
        <div className="text-[11px] font-medium text-slate-500">
          © Gujarat Fluorochemicals Limited (GFL) 
        </div>
        <div className="text-[10px] font-mono text-slate-400 hidden sm:flex items-center gap-2">
          <span>OSHA 1910.119 PSM</span>
          <span>•</span>
          <span>ISO 45001:2018 EHS</span>
        </div>
      </footer>
    </div>
  );
};

export default SapLoginPage;


