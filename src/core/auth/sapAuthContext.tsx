import { activePtwRoles, normalizePtwRoles } from './ptwAccess';
import { configApi } from '../api/modules/config.api';
import { checklistApi } from '../api/modules/checklist.api';
import { clearProtectedStorage } from './clearProtectedStorage';
import { getDefaultSapClient } from './sapClient';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { odataClient, authApi } from '../api';

export interface SapUserInfoRecord {
  UserId: string;
  FirstName: string;
  LastName: string;
  Email: string;
  Role: string;
}

export interface SapUser {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  roles: string[];
  plant: string;
  client: string;
  language: string;
  isFlpShell: boolean;
  unlockedModules: ModuleId[];
}

export type ModuleId = 
  | 'permit-create' 
  | 'permit-details'
  | 'create-isolation'
  | 'display-isolation' 
  | 'permit-approver' 
  | 'permit-issuer' 
  | 'permit-area-owner'
  | 'permit-holder' 
  | 'gas-tester' 
  | 'isolation' 
  | 'report'
  | 'safety-map'
  | 'admin';

export interface ModuleDefinition {
  id: ModuleId;
  title: string;
  subtitle: string;
  icon: string;
  requiredRoles: string[];
  badge: string;
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    id: 'permit-create',
    title: 'Permit Create / Permit Issuer',
    subtitle: 'Hazard JSA, PPE Matrix & Work Scope Creation',
    icon: 'note_add',
    requiredRoles: ['ZPTW_ISSU', 'PTW_ISSU', 'ZPTW_ADMIN', 'PTW_ADMIN'],
    badge: 'Requester'
  },
  {
    id: 'permit-details',
    title: 'Permit Display',
    subtitle: 'Permit Sheet, P&ID Schematic & Real-time Status',
    icon: 'description',
    requiredRoles: ['ZPTW_ISSU', 'PTW_ISSU', 'ZPTW_HOLDER', 'PTW_HOLDER', 'PTW_HOLD', 'ZPTW_APPROVER', 'PTW_APPROVER', 'PTW_APPR1', 'PTW_APPR2', 'PTW_APPR3', 'ZPTW_ISSUER', 'PTW_ISSUER', 'ZPTW_ACCEPTOR', 'PTW_ACCEPTOR', 'PTW_ACCP', 'ZPTW_GAS_TESTER', 'PTW_GAS_TESTER', 'PTW_GAS', 'ZPTW_ISOLATOR', 'PTW_ISOLATOR', 'ZPTW_ISO_REQ', 'PTW_ISO_REQ', 'ZPTW_AREA_OWNER', 'PTW_AREA_OWNER', 'PTW_AREA_OPP', 'PTW_AOPR', 'ZPTW_SAFETY_OFFICER', 'PTW_SAFETY_OFFICER', 'PTW_SAFE', 'ZPTW_ADMIN', 'PTW_ADMIN'],
    badge: 'Overview'
  },
  {
    id: 'create-isolation',
    title: 'Isolation Create',
    subtitle: 'Zero-Energy Breaker, Valve Lock & Blind Flange Registry',
    icon: 'lock_reset',
    requiredRoles: ['ZPTW_ISOLATOR', 'PTW_ISOLATOR', 'ZPTW_ISO_REQ', 'PTW_ISO_REQ', 'ZPTW_AREA_OWNER', 'PTW_AREA_OWNER', 'PTW_AREA_OPP', 'PTW_AOPR', 'ZPTW_ADMIN', 'PTW_ADMIN'],
    badge: 'Isolation'
  },
  {
    id: 'display-isolation',
    title: 'Isolation Display',
    subtitle: 'Zero-Energy Breaker, Valve Lock & Blind Flange Registry',
    icon: 'lock_reset',
    requiredRoles: ['ZPTW_ISOLATOR', 'PTW_ISOLATOR', 'ZPTW_ISO_REQ', 'PTW_ISO_REQ', 'ZPTW_AREA_OWNER', 'PTW_AREA_OWNER', 'PTW_AREA_OPP', 'PTW_AOPR', 'ZPTW_ADMIN', 'PTW_ADMIN'],
    badge: 'Isolation'
  },
  {
    id: 'permit-approver',
    title: 'Permit Approver',
    subtitle: 'Multi-Tier Authorization Chain & Digital Signatures',
    icon: 'draw',
    requiredRoles: ['ZPTW_APPROVER', 'PTW_APPROVER', 'PTW_APPR1', 'PTW_APPR2', 'PTW_APPR3', 'ZPTW_ADMIN', 'PTW_ADMIN'],
    badge: 'Approver'
  },
  {
    id: 'permit-issuer',
    title: 'Permit Acceptor',
    subtitle: 'Toolbox Briefing, Section K Agreement & Field Acceptance',
    icon: 'verified',
    requiredRoles: ['ZPTW_ISSUER', 'PTW_ISSUER', 'PTW_ISSU', 'ZPTW_ACCEPTOR', 'PTW_ACCEPTOR', 'PTW_ACCP', 'ZPTW_HOLDER', 'PTW_HOLDER', 'PTW_HOLD', 'ZPTW_SAFETY_OFFICER', 'PTW_SAFETY_OFFICER', 'PTW_SAFE', 'ZPTW_ADMIN', 'PTW_ADMIN'],
    badge: 'Acceptor'
  },
  {
    id: 'permit-area-owner',
    title: 'Permit Area Operator',
    subtitle: 'On-Site Worker Ledger, Suspension & Site Restoration',
    icon: 'engineering',
    requiredRoles: ['ZPTW_AREA_OWNER', 'PTW_AREA_OWNER', 'PTW_AREA_OPP', 'PTW_AOPR', 'ZPTW_ISSU', 'PTW_ISSU', 'ZPTW_ADMIN', 'PTW_ADMIN'],
    badge: 'Area Owner'
  },
  {
    id: 'permit-holder',
    title: 'Permit Holder',
    subtitle: 'On-Site Worker Ledger, Suspension & Site Restoration',
    icon: 'engineering',
    requiredRoles: ['ZPTW_HOLDER', 'PTW_HOLDER', 'PTW_HOLD', 'ZPTW_ISSU', 'PTW_ISSU', 'ZPTW_ADMIN', 'PTW_ADMIN'],
    badge: 'Holder'
  },
  {
    id: 'gas-tester',
    title: 'Gas Tester',
    subtitle: 'Atmospheric O2, LEL%, H2S, CO Calibration & Logs',
    icon: 'air',
    requiredRoles: ['ZPTW_GAS_TESTER', 'PTW_GAS_TESTER', 'PTW_GAS', 'ZPTW_SAFETY_OFFICER', 'PTW_SAFETY_OFFICER', 'PTW_SAFE', 'ZPTW_ADMIN', 'PTW_ADMIN'],
    badge: 'Gas Tester'
  },
  {
    id: 'report',
    title: 'Report',
    subtitle: 'Permit Registers, LOTO Logs & Safety Compliance Analytics',
    icon: 'bar_chart',
    requiredRoles: ['ZPTW_ISSU', 'PTW_ISSU', 'ZPTW_HOLDER', 'PTW_HOLDER', 'PTW_HOLD', 'ZPTW_APPROVER', 'PTW_APPROVER', 'PTW_APPR1', 'PTW_APPR2', 'PTW_APPR3', 'ZPTW_ISSUER', 'PTW_ISSUER', 'ZPTW_ACCEPTOR', 'PTW_ACCEPTOR', 'PTW_ACCP', 'ZPTW_SAFETY_OFFICER', 'PTW_SAFETY_OFFICER', 'PTW_SAFE', 'ZPTW_ISOLATOR', 'PTW_ISOLATOR', 'ZPTW_ISO_REQ', 'PTW_ISO_REQ', 'ZPTW_AREA_OWNER', 'PTW_AREA_OWNER', 'PTW_AREA_OPP', 'PTW_AOPR', 'ZPTW_GAS_TESTER', 'PTW_GAS_TESTER', 'PTW_GAS', 'ZPTW_ADMIN', 'PTW_ADMIN'],
    badge: 'Reports'
  },
  {
    id: 'safety-map',
    title: 'Safety Districts & Plant Map',
    subtitle: 'Interactive Dahej Demarcation Layout, 26 Districts & Road Grid',
    icon: 'map',
    requiredRoles: ['ZPTW_ISSU', 'PTW_ISSU', 'ZPTW_HOLDER', 'PTW_HOLDER', 'PTW_HOLD', 'ZPTW_APPROVER', 'PTW_APPROVER', 'PTW_APPR1', 'PTW_APPR2', 'PTW_APPR3', 'ZPTW_ISSUER', 'PTW_ISSUER', 'ZPTW_ACCEPTOR', 'PTW_ACCEPTOR', 'PTW_ACCP', 'ZPTW_SAFETY_OFFICER', 'PTW_SAFETY_OFFICER', 'PTW_SAFE', 'ZPTW_ISOLATOR', 'PTW_ISOLATOR', 'ZPTW_ISO_REQ', 'PTW_ISO_REQ', 'ZPTW_AREA_OWNER', 'PTW_AREA_OWNER', 'PTW_AREA_OPP', 'PTW_AOPR', 'ZPTW_GAS_TESTER', 'PTW_GAS_TESTER', 'PTW_GAS', 'ZPTW_ADMIN', 'PTW_ADMIN'],
    badge: 'Site Map'
  },
  {
    id: 'admin',
    title: 'PTW Admin',
    subtitle: 'SAP Role Mappings, Plant Master Data & Global Audits',
    icon: 'admin_panel_settings',
    requiredRoles: ['ZPTW_ADMIN', 'PTW_ADMIN'],
    badge: 'Admin'
  }
];

