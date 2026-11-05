import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { authApi } from '../../core/api/modules/auth.api';
import { activePtwRoles, normalizePtwRoles } from '../../core/auth/ptwAccess';
import type { SapUser } from '../../core/auth/sapAuthContext';

export interface UserPtwRolesResult {
  roles: string[];
  displayRoles: string[];
  isLoadingRoles: boolean;
  isUserAdmin: boolean;
  hasApproverRole: boolean;
  hasAcceptorRole: boolean;
  hasAreaOperatorRole: boolean;
  approverTiers: string[];
  refreshRoles: () => Promise<void>;
  roleSource: string;
}

/**
 * Custom React Hook: useUserPtwRoles
 *
 * Dedicated hook to read and evaluate the active user's authorizations strictly from
 * SAP OData V4 /UserRole entity set (SAP_USER, PTW_ROLE, ACTIVE).
 * Excludes generic /PFCGUsers PFCG roles to ensure proper PTW permission governance.
 */
export function useUserPtwRoles(user: SapUser | null): UserPtwRolesResult {
  const [snapshot, setSnapshot] = useState<{ key: string; roles: string[] } | null>(null);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const requestRef = useRef<AbortController | null>(null);
  const identityKey = user ? JSON.stringify([user.id, user.client]) : '';

  const fetchRolesFromSap = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSnapshot(null);
    setIsLoadingRoles(true);
    try {
      if (!user?.id) return;
      const records = await authApi.fetchUserRoles(user.id, user.client, controller.signal);
      if (!controller.signal.aborted) {
        setSnapshot({ key: identityKey, roles: activePtwRoles(records, user.id) });
      }
    } catch {
      // Unavailable or denied permissions never restore login-time or cached roles.
    } finally {
      if (!controller.signal.aborted) setIsLoadingRoles(false);
    }
  }, [user?.id, user?.client, identityKey]);

  useEffect(() => {
    void fetchRolesFromSap();
    return () => requestRef.current?.abort();
  }, [fetchRolesFromSap]);

  const displayRoles = useMemo(() => snapshot?.key === identityKey ? snapshot.roles : [], [snapshot, identityKey]);
  const normalizedRoles = useMemo(() => normalizePtwRoles(displayRoles), [displayRoles]);

  const isUserAdmin = useMemo(() => {
    return normalizedRoles.some((r) => r === 'PTW_ADMIN' || r === 'ZPTW_ADMIN');
  }, [normalizedRoles]);

  const approverTiers = useMemo(() => {
    const tiers: Array<'PTW_APPR1' | 'PTW_APPR2' | 'PTW_APPR3'> = [];
    if (isUserAdmin) {
      tiers.push('PTW_APPR1', 'PTW_APPR2', 'PTW_APPR3');
      return tiers;
    }
    if (normalizedRoles.some((r) => r === 'PTW_APPR1' || r === 'ZPTW_APPR1')) tiers.push('PTW_APPR1');
    if (normalizedRoles.some((r) => r === 'PTW_APPR2' || r === 'ZPTW_APPR2')) tiers.push('PTW_APPR2');
    if (normalizedRoles.some((r) => r === 'PTW_APPR3' || r === 'ZPTW_APPR3')) tiers.push('PTW_APPR3');
    return tiers;
  }, [normalizedRoles, isUserAdmin]);

  const hasApproverRole = useMemo(() => {
    if (isUserAdmin) return true;
    const approverRoles = [
      'PTW_APPR1',
      'PTW_APPR2',
      'PTW_APPR3',
      'PTW_APPROVER',
      'ZPTW_APPROVER',
      'ZPTW_APPR1',
      'ZPTW_APPR2',
      'ZPTW_APPR3'
    ];
    return normalizedRoles.some((r) => approverRoles.includes(r));
  }, [normalizedRoles, isUserAdmin]);

  const hasAcceptorRole = useMemo(() => {
    if (isUserAdmin) return true;
    const acceptorRoles = [
      'PTW_ACCP',
      'ZPTW_ACCP',
      'PTW_ACCEPTOR',
      'ZPTW_ACCEPTOR',
      'PTW_ISSUER',
      'ZPTW_ISSUER',
      'PTW_ISSU',
      'PTW_HOLDER',
      'PTW_HOLD',
      'ZPTW_HOLDER',
      'PTW_SAFE',
      'PTW_SAFETY_OFFICER'
    ];
    return normalizedRoles.some((r) => acceptorRoles.includes(r));
  }, [normalizedRoles, isUserAdmin]);

  const hasAreaOperatorRole = useMemo(() => {
    if (isUserAdmin) return true;
    const areaRoles = [
      'PTW_AREA_OPP',
      'ZPTW_AREA_OPP',
      'PTW_AOPR',
      'ZPTW_AOPR',
      'PTW_AREA_OWNER',
      'ZPTW_AREA_OWNER',
      'PTW_AREA_ROLE',
      'PTW_AREA_OPP_ROLE'
    ];
    return normalizedRoles.some((r) => areaRoles.includes(r));
  }, [normalizedRoles, isUserAdmin]);

  return {
    roles: normalizedRoles,
    displayRoles,
    isLoadingRoles,
    isUserAdmin,
    hasApproverRole,
    hasAcceptorRole,
    hasAreaOperatorRole,
    approverTiers,
    refreshRoles: fetchRolesFromSap,
    roleSource: 'SAP /UserRole'
  };
}
