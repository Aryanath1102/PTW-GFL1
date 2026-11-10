import React, { useState, useEffect, useRef } from 'react';
import { useSapAuth, MODULE_REGISTRY, ModuleId } from './core/auth/sapAuthContext';
import type { SapIsolationHeader } from './core/types/isolation.types';
import type { PermitDeepInsertResponse } from './core/types/ptw.types';
import { SapLoginPage } from './shared/components/SapLoginPage';
import { StitchHeader } from './shared/components/StitchHeader';
import { ModuleLaunchpad } from './features/dashboard/ModuleLaunchpad';
import { ComingSoonModule } from './shared/components/ComingSoonModule';
import { PermitProcedureWorkspace } from './features/permits/PermitProcedureWorkspace';
import { PermitCreateModule } from './features/permits/PermitCreateModule';
import { PermitDisplayWorkspace } from './features/permits/PermitDisplayWorkspace';
import { IsolationWorkspace } from './features/isolation/IsolationWorkspace';
import { GasTesterWorkspace } from './features/gastest/GasTesterWorkspace';
import { PermitApproverWorkspace } from './features/approvals/PermitApproverWorkspace';
import { PermitAcceptorWorkspace } from './features/approvals/PermitAcceptorWorkspace';
import { PermitAreaOperatorWorkspace } from './features/approvals/PermitAreaOperatorWorkspace';
import { ReportModule } from './features/dashboard/ReportModule';
import { SafetyMapWorkspace } from './features/map/SafetyMapWorkspace';
import { AdminWorkspace } from './features/admin/AdminWorkspace';
import { OfflineNotificationBanner } from './shared/components/OfflineNotificationBanner';
import { SapReauthModal } from './shared/components/SapReauthModal';
import { AppLoadingScreen } from './shared/components/AppLoadingScreen';

