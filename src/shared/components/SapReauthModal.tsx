import { getDefaultSapClient } from '../../core/auth/sapClient';
import React, { useState } from 'react';
import { SapUser } from '../../core/auth/sapAuthContext';

interface SapReauthModalProps {
  isOpen: boolean;
  user: SapUser | null;
  onReauth: (password: string) => Promise<boolean>;
  onLogout: () => void;
  error?: string | null;
}

export const SapReauthModal: React.FC<SapReauthModalProps> = ({
  isOpen,
  user,
  onReauth,
  onLogout,
  error: externalError
}) => {
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  if (!import.meta.env.DEV) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
        <section className="bg-white rounded-2xl p-8 max-w-md space-y-4" role="dialog" aria-modal="true" aria-label="SAP session verification">
          <h2 className="text-xl font-bold">Verify your SAP session</h2>
          <p>Return to SAP Fiori and sign in if requested. Then retry here.</p>
          {externalError && <p role="alert">{externalError}</p>}
          <button disabled={isSubmitting} className="bg-blue-700 text-white rounded px-4 py-2"
            onClick={async () => {
              setIsSubmitting(true);
              try { await onReauth(''); } finally { setIsSubmitting(false); }
            }}>Retry SAP session</button>
          <button className="px-4 py-2" onClick={onLogout}>Sign out of PTW</button>
        </section>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const ok = await onReauth(password);
      if (!ok) {
        setError('Authentication failed. Please verify your SAP password.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to re-authenticate with SAP Gateway.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-md w-full overflow-hidden p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <span className="material-symbols-outlined text-[28px]">lock_clock</span>
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg">SAP Session Expired</h3>
            <p className="text-xs text-slate-500">
              Re-authenticate to preserve all in-progress changes without losing your place.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 mb-5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Active User:</span>
            <span className="font-mono font-bold text-slate-800">{user?.id || 'SAP User'}</span>
          </div>
          {user?.fullName && (
            <div className="flex justify-between items-center text-xs mt-1">
              <span className="text-slate-500">Full Name:</span>
              <span className="font-medium text-slate-700">{user.fullName}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-xs mt-1">
            <span className="text-slate-500">Client / Plant:</span>
            <span className="font-mono text-slate-600">{user?.client || getDefaultSapClient() || 'Automatic'} / {user?.plant || '1002'}</span>
          </div>
        </div>

        {(error || externalError) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] text-red-500 shrink-0">error</span>
            <span>{error || externalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              SAP Password or Passcode
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter SAP logon password..."
              required
              autoFocus
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-sans focus:outline-none focus:border-[#006398] focus:ring-2 focus:ring-[#006398]/20 transition-all"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !password}
              className="flex-1 py-2.5 px-4 bg-[#006398] hover:bg-[#004f7a] disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Re-authenticating...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">verified_user</span>
                  <span>Restore Session</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs rounded-xl transition-colors"
            >
              Sign Out
            </button>
          </div>
        </form>

        <p className="text-[11px] text-slate-400 text-center mt-4">
          Your in-memory work is frozen safely in the background while you re-authenticate.
        </p>
      </div>
    </div>
  );
};