export interface LoginCredentials {
  userId: string;
  password?: string;
  client?: string;
  language?: string;
  rememberUser?: boolean;
}

export interface StoredUserSession {
  user: SapUser;
  timestamp: number;
  client: string;
  language: string;
}

export const SESSION_STORAGE_KEY = 'gfl_ptw_user_session_v2';
export const REMEMBERED_USER_KEY = 'gfl_ptw_remembered_userid';
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes Fiori idle timeout

interface SapAuthContextType {
  user: SapUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  isSessionRestoring: boolean;
  isReauthRequired: boolean;
  setIsReauthRequired: (val: boolean) => void;
  reauthenticate: (password: string) => Promise<boolean>;
  cancelReauth: () => void;
  error: string | null;
  activeModule: ModuleId;
  setActiveModule: (mod: ModuleId) => void;
  unlockedModules: ModuleDefinition[];
  hasRole: (role: string) => boolean;
  isModuleUnlocked: (moduleId: ModuleId) => boolean;
  login: (credentials: LoginCredentials, options?: { silent?: boolean; signal?: AbortSignal }) => Promise<boolean>;
  logout: () => void;
  switchUser: (userId: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  getRememberedUserId: () => string;
  skipSessionRestore: () => void;
}

const SapAuthContext = createContext<SapAuthContextType | undefined>(undefined);

// Extend window definition for SAP ushell container and BSP runtime
declare global {
  interface Window {
    sap?: {
      ushell?: {
        Container?: {
          getUser?: () => {
            getId: () => string;
            getFullName: () => string;
            getEmail: () => string;
          };
        };
      };
    };
    SAP_CURRENT_USER?: string;
    SAP_CURRENT_CLIENT?: string;
    SY_UNAME?: string;
    __SAP_USER__?: string;
  }
}

export const SapAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SapUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [isSessionRestoring, setIsSessionRestoring] = useState<boolean>(true);
  const [isReauthRequired, setIsReauthRequired] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleId>('permit-create');
  const restoreControllerRef = React.useRef<AbortController | null>(null);
  const loginAttemptRef = React.useRef(0);