export const App: React.FC = () => {
  const {
    isAuthenticated,
    isModuleUnlocked,
    user,
    loading,
    isSessionRestoring,
    isReauthRequired,
    reauthenticate,
    cancelReauth,
    skipSessionRestore,
    error
  } = useSapAuth();

  // Restore active workspace module from sessionStorage to survive page reloads and reauth
  const [selectedModule, setSelectedModuleState] = useState<ModuleId | null>(() => {
    try {
      return (sessionStorage.getItem('gfl_ptw_active_module') as ModuleId) || null;
    } catch {
      return null;
    }
  });

  const [revisionPermit, setRevisionPermit] = useState<PermitDeepInsertResponse | null>(null);
  const [returnedIsolation, setReturnedIsolation] = useState<SapIsolationHeader | null>(null);
  const permitScrollY = useRef<number | null>(null);
  const [returnModule, setReturnModule] = useState<ModuleId | null>(null);

  const setSelectedModule = (mod: ModuleId | null) => {
    if (mod !== 'permit-create' && mod !== 'create-isolation') {
      setReturnModule(null);
      setReturnedIsolation(null);
      permitScrollY.current = null;
    }
    setSelectedModuleState(mod);
    try {
      if (mod) {
        sessionStorage.setItem('gfl_ptw_active_module', mod);
      } else {
        sessionStorage.removeItem('gfl_ptw_active_module');
      }
    } catch {
      // ignore
    }
  };

  // Guarantee that every screen/page always opens at the very top (never mid-scroll)
  useEffect(() => {
    const top = selectedModule === 'permit-create' ? permitScrollY.current ?? 0 : 0;
    const frame = requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: 'instant' }));
    if (selectedModule === 'permit-create') permitScrollY.current = null;
    return () => cancelAnimationFrame(frame);
  }, [selectedModule]);

  // 0. Session Restoration Screen (Prevents login flicker on browser reload)
  if (isSessionRestoring) {
    return (
      <AppLoadingScreen
        message="Restoring SAP User Session..."
        submessage="Validating single sign-on credentials & authorization matrix with SAP Gateway"
        onManualSignIn={skipSessionRestore}
      />
    );
  }

  // 1. If not authenticated, display Modern Login Page
  if (!isAuthenticated) {
    return <SapLoginPage />;
  }

  const activeModuleDef = selectedModule
    ? MODULE_REGISTRY.find((m) => m.id === selectedModule) || MODULE_REGISTRY[0]
    : null;

  // 2. Authenticated Application Shell (Full width, No left row sidebar)
  return (
    <div className="min-h-screen flex flex-col text-[#0b1c30] relative selection:bg-[#006398] selection:text-white">
      {/* Ambient Glows */}
      <div className="no-print fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        <div className="absolute -top-40 -left-40 w-[650px] h-[650px] rounded-full bg-gradient-to-br from-[#006398]/12 to-sky-400/08 blur-[140px] transform-gpu" />
        <div className="absolute -top-32 -right-32 w-[650px] h-[650px] rounded-full bg-gradient-to-bl from-[#059669]/08 to-emerald-400/05 blur-[140px] transform-gpu" />
        <div className="absolute top-1/3 -right-48 w-[550px] h-[550px] rounded-full bg-gradient-to-bl from-[#006398]/09 to-sky-300/05 blur-[140px] transform-gpu" />
        <div className="absolute bottom-10 -left-40 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#059669]/07 to-emerald-300/04 blur-[140px] transform-gpu" />
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(0, 99, 152, 0.06) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(5, 150, 105, 0.04) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      {/* Top Corporate Command Header */}
      <StitchHeader
        onGoHome={() => setSelectedModule(null)}
        isHome={selectedModule === null}
        onOpenMap={() => setSelectedModule('safety-map')}
        isMapActive={selectedModule === 'safety-map'}
      />

      {/* Real-time Network Disconnection Notification */}
      <div className="no-print fixed top-16 inset-x-0 z-40">
        <OfflineNotificationBanner />
      </div>

      {/* In-Place Non-Destructive SAP Re-authentication Modal */}
      <SapReauthModal
        isOpen={isReauthRequired}
        user={user}
        onReauth={reauthenticate}
        onLogout={cancelReauth}
        error={error}
      />

      {/* Main Content Area: Padding top for fixed header (zeroed during print) */}
      <main className="flex-1 pt-16 min-h-[calc(100vh-4rem)] print:pt-0 print:p-0 print:m-0 print:min-h-0">
        {/* Preserve the live permit and its current step during an isolation request. */}
        {!loading && isModuleUnlocked('permit-create') &&
          (selectedModule === 'permit-create' || (selectedModule === 'create-isolation' && returnModule === 'permit-create')) && (
          <div hidden={selectedModule !== 'permit-create'}>
          <PermitCreateModule
            user={user}
            returnedIsolation={returnedIsolation}
            onBack={() => {
              setRevisionPermit(null);
              setReturnModule(null);
              setSelectedModule(null);
            }}
            onNavigateModule={(modId: any) => {
              permitScrollY.current = window.scrollY;
              setReturnedIsolation(null);
              setReturnModule('permit-create');
              setSelectedModule(modId);
            }}
            revisionPermit={revisionPermit}
          />
          </div>
        )}
        {loading ? (
          <div className="py-20 flex justify-center">
            <AppLoadingScreen
              compact
              message="Authenticating SAP User & Roles..."
              submessage="Querying SAP OData V4 services for user safety profile and authorization matrix"
            />
          </div>
        ) : user?.unlockedModules.length === 0 ? (
          <div className="max-w-xl mx-auto mt-20 bg-white border rounded-2xl p-8 text-center">
            <h2 className="text-xl font-bold">No modules assigned</h2>
            <p className="mt-3">{user.fullName && user.fullName !== user.id ? `${user.fullName} (${user.id})` : user.id}, you have access to the PTW application, but no active module roles are assigned to your account. Please contact your PTW application administrator to request access to the required modules.</p>
          </div>
        ) : selectedModule === null ? (
          /* KPI Card Launchpad: All modules displayed as interactive KPI cards */
          <ModuleLaunchpad
            user={user}
            onSelectModule={(moduleId) => setSelectedModule(moduleId)}
          />
        ) : !isModuleUnlocked(selectedModule) ? (
          /* Role Gate Shield: Displays if direct access to locked module is attempted */
          <div className="max-w-xl mx-auto mt-20 bg-gradient-to-b from-white via-white to-red-50/50 border border-red-200/90 rounded-3xl p-8 sm:p-10 text-center shadow-[0_16px_40px_-8px_rgba(220,38,38,0.12),inset_0_1px_0_0_rgba(255,255,255,1)]">
            <div className="w-16 h-16 bg-gradient-to-br from-red-50 to-white text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-200 shadow-sm">
              <span className="material-symbols-outlined text-[36px]">shield_lock</span>
            </div>
            <h2 className="font-display font-bold text-xl text-slate-900">Module Access Restricted</h2>
            <p className="text-xs text-gray-600 mt-2 leading-relaxed">
              Current SAP User <strong className="text-gray-900 font-mono">{user?.id}</strong> has role(s):{' '}
              <span className="text-[#006398] font-mono font-bold bg-blue-50 px-1.5 py-0.5 rounded">
                {user?.roles.join(', ') || 'NONE'}
              </span>
              . This workspace requires higher operational authorization.
            </p>
            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-center gap-3">
              <button
                onClick={() => setSelectedModule(null)}
                className="px-4 py-2 bg-[#006398] hover:bg-[#004f7a] text-white rounded-lg text-xs font-mono font-bold transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
                <span>Return to Launchpad</span>
              </button>
            </div>
          </div>
        ) : selectedModule === 'permit-create' ? (
          null
        ) : selectedModule === 'permit-details' ? (
          <PermitDisplayWorkspace
            user={user}
            onBack={() => setSelectedModule(null)}
            onRevisePermit={(permit) => {
              setRevisionPermit(permit);
              setSelectedModule('permit-create');
            }}
          />
        ) : selectedModule === 'create-isolation' || selectedModule === 'display-isolation' || selectedModule === 'isolation' ? (
          <IsolationWorkspace
            key={selectedModule}
            module={selectedModule}
            user={user}
            returnToCaller={Boolean(returnModule)}
            onCreated={returnModule === 'permit-create' ? setReturnedIsolation : undefined}
            onBack={() => {
              if (returnModule) {
                const target = returnModule;
                setReturnModule(null);
                setSelectedModule(target);
              } else {
                setSelectedModule(null);
              }
            }}
          />
        ) : selectedModule === 'permit-approver' ? (
          <PermitApproverWorkspace
            user={user}
            onBack={() => setSelectedModule(null)}
          />
        ) : selectedModule === 'permit-issuer' ? (
          <PermitAcceptorWorkspace
            user={user}
            onBack={() => setSelectedModule(null)}
          />
        ) : selectedModule === 'permit-area-owner' ? (
          <PermitAreaOperatorWorkspace
            user={user}
            onBack={() => setSelectedModule(null)}
          />
        ) : selectedModule === 'gas-tester' ? (
          <GasTesterWorkspace
            user={user}
            onBack={() => setSelectedModule(null)}
          />
        ) : selectedModule === 'report' ? (
          activeModuleDef && (
            <ReportModule
              module={activeModuleDef}
              user={user}
              onBack={() => setSelectedModule(null)}
              onOpenPermit={() => setSelectedModule('permit-details')}
            />
          )
        ) : selectedModule === 'safety-map' ? (
          <SafetyMapWorkspace
            onBack={() => setSelectedModule(null)}
          />
        ) : selectedModule === 'admin' ? (
          <AdminWorkspace
            user={user}
            onBack={() => setSelectedModule(null)}
          />
        ) : selectedModule ? (
          <PermitProcedureWorkspace key={selectedModule} module={selectedModule} user={user} onBack={() => setSelectedModule(null)} />
        ) : (
          /* Active Unlocked Module Workspace Fallback */
          activeModuleDef && (
            <ComingSoonModule
              module={activeModuleDef}
              user={user}
              onBack={() => setSelectedModule(null)}
            />
          )
        )}
      </main>
    </div>
  );
};

export default App;