  const skipSessionRestore = () => {
    if (restoreControllerRef.current) {
      restoreControllerRef.current.abort();
    }
    setIsSessionRestoring(false);
  };

  const computeUnlockedModules = (roles: string[]): ModuleId[] => {
    // Only active PTW administrators receive all modules.
    if (
      roles.includes('ZPTW_ADMIN') ||
      roles.includes('PTW_ADMIN')
    ) {
      return MODULE_REGISTRY.map((m) => m.id);
    }
    return MODULE_REGISTRY.filter((mod) =>
      mod.requiredRoles.some((reqRole) => roles.includes(reqRole))
    ).map((m) => m.id);
  };

  /**
   * Helper to persist active session to sessionStorage (Fiori reload persistence)
   */
  const persistSession = (
    loggedInUser: SapUser,
    client: string,
    lang: string,
    credentials?: LoginCredentials
  ) => {
    try {
      const sessionData: StoredUserSession = {
        user: loggedInUser,
        timestamp: Date.now(),
        client,
        language: lang
      };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));

      if (credentials?.rememberUser) {
        localStorage.setItem(REMEMBERED_USER_KEY, loggedInUser.id);
      } else if (credentials?.rememberUser === false) {
        localStorage.removeItem(REMEMBERED_USER_KEY);
      }
    } catch (e) {
      console.warn('[SapAuth] Could not persist session to sessionStorage:', e);
    }
  };

  /**
   * 1. Lifecycle Hook: Auto-restore session from SAP environment on app mount.
   * Identity is always verified through the current SAP server session.
   */
  useEffect(() => {
    const controller = new AbortController();
    restoreControllerRef.current = controller;
    const timeout = window.setTimeout(() => {
      controller.abort();
      restoreControllerRef.current = null;
      setError('SAP session discovery took too long. Please sign in, or ask support to check the SAP startup and PTW OData services.');
      setIsSessionRestoring(false);
    }, 20000);
    const restoreSession = async () => {
      try {
        sessionStorage.removeItem('gfl_ptw_user_session_v1');

        await login({ userId: '', client: getDefaultSapClient() }, { silent: true, signal: controller.signal });
      } catch (err) {
        console.warn('[SapAuth] Session restoration error:', err);
        try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* Storage may be blocked. */ }
      } finally {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted) setIsSessionRestoring(false);
      }
    };

    restoreSession();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      restoreControllerRef.current = null;
    };
  }, []);

  /**
   * 2. Inactivity Tracking & Session Heartbeat (Standard Fiori Inactivity Window)
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    let lastInteraction = Date.now();
    const updateSessionActivity = () => {
      const now = Date.now();
      if (now - lastInteraction > 30000) {
        lastInteraction = now;
        try {
          const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
          if (raw) {
            const parsed: StoredUserSession = JSON.parse(raw);
            parsed.timestamp = now;
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsed));
          }
        } catch {
          // ignore
        }
      }
    };

    const handleUserAction = () => updateSessionActivity();

    window.addEventListener('mousedown', handleUserAction, { passive: true });
    window.addEventListener('keydown', handleUserAction, { passive: true });
    window.addEventListener('touchstart', handleUserAction, { passive: true });

    const timeoutChecker = setInterval(() => {
      try {
        const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) {
          const parsed: StoredUserSession = JSON.parse(raw);
          if (Date.now() - parsed.timestamp > SESSION_IDLE_TIMEOUT_MS) {
            setIsReauthRequired(true);
            setError('Your SAP session has timed out due to inactivity.');
          }
        }
      } catch {
        // ignore
      }
    }, 60000);

    return () => {
      window.removeEventListener('mousedown', handleUserAction);
      window.removeEventListener('keydown', handleUserAction);
      window.removeEventListener('touchstart', handleUserAction);
      clearInterval(timeoutChecker);
    };
  }, [isAuthenticated]);

  /**
   * 3. Intercept 401 Unauthorized from SAP Gateway to trigger non-destructive in-place reauth
   */
  useEffect(() => {
    odataClient.onSessionExpired(() => {
      if (user) {
        setIsReauthRequired(true);
      } else {
        try {
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } catch {
          // ignore
        }
        authApi.clearSession();
        setUser(null);
        setIsAuthenticated(false);
        setError('Your SAP session was terminated by the server. Please log on again.');
      }
    });
  }, [user]);

  /**
   * Retrieve remembered SAP User ID from localStorage
   */
  const getRememberedUserId = (): string => {
    try {
      return localStorage.getItem(REMEMBERED_USER_KEY) || '';
    } catch {
      return '';
    }
  };

  /**
   * Login handler that queries SAP OData V4 userinfo endpoint
   */
  const login = async (
    credentials: LoginCredentials,
    options?: { silent?: boolean; signal?: AbortSignal }
  ): Promise<boolean> => {
    if (options?.signal?.aborted) return false;
    const attempt = ++loginAttemptRef.current;
    const cancelled = () => options?.signal?.aborted || attempt !== loginAttemptRef.current;
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }
    let targetId = credentials.userId.trim().toUpperCase();
    const client = credentials.client || getDefaultSapClient();
    const lang = credentials.language || 'EN';
    try {
      odataClient.clearCredentials();
      odataClient.setClient(client);
      // Localhost development can authenticate through the SAP proxy with real credentials.
      // Production BSP relies only on the existing SAP/Fiori session.
      if (credentials.password) {
        if (!import.meta.env.DEV) throw new Error('Sign in through SAP Fiori to access PTW.');
        if (!targetId) throw new Error('Enter your SAP user ID.');
        odataClient.setCredentials(targetId, credentials.password);
      }
      const identity = await authApi.fetchStartupUser(client, options?.signal);
      if (cancelled()) return false;
      if (!identity) throw new Error('SAP session could not be verified. Sign in through SAP Fiori, then retry.');
      if (targetId && targetId !== identity.id) throw new Error('The supplied user does not match the authenticated SAP session.');
      targetId = identity.id;
      const records = await authApi.fetchUserInfo(targetId, client, options?.signal);
      if (cancelled()) return false;
      const profile = records.find(r => r.UserId?.trim().toUpperCase() === targetId);
      if (!profile) throw new Error('You do not have PTW application access. Contact your administrator.');
      const roleEntries = await authApi.fetchUserRoles(targetId, client, options?.signal);
      if (cancelled()) return false;
      const roles = normalizePtwRoles(activePtwRoles(roleEntries, targetId));
      const unlocked = computeUnlockedModules(roles);
      const loggedInUser: SapUser = {
        id: targetId,
        firstName: profile.FirstName || '',
        lastName: profile.LastName || '',
        fullName: [profile.FirstName, profile.LastName].filter(Boolean).join(' ') || profile.UserId,
        email: profile.Email || '',
        roles,
        plant: '',
        client,
        language: lang,
        isFlpShell: Boolean(window.sap?.ushell?.Container),
        unlockedModules: unlocked,
      };
      setUser(loggedInUser);
      setIsAuthenticated(true);
      setActiveModule(unlocked[0] || 'permit-details');
      setIsReauthRequired(false);
      if (!options?.silent) {
        setError(null);
      }
      persistSession(loggedInUser, client, lang, credentials);
      return true;
    } catch (err) {
      if (cancelled()) return false;
      authApi.clearSession();
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      setUser(null);
      setIsAuthenticated(false);
      setError(err instanceof Error ? err.message : 'SAP sign-in failed.');
      return false;
    } finally {
      if (!options?.silent && attempt === loginAttemptRef.current) {
        setLoading(false);
      }
    }
  };

  /**
   * Complete SAP Logoff: clears session storage, revokes basic auth headers,
   * invokes SAP ICF logoff endpoint, and resets state.
   */
  const logout = () => {
    ++loginAttemptRef.current;
    restoreControllerRef.current?.abort();
    clearProtectedStorage();
    configApi.clearCache();
    checklistApi.clearCache();
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      authApi.clearSession();
      authApi.triggerIcfLogoff();
    } catch (e) {
      console.warn('[SapAuth] Error during logout:', e);
    }
    setUser(null);
    setIsAuthenticated(false);
    setIsReauthRequired(false);
    setLoading(false);
  };

  const switchUser = async (targetUserId: string) => {
    await login({ userId: targetUserId });
  };

  const hasRole = (role: string): boolean => {
    if (!user) return false;
    const clean = role.trim().toUpperCase();
    const altClean = clean.startsWith('Z') ? clean.substring(1) : `Z${clean}`;
    return (
      user.roles.includes(clean) ||
      user.roles.includes(altClean) ||
      user.roles.includes('ZPTW_ADMIN') ||
      user.roles.includes('PTW_ADMIN')
    );
  };

  const isModuleUnlocked = (moduleId: ModuleId): boolean => {
    if (!user) return false;
    return user.unlockedModules.includes(moduleId);
  };

  const reauthenticate = async (password: string): Promise<boolean> => {
    if (!user) return false;
    const ok = await login({
      userId: user.id,
      password,
      client: user.client,
      language: user.language
    });
    if (ok) {
      setIsReauthRequired(false);
      setError(null);
    }
    return ok;
  };

  const cancelReauth = () => {
    setIsReauthRequired(false);
    logout();
  };

  const unlockedModulesList = MODULE_REGISTRY.filter((mod) =>
    user ? user.unlockedModules.includes(mod.id) : false
  );

  return (
    <SapAuthContext.Provider
      value={{
        user,
        isAuthenticated,
        loading,
        isSessionRestoring,
        isReauthRequired,
        setIsReauthRequired,
        reauthenticate,
        cancelReauth,
        error,
        activeModule,
        setActiveModule,
        unlockedModules: unlockedModulesList,
        hasRole,
        isModuleUnlocked,
        login,
        logout,
        switchUser,
        refreshUser: async () => {
          if (user) await login({ userId: user.id, client: user.client, language: user.language });
        },
        getRememberedUserId,
        skipSessionRestore
      }}
    >
      {children}
    </SapAuthContext.Provider>
  );
};

export const useSapAuth = (): SapAuthContextType => {
  const context = useContext(SapAuthContext);
  if (!context) {
    throw new Error('useSapAuth must be used within a SapAuthProvider');
  }
  return context;
};
