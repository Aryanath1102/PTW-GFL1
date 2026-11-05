import React, { useState, useEffect, useMemo } from 'react';
import type { SapUser } from '../../core/auth/sapAuthContext';
import { adminApi, UserRoleStats } from '../../core/api/modules/admin.api';
import { configApi } from '../../core/api/modules/config.api';
import type { SapConfigRecord } from '../../core/types/config.types';
import {
  SapUserRoleRecord,
  PFCGUserRecord,
  PTW_ROLE_CATALOG,
  getPtwRoleInfo
} from '../../core/types/admin.types';
import { toast } from '../../shared/context/ToastContext';

interface AdminWorkspaceProps {
  user: SapUser | null;
  onBack: () => void;
}

type SortField = 'SAP_USER' | 'PTW_ROLE' | 'ACTIVE' | 'CREATED_ON';
type SortDirection = 'ASC' | 'DESC';

export const AdminWorkspace: React.FC<AdminWorkspaceProps> = ({ user, onBack }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // User Roles State
  const [userRoles, setUserRoles] = useState<SapUserRoleRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Dynamic SAP Config Role Data (loaded from /Config?$filter=startswith(Config_Type, 'PTW_'))
  const [roleConfigs, setRoleConfigs] = useState<SapConfigRecord[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState<boolean>(false);

  // Pagination & Sorting State for 1 - 10,000+ users
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [pageJumpInput, setPageJumpInput] = useState<string>('1');
  const [sortField, setSortField] = useState<SortField>('SAP_USER');
  const [sortDirection, setSortDirection] = useState<SortDirection>('ASC');

  // Modals & Forms
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newUserId, setNewUserId] = useState<string>('');
  const [newRole, setNewRole] = useState<string>('PTW_ADMIN');
  const [newIsActive, setNewIsActive] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showPayloadDetails, setShowPayloadDetails] = useState<boolean>(false);

  // Value Help (F4) Modals
  const [showRoleF4Modal, setShowRoleF4Modal] = useState<boolean>(false);
  const [roleF4Target, setRoleF4Target] = useState<'ASSIGN' | 'FILTER' | 'EDIT'>('ASSIGN');
  const [roleF4Search, setRoleF4Search] = useState<string>('');
  const [roleF4TypeFilter, setRoleF4TypeFilter] = useState<string>('ALL');

  const [showUserF4Modal, setShowUserF4Modal] = useState<boolean>(false);
  const [userF4Target, setUserF4Target] = useState<'NEW' | 'EDIT'>('NEW');
  const [userF4Search, setUserF4Search] = useState<string>('');
  const [pfcgUsers, setPfcgUsers] = useState<PFCGUserRecord[]>([]);
  const [loadingPfcgUsers, setLoadingPfcgUsers] = useState<boolean>(false);
  const [pfcgError, setPfcgError] = useState<string | null>(null);

  // Edit Role Assignment Modal State
  const [editTarget, setEditTarget] = useState<SapUserRoleRecord | null>(null);
  const [editUserId, setEditUserId] = useState<string>('');
  const [editRole, setEditRole] = useState<string>('PTW_APPR1');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [showEditPayloadDetails, setShowEditPayloadDetails] = useState<boolean>(false);

  // Delete Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<SapUserRoleRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Diagnostics Modal State
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [probingService, setProbingService] = useState<boolean>(false);
  const [diagnosticsResult, setDiagnosticsResult] = useState<{
    status: number;
    latencyMs: number;
    etag?: string;
    count: number;
    rawPayload: any;
  } | null>(null);

  // Load user roles and dynamic config records
  const loadRoles = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const fetchedRoles = await adminApi.getUserRoles();
      setUserRoles(fetchedRoles);

      if (isManualRefresh) {
        toast.success(`Synchronized ${fetchedRoles.length} SAP user role mapping(s) from /UserRole`, {
          title: 'SAP Live Sync'
        });
      }
    } catch {
      toast.error('Failed to retrieve user roles from SAP Gateway', {
        title: 'Sync Error'
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadRoleConfigs = async (force = false) => {
    setLoadingConfigs(true);
    try {
      const configs = await configApi.fetchRoleConfigs(force);
      setRoleConfigs(configs);
    } catch (err) {
      console.warn('[AdminWorkspace] Could not load dynamic role configs:', err);
    } finally {
      setLoadingConfigs(false);
    }
  };

  // Load enterprise users from live SAP /PFCGUsers (No offline fallback)
  const loadPfcgUsers = async () => {
    setLoadingPfcgUsers(true);
    setPfcgError(null);
    try {
      const data = await adminApi.getPFCGUsers();
      setPfcgUsers(data);
    } catch (err: any) {
      console.error('[AdminWorkspace] Failed to fetch PFCGUsers:', err);
      setPfcgError(err?.message || 'Failed to fetch enterprise users from live SAP /PFCGUsers service.');
      setPfcgUsers([]);
    } finally {
      setLoadingPfcgUsers(false);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    loadRoles();
    loadRoleConfigs();
    loadPfcgUsers();
  }, []);

  useEffect(() => {
    if (showUserF4Modal && pfcgUsers.length === 0 && !loadingPfcgUsers) {
      loadPfcgUsers();
    }
  }, [showUserF4Modal]);

  // Compute live KPI metrics
  const stats: UserRoleStats = useMemo(() => {
    return adminApi.computeRoleStats(userRoles);
  }, [userRoles]);

  // Operational vs Safety role counts for ribbon
  const operationalCount = useMemo(() => {
    return userRoles.filter(
      (r) =>
        r.ACTIVE &&
        ['PTW_APPR1', 'PTW_APPR2', 'PTW_APPR3', 'PTW_AOPR', 'PTW_AREA_OPP', 'PTW_HOLD', 'PTW_ISSU', 'PTW_ACCP', 'PTW_ACCEPTOR', 'PTW_APPROVER', 'PTW_ISSUER', 'PTW_ISSU', 'PTW_HOLDER', 'PTW_AREA_OWNER'].some(
          (role) => r.PTW_ROLE === role || r.PTW_ROLE === `Z${role}`
        )
    ).length;
  }, [userRoles]);

  const safetyCount = useMemo(() => {
    return userRoles.filter(
      (r) =>
        r.ACTIVE &&
        ['PTW_GAS', 'PTW_SAFE', 'PTW_GAS_TESTER', 'PTW_ISOLATOR', 'PTW_ISO_REQ', 'PTW_SAFETY_OFFICER'].some(
          (role) => r.PTW_ROLE === role || r.PTW_ROLE === `Z${role}`
        )
    ).length;
  }, [userRoles]);

  // Master unique list of SAP users known across all role records (for enterprise typeahead & F4)
  const uniqueKnownUsers = useMemo(() => {
    const map = new Map<string, { count: number; roles: string[]; active: boolean; lastAudited: string }>();
    for (const r of userRoles) {
      const userKey = r.SAP_USER.trim().toUpperCase();
      const existing = map.get(userKey) || {
        count: 0,
        roles: [],
        active: false,
        lastAudited: r.CHANGED_ON || r.CREATED_ON || '2026-10-23'
      };
      existing.count += 1;
      if (!existing.roles.includes(r.PTW_ROLE)) {
        existing.roles.push(r.PTW_ROLE);
      }
      if (r.ACTIVE) {
        existing.active = true;
      }
      map.set(userKey, existing);
    }
    return Array.from(map.entries()).map(([userId, data]) => ({
      userId,
      ...data
    })).sort((a, b) => a.userId.localeCompare(b.userId));
  }, [userRoles]);

  // Parsed user list from input (supports single or batch entry)
  const parsedInputUsers = useMemo(() => {
    return Array.from(
      new Set(
        newUserId
          .split(/[\n,;]+/)
          .map((u) => u.trim().toUpperCase())
          .filter(Boolean)
      )
    );
  }, [newUserId]);

  const handleRemoveUserChip = (userToRemove: string) => {
    const updated = parsedInputUsers.filter((u) => u !== userToRemove);
    setNewUserId(updated.join(', '));
  };

  const handleAddUserSuggestion = (suggestedUser: string) => {
    if (parsedInputUsers.includes(suggestedUser)) return;
    const updated = [...parsedInputUsers, suggestedUser];
    setNewUserId(updated.join(', '));
  };

  const selectedRoleMeta = useMemo(() => {
    return getPtwRoleInfo(newRole);
  }, [newRole]);

  const selectedConfigRecord = useMemo(() => {
    return roleConfigs.find(
      (c) => c.Config_Code === newRole || c.Config_Code === `PTW_${newRole}`
    );
  }, [roleConfigs, newRole]);

  const editRoleMeta = useMemo(() => {
    return getPtwRoleInfo(editRole);
  }, [editRole]);

  const editConfigRecord = useMemo(() => {
    return roleConfigs.find(
      (c) => c.Config_Code === editRole || c.Config_Code === `PTW_${editRole}`
    );
  }, [roleConfigs, editRole]);

  // Consolidated Role Catalog: ONLY Official SAP Config Table Master Roles
  const mergedRoleOptions = useMemo(() => {
    const list: Array<{
      code: string;
      label: string;
      configType: string;
      desc: string;
      category?: string;
    }> = [];

    const seen = new Set<string>();

    // 1. Live records from SAP Gateway /Config endpoint
    for (const cfg of roleConfigs) {
      const code = cfg.Config_Code.trim().toUpperCase();
      const cfgType = cfg.Config_Type.trim().toUpperCase();
      if (cfgType.startsWith('PTW_') && cfgType !== 'PTW_CATALOG' && !seen.has(code)) {
        seen.add(code);
        const meta = getPtwRoleInfo(code);
        list.push({
          code,
          label: cfg.Config_Desc || meta.label,
          configType: cfgType,
          desc: cfg.Config_Desc || meta.description,
          category: meta.category
        });
      }
    }

    // 2. Fallback to official SAP Config Table roles only (Config_Type in PTW_ROLE_CATALOG starting with PTW_)
    for (const cat of PTW_ROLE_CATALOG) {
      if (!cat.configType || !cat.configType.startsWith('PTW_') || cat.configType === 'PTW_CATALOG') {
        continue; // Strictly omit any generic or non-config dummy roles
      }
      const code = cat.code.trim().toUpperCase();
      if (!seen.has(code)) {
        seen.add(code);
        list.push({
          code,
          label: cat.label,
          configType: cat.configType,
          desc: cat.description,
          category: cat.category
        });
      }
    }

    return list;
  }, [roleConfigs]);

  // Grouped options for select elements (Strictly Official SAP Config Types Only)
  const groupedRoleOptions = useMemo(() => {
    const groups: Record<string, typeof mergedRoleOptions> = {};
    for (const opt of mergedRoleOptions) {
      if (!opt.configType || opt.configType === 'PTW_CATALOG' || !opt.configType.startsWith('PTW_')) {
        continue;
      }
      const groupName = opt.configType;
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(opt);
    }
    return groups;
  }, [mergedRoleOptions]);

  // Filtered User Roles
  const filteredRoles = useMemo(() => {
    return userRoles.filter((item) => {
      // Search filter (User ID, Role, or Description)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toUpperCase();
        const roleMeta = getPtwRoleInfo(item.PTW_ROLE);
        const matchesUser = item.SAP_USER.toUpperCase().includes(q);
        const matchesRole = item.PTW_ROLE.toUpperCase().includes(q);
        const matchesDesc = roleMeta.label.toUpperCase().includes(q) || roleMeta.description.toUpperCase().includes(q);
        const matchesCreatedBy = (item.CREATED_BY || '').toUpperCase().includes(q);
        if (!matchesUser && !matchesRole && !matchesDesc && !matchesCreatedBy) return false;
      }

      // Role filter
      if (roleFilter !== 'ALL') {
        const clean = roleFilter.toUpperCase();
        if (
          item.PTW_ROLE.toUpperCase() !== clean &&
          item.PTW_ROLE.toUpperCase() !== `Z${clean}` &&
          clean !== `PTW_${item.PTW_ROLE.toUpperCase()}`
        ) {
          return false;
        }
      }

      // Status filter
      if (statusFilter === 'ACTIVE' && !item.ACTIVE) return false;
      if (statusFilter === 'INACTIVE' && item.ACTIVE) return false;

      return true;
    });
  }, [userRoles, searchQuery, roleFilter, statusFilter]);

  // Sorted User Roles
  const sortedRoles = useMemo(() => {
    return [...filteredRoles].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'SAP_USER') {
        cmp = a.SAP_USER.localeCompare(b.SAP_USER);
      } else if (sortField === 'PTW_ROLE') {
        cmp = a.PTW_ROLE.localeCompare(b.PTW_ROLE);
      } else if (sortField === 'ACTIVE') {
        cmp = (a.ACTIVE === b.ACTIVE ? 0 : a.ACTIVE ? -1 : 1);
      } else if (sortField === 'CREATED_ON') {
        const tA = (a.CREATED_ON || '') + (a.CREATED_AT || '');
        const tB = (b.CREATED_ON || '') + (b.CREATED_AT || '');
        cmp = tA.localeCompare(tB);
      }
      return sortDirection === 'ASC' ? cmp : -cmp;
    });
  }, [filteredRoles, sortField, sortDirection]);

  // Total pages and pagination slice
  const totalPages = Math.max(1, Math.ceil(sortedRoles.length / pageSize));

  // Reset current page when filters or page size change
  useEffect(() => {
    setCurrentPage(1);
    setPageJumpInput('1');
  }, [searchQuery, roleFilter, statusFilter, pageSize]);

  // Sync page jump input with current page
  useEffect(() => {
    setPageJumpInput(String(currentPage));
  }, [currentPage]);

  const paginatedRoles = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedRoles.slice(startIndex, startIndex + pageSize);
  }, [sortedRoles, currentPage, pageSize]);

  // Sorting header click handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortField(field);
      setSortDirection('ASC');
    }
  };

  // Handle Add Role (supports single user ID or batch comma/newline separated for 1-10000 users)
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = newUserId.trim();
    if (!rawInput) {
      toast.warning('Enter an SAP User ID or personnel number (e.g. SAP_USER or 10045)', {
        title: 'Missing User'
      });
      return;
    }

    // Split by comma, newline, or whitespace to support batch assignment
    const candidateUsers = Array.from(
      new Set(
        rawInput
          .split(/[\n,;]+/)
          .map((u) => u.trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (candidateUsers.length === 0) {
      toast.warning('No valid SAP usernames detected', { title: 'Invalid User Input' });
      return;
    }

    setIsSubmitting(true);
    try {
      const createdRecords: SapUserRoleRecord[] = [];
      const errors: string[] = [];

      for (const targetUser of candidateUsers) {
        try {
          const created = await adminApi.createUserRole({
            SAP_USER: targetUser,
            PTW_ROLE: newRole,
            ACTIVE: newIsActive
          });
          createdRecords.push(created);
        } catch (err: any) {
          errors.push(`${targetUser}: ${err.message || 'Failed'}`);
        }
      }

      if (createdRecords.length > 0) {
        setUserRoles((prev) => {
          const userSet = new Set(createdRecords.map((r) => `${r.SAP_USER}-${r.PTW_ROLE}`));
          const remaining = prev.filter((r) => !userSet.has(`${r.SAP_USER}-${r.PTW_ROLE}`));
          return [...createdRecords, ...remaining];
        });

        if (createdRecords.length === 1) {
          toast.success(`Role ${newRole} assigned to ${createdRecords[0].SAP_USER} in SAP /UserRole`, {
            title: 'Role Assigned'
          });
        } else {
          toast.success(
            `Role ${newRole} assigned to ${createdRecords.length} SAP users in batch`,
            { title: 'Batch Roles Assigned' }
          );
        }
      }

      if (errors.length > 0) {
        toast.warning(
          `Completed with ${errors.length} error(s): ${errors.slice(0, 2).join('; ')}`,
          { title: 'Partial Assignment' }
        );
      }

      if (createdRecords.length > 0) {
        setShowAddModal(false);
        setNewUserId('');
        setNewRole('PTW_ADMIN');
        setNewIsActive(true);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign role to SAP Gateway', {
        title: 'Assignment Failed'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Role Assignment
  const handleOpenEdit = (record: SapUserRoleRecord) => {
    setEditTarget(record);
    setEditUserId(record.SAP_USER);
    setEditRole(record.PTW_ROLE);
    setEditIsActive(Boolean(record.ACTIVE));
    setShowEditPayloadDetails(false);
  };

  const handleCloseEdit = () => {
    setEditTarget(null);
    setIsUpdating(false);
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;

    const cleanUser = editUserId.trim().toUpperCase();
    const cleanRole = editRole.trim().toUpperCase();

    if (!cleanUser) {
      toast.warning('SAP User ID cannot be empty', { title: 'Missing User' });
      return;
    }

    if (!cleanRole) {
      toast.warning('Please select a valid PTW Role', { title: 'Missing Role' });
      return;
    }

    const noChanges =
      cleanUser === editTarget.SAP_USER &&
      cleanRole === editTarget.PTW_ROLE &&
      editIsActive === editTarget.ACTIVE;

    if (noChanges) {
      toast.info('No changes detected for this user role assignment');
      setEditTarget(null);
      return;
    }

    // Check conflict if changing user or role to one that already exists
    const isConflict = userRoles.some(
      (r) =>
        r.SAP_USER === cleanUser &&
        r.PTW_ROLE === cleanRole &&
        !(editTarget.SAP_USER === cleanUser && editTarget.PTW_ROLE === cleanRole)
    );
    if (isConflict) {
      toast.error(
        `User ${cleanUser} is already assigned role ${cleanRole}. Please edit or delete that record instead.`,
        { title: 'Duplicate Role Assignment' }
      );
      return;
    }

    setIsUpdating(true);
    try {
      const updated = await adminApi.updateUserRole(
        { SAP_USER: editTarget.SAP_USER, PTW_ROLE: editTarget.PTW_ROLE },
        { SAP_USER: cleanUser, PTW_ROLE: cleanRole, ACTIVE: editIsActive }
      );

      setUserRoles((prev) => {
        const filtered = prev.filter(
          (r) => !(r.SAP_USER === editTarget.SAP_USER && r.PTW_ROLE === editTarget.PTW_ROLE)
        );
        return [updated, ...filtered];
      });

      if (cleanRole !== editTarget.PTW_ROLE || cleanUser !== editTarget.SAP_USER) {
        toast.success(
          `Updated role for ${cleanUser}: changed to ${cleanRole} (${editIsActive ? 'Active' : 'Inactive'})`,
          { title: 'Role Assignment Updated' }
        );
      } else {
        toast.success(
          `Updated status for ${cleanUser} (${cleanRole}) to ${editIsActive ? 'Active' : 'Inactive'}`,
          { title: 'Status Updated' }
        );
      }
      setEditTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update user role assignment on SAP Gateway', {
        title: 'Update Error'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle Toggle Active Status
  const handleToggleActive = async (record: SapUserRoleRecord) => {
    const updatedStatus = !record.ACTIVE;
    try {
      await adminApi.updateUserRoleStatus(record.SAP_USER, record.PTW_ROLE, updatedStatus);
      setUserRoles((prev) =>
        prev.map((r) =>
          r.SAP_USER === record.SAP_USER && r.PTW_ROLE === record.PTW_ROLE
            ? { ...r, ACTIVE: updatedStatus }
            : r
        )
      );

      toast.info(
        `User ${record.SAP_USER} role ${record.PTW_ROLE} is now ${updatedStatus ? 'ACTIVE' : 'INACTIVE'}`,
        { title: 'Role Status Updated' }
      );
    } catch {
      toast.error('Failed to update role status on SAP Gateway', { title: 'Update Error' });
    }
  };

  // Handle Delete Role
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await adminApi.deleteUserRole(deleteTarget.SAP_USER, deleteTarget.PTW_ROLE);
      setUserRoles((prev) =>
        prev.filter(
          (r) => !(r.SAP_USER === deleteTarget.SAP_USER && r.PTW_ROLE === deleteTarget.PTW_ROLE)
        )
      );

      toast.success(`Removed ${deleteTarget.PTW_ROLE} mapping for user ${deleteTarget.SAP_USER}`, {
        title: 'Role Revoked'
      });
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete role mapping on SAP Gateway', { title: 'Revocation Error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Run diagnostics probe
  const handleRunDiagnostics = async () => {
    setProbingService(true);
    try {
      const res = await adminApi.probeUserRoleService();
      setDiagnosticsResult(res);
      if (res.status >= 200 && res.status < 300) {
        toast.success(`Live SAP /UserRole response OK (${res.latencyMs}ms)`, {
          title: 'Gateway Diagnostics'
        });
      } else {
        toast.warning(`Service responded with HTTP ${res.status}`, {
          title: 'Gateway Warning'
        });
      }
    } catch {
      toast.error('Probe failed to reach SAP Gateway', { title: 'Network Error' });
    } finally {
      setProbingService(false);
    }
  };

  // Filtered F4 Role list
  const f4FilteredRoles = useMemo(() => {
    return mergedRoleOptions.filter((r) => {
      if (roleF4TypeFilter !== 'ALL' && r.configType !== roleF4TypeFilter) {
        return false;
      }
      if (roleF4Search.trim()) {
        const q = roleF4Search.trim().toUpperCase();
        return (
          r.code.toUpperCase().includes(q) ||
          r.label.toUpperCase().includes(q) ||
          r.desc.toUpperCase().includes(q) ||
          r.configType.toUpperCase().includes(q)
        );
      }
      return true;
    });
  }, [mergedRoleOptions, roleF4Search, roleF4TypeFilter]);

  // Master enterprise user list aggregated from live /PFCGUsers (No offline fallback)
  const enterpriseUsers = useMemo(() => {
    if (pfcgUsers.length === 0) return [];
    const map = new Map<string, {
      sapUser: string;
      firstName: string;
      lastName: string;
      fullName: string;
      email: string;
      roles: string[];
    }>();

    for (const u of pfcgUsers) {
      const key = (u.SAPUser || '').trim().toUpperCase();
      if (!key) continue;
      const existing = map.get(key) || {
        sapUser: key,
        firstName: (u.FirstName || '').trim(),
        lastName: (u.LastName || '').trim(),
        fullName: '',
        email: (u.EmailAddress || '').trim(),
        roles: []
      };
      if (!existing.firstName && u.FirstName) existing.firstName = u.FirstName.trim();
      if (!existing.lastName && u.LastName) existing.lastName = u.LastName.trim();
      if (!existing.email && u.EmailAddress) existing.email = u.EmailAddress.trim();
      if (u.PFCGRole && !existing.roles.includes(u.PFCGRole.trim())) {
        existing.roles.push(u.PFCGRole.trim());
      }
      existing.fullName = [existing.firstName, existing.lastName].filter(Boolean).join(' ') || existing.sapUser;
      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) => a.sapUser.localeCompare(b.sapUser));
  }, [pfcgUsers]);

  // Filtered F4 User list (scale of 1 - 10,000+ enterprise users)
  const f4FilteredUsers = useMemo(() => {
    if (!userF4Search.trim()) return enterpriseUsers;
    const q = userF4Search.trim().toUpperCase();
    return enterpriseUsers.filter(
      (u) =>
        u.sapUser.includes(q) ||
        u.fullName.toUpperCase().includes(q) ||
        u.email.toUpperCase().includes(q) ||
        u.roles.some((r) => r.toUpperCase().includes(q))
    );
  }, [enterpriseUsers, userF4Search]);

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4 animate-in fade-in duration-200 font-sans pb-16">
      {/* 1. Sleek Compact Command Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Title and Breadcrumb */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-mono font-bold transition-colors"
              title="Return to Launchpad"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Launchpad</span>
            </button>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-mono font-semibold text-slate-500">
              System Administration
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/60">
              User Role Governance
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <h1 className="text-xl sm:text-2xl font-display font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-600 text-2xl">
                admin_panel_settings
              </span>
              SAP User Role Governance
            </h1>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Live OData V4</span>
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600">
                Service: <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">/UserRole</code> & <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">/Config</code>
              </span>
              <span className="text-slate-400 hidden md:inline">·</span>
              <span className="text-slate-600 hidden md:inline">
                Client: <strong className="text-slate-900 font-mono">{user?.client || 'Automatic'}</strong>
              </span>
              <span className="text-slate-400 hidden lg:inline">·</span>
              <span className="text-slate-600 hidden lg:inline">
                Admin: <strong className="text-slate-900 font-mono">{user?.id || ''}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start lg:self-center">
          <button
            onClick={() => {
              setShowDiagnostics(true);
              if (!diagnosticsResult) handleRunDiagnostics();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-mono font-bold transition-colors"
            title="Inspect SAP OData connection and latency"
          >
            <span className="material-symbols-outlined text-[16px] text-slate-500">
              terminal
            </span>
            <span>Diagnostics</span>
          </button>

          <button
            onClick={() => {
              loadRoles(true);
              loadRoleConfigs(true);
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-mono font-bold transition-colors disabled:opacity-50"
            title="Refresh from SAP Gateway"
          >
            <span
              className={`material-symbols-outlined text-[16px] text-slate-500 ${
                refreshing ? 'animate-spin' : ''
              }`}
            >
              sync
            </span>
            <span>{refreshing ? 'Syncing...' : 'Sync SAP'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs font-mono font-bold shadow-sm shadow-rose-600/30 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Assign Role</span>
          </button>
        </div>
      </div>

      {/* 2. Space-Efficient Horizontal KPI Metric Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-xl">badge</span>
          </div>
          <div>
            <div className="text-xl font-display font-black text-slate-900 leading-tight">
              {stats.totalRoles.toLocaleString()}
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              Total Assigned ({stats.uniqueUsers.toLocaleString()} users)
            </div>
          </div>
        </div>

        <div className="bg-white border border-rose-200/80 rounded-xl p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-xl">shield_person</span>
          </div>
          <div>
            <div className="text-xl font-display font-black text-rose-900 leading-tight">
              {stats.activeAdmins}
            </div>
            <div className="text-[11px] font-mono text-rose-600">
              PTW System Administrators
            </div>
          </div>
        </div>

        <div className="bg-white border border-blue-200/80 rounded-xl p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-xl">verified</span>
          </div>
          <div>
            <div className="text-xl font-display font-black text-blue-900 leading-tight">
              {operationalCount.toLocaleString()}
            </div>
            <div className="text-[11px] font-mono text-blue-600">
              Approvers, Issuers & Holders
            </div>
          </div>
        </div>

        <div className="bg-white border border-amber-200/80 rounded-xl p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-xl">lock_reset</span>
          </div>
          <div>
            <div className="text-xl font-display font-black text-amber-900 leading-tight">
              {safetyCount.toLocaleString()}
            </div>
            <div className="text-[11px] font-mono text-amber-600">
              Safety Officers & Gas Testers
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs flex items-center gap-3 col-span-2 sm:col-span-1">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-xl">block</span>
          </div>
          <div>
            <div className="text-xl font-display font-black text-slate-600 leading-tight">
              {stats.inactiveRoles.toLocaleString()}
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              Inactive / Suspended Roles
            </div>
          </div>
        </div>
      </div>

      {/* 3. Integrated Filter & Search Toolbar with SAP F4 Value Help */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
            {/* Live Fast Search */}
            <div className="relative flex-1 max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search user ID (1-10000+), role code, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                  title="Clear search"
                >
                  <span className="material-symbols-outlined text-[16px]">cancel</span>
                </button>
              )}
            </div>

            {/* Dynamic Role Dropdown from SAP Config with F4 Button */}
            <div className="flex items-center gap-1.5">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="py-2 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              >
                <option value="ALL">All Roles ({userRoles.length})</option>
                {Object.entries(groupedRoleOptions).map(([groupName, items]) => (
                  <optgroup key={groupName} label={groupName}>
                    {items.map((r) => {
                      const count = userRoles.filter(
                        (ur) => ur.PTW_ROLE === r.code || ur.PTW_ROLE === `Z${r.code}`
                      ).length;
                      return (
                        <option key={r.code} value={r.code}>
                          {r.code} - {r.label} ({count})
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  setRoleF4Target('FILTER');
                  setShowRoleF4Modal(true);
                }}
                className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-mono font-bold transition-colors inline-flex items-center gap-1"
                title="SAP F4 Value Help: Search & Select Role from Config Table"
              >
                <span className="material-symbols-outlined text-[16px] text-rose-600">manage_search</span>
                <span>F4</span>
              </button>
            </div>

            {/* Status Segmented Buttons */}
            <div className="inline-flex rounded-xl p-0.5 bg-slate-100 border border-slate-200/80 text-xs font-mono font-bold">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  statusFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({userRoles.length})
              </button>
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                  statusFilter === 'ACTIVE'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Active ({userRoles.filter((r) => r.ACTIVE).length})</span>
              </button>
              <button
                onClick={() => setStatusFilter('INACTIVE')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                  statusFilter === 'INACTIVE'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                <span>Inactive ({userRoles.filter((r) => !r.ACTIVE).length})</span>
              </button>
            </div>
          </div>

          {/* Quick Config Table indicator */}
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 self-end md:self-center">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
              <span className={`material-symbols-outlined text-[14px] text-blue-600 ${loadingConfigs ? 'animate-spin' : ''}`}>
                {loadingConfigs ? 'sync' : 'table_chart'}
              </span>
              <span>Config Table: {roleConfigs.length} master roles</span>
            </span>
          </div>
        </div>

        {/* Active Filter Chips Bar */}
        {(searchQuery || roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="text-slate-400">Active Filters:</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs">
                <span>Query: "{searchQuery}"</span>
                <button onClick={() => setSearchQuery('')} className="hover:text-rose-900">
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </span>
            )}
            {roleFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs">
                <span>Role: {roleFilter}</span>
                <button onClick={() => setRoleFilter('ALL')} className="hover:text-blue-900">
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </span>
            )}
            {statusFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs">
                <span>Status: {statusFilter}</span>
                <button onClick={() => setStatusFilter('ALL')} className="hover:text-emerald-900">
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </span>
            )}
            <button
              onClick={() => {
                setSearchQuery('');
                setRoleFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="text-slate-500 hover:text-slate-800 underline text-[11px] ml-1"
            >
              Reset All
            </button>
          </div>
        )}
      </div>

      {/* 4. High-Density Scalable User Roles Table (Supports 1 to 10,000+ entries) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Top Pagination & Summary Header */}
        <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-600">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-900 font-bold">{sortedRoles.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> to{' '}
              <strong className="text-slate-900 font-bold">{Math.min(currentPage * pageSize, sortedRoles.length)}</strong> of{' '}
              <strong className="text-slate-900 font-bold">{sortedRoles.length.toLocaleString()}</strong> assignments
              {userRoles.length !== sortedRoles.length && (
                <span className="text-slate-400 ml-1">
                  (filtered from {userRoles.length.toLocaleString()} total)
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2 py-1 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 font-bold text-slate-800"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Quick Page Jump */}
            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
              <span className="text-slate-500">Page:</span>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = parseInt(pageJumpInput, 10);
                  if (!isNaN(target) && target >= 1 && target <= totalPages) {
                    setCurrentPage(target);
                  } else {
                    setPageJumpInput(String(currentPage));
                  }
                }}
                className="inline-flex items-center gap-1"
              >
                <input
                  type="text"
                  value={pageJumpInput}
                  onChange={(e) => setPageJumpInput(e.target.value)}
                  onBlur={() => {
                    const target = parseInt(pageJumpInput, 10);
                    if (!isNaN(target) && target >= 1 && target <= totalPages) {
                      setCurrentPage(target);
                    } else {
                      setPageJumpInput(String(currentPage));
                    }
                  }}
                  className="w-12 px-1.5 py-0.5 text-center text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 font-bold text-slate-900"
                />
                <span className="text-slate-400">/ {totalPages}</span>
              </form>
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-mono text-slate-600 uppercase tracking-wider select-none">
                <th
                  onClick={() => handleSort('SAP_USER')}
                  className="py-3.5 px-5 cursor-pointer hover:bg-slate-200/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>SAP User Account</span>
                    <span className="material-symbols-outlined text-[15px] text-slate-400">
                      {sortField === 'SAP_USER'
                        ? sortDirection === 'ASC'
                          ? 'arrow_upward'
                          : 'arrow_downward'
                        : 'unfold_more'}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('PTW_ROLE')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-200/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Assigned PTW Role</span>
                    <span className="material-symbols-outlined text-[15px] text-slate-400">
                      {sortField === 'PTW_ROLE'
                        ? sortDirection === 'ASC'
                          ? 'arrow_upward'
                          : 'arrow_downward'
                        : 'unfold_more'}
                    </span>
                  </div>
                </th>
                <th className="py-3.5 px-4 hidden sm:table-cell">Authorization Scope (Config)</th>
                <th
                  onClick={() => handleSort('ACTIVE')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-200/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Status</span>
                    <span className="material-symbols-outlined text-[15px] text-slate-400">
                      {sortField === 'ACTIVE'
                        ? sortDirection === 'ASC'
                          ? 'arrow_upward'
                          : 'arrow_downward'
                        : 'unfold_more'}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('CREATED_ON')}
                  className="py-3.5 px-4 hidden md:table-cell cursor-pointer hover:bg-slate-200/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Created Audit</span>
                    <span className="material-symbols-outlined text-[15px] text-slate-400">
                      {sortField === 'CREATED_ON'
                        ? sortDirection === 'ASC'
                          ? 'arrow_upward'
                          : 'arrow_downward'
                        : 'unfold_more'}
                    </span>
                  </div>
                </th>
                <th className="py-3.5 px-4 hidden lg:table-cell">Last Changed</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-slate-400">
                    <div className="w-7 h-7 border-2 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-2.5"></div>
                    <span className="font-mono text-xs">Querying /UserRole from SAP Gateway...</span>
                  </td>
                </tr>
              ) : sortedRoles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-slate-500">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-3">
                      <span className="material-symbols-outlined text-2xl">person_search</span>
                    </div>
                    <p className="font-sans font-bold text-slate-800 text-sm">No Role Assignments Found</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto font-sans">
                      {searchQuery || roleFilter !== 'ALL' || statusFilter !== 'ALL'
                        ? 'No user roles match the active filter criteria. Try clearing filters.'
                        : 'No role mappings exist on the SAP Gateway. Use "Assign Role" to create one.'}
                    </p>
                    {(searchQuery || roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setRoleFilter('ALL');
                          setStatusFilter('ALL');
                        }}
                        className="mt-3.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-mono font-bold text-slate-700 transition-colors"
                      >
                        Reset All Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedRoles.map((roleRec, idx) => {
                  const roleMeta = getPtwRoleInfo(roleRec.PTW_ROLE);
                  const isCurrentUser = roleRec.SAP_USER === user?.id;

                  return (
                    <tr
                      key={`${roleRec.SAP_USER}-${roleRec.PTW_ROLE}-${idx}`}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* SAP User Account */}
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0 font-mono">
                            {roleRec.SAP_USER.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                            <span className="font-mono tracking-tight">{roleRec.SAP_USER}</span>
                            {isCurrentUser && (
                              <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.2 rounded-full font-bold">
                                You
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Assigned PTW Role */}
                      <td className="py-3 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border shadow-2xs whitespace-nowrap bg-white">
                          <span className={`material-symbols-outlined text-[16px] ${roleMeta.colorBadge.split(' ')[1] || 'text-slate-700'}`}>
                            {roleMeta.icon}
                          </span>
                          <span className="text-slate-900 font-mono">{roleRec.PTW_ROLE}</span>
                        </div>
                      </td>

                      {/* Scope & Description */}
                      <td className="py-3 px-4 hidden sm:table-cell">
                        <div className="text-xs text-slate-800 font-medium">
                          {roleMeta.label}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs font-sans">
                          {roleMeta.description}
                        </div>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleActive(roleRec)}
                          className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                            roleRec.ACTIVE
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          }`}
                          title="Click to toggle activation status"
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              roleRec.ACTIVE ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                            }`}
                          ></span>
                          <span>{roleRec.ACTIVE ? 'Active' : 'Inactive'}</span>
                        </button>
                      </td>

                      {/* Created Audit */}
                      <td className="py-3 px-4 hidden md:table-cell text-slate-500 text-[11px] whitespace-nowrap">
                        <div className="text-slate-800 font-medium">
                          {roleRec.CREATED_BY || 'SYSTEM'}
                        </div>
                        <div className="text-slate-400">
                          {roleRec.CREATED_ON || '2026-10-23'} {roleRec.CREATED_AT && roleRec.CREATED_AT !== '::' ? roleRec.CREATED_AT : ''}
                        </div>
                      </td>

                      {/* Changed Audit */}
                      <td className="py-3 px-4 hidden lg:table-cell text-slate-500 text-[11px] whitespace-nowrap">
                        {roleRec.CHANGED_BY ? (
                          <>
                            <div className="text-slate-800 font-medium">{roleRec.CHANGED_BY}</div>
                            <div className="text-slate-400">
                              {roleRec.CHANGED_ON} {roleRec.CHANGED_AT && roleRec.CHANGED_AT !== '::' ? roleRec.CHANGED_AT : ''}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 opacity-90 group-hover:opacity-100">
                          <button
                            onClick={() => handleOpenEdit(roleRec)}
                            className="p-1.5 text-slate-400 hover:text-[#006398] rounded-lg hover:bg-sky-50 transition-colors"
                            title="Edit User Role Assignment"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>

                          <button
                            onClick={() => handleToggleActive(roleRec)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                            title={roleRec.ACTIVE ? 'Deactivate Role' : 'Activate Role'}
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {roleRec.ACTIVE ? 'toggle_on' : 'toggle_off'}
                            </span>
                          </button>

                          <button
                            onClick={() => setDeleteTarget(roleRec)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            title="Delete User Role Mapping"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Bottom Pagination Bar */}
        <div className="px-5 py-3.5 bg-slate-50/90 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
          <div className="text-slate-500 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
            <span>
              Connected to SAP Gateway: <code className="text-slate-800 font-bold">/UserRole</code> & <code className="text-slate-800 font-bold">/Config</code>
            </span>
          </div>

          {/* Navigation Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                title="First Page"
              >
                <span className="material-symbols-outlined text-[15px]">first_page</span>
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-0.5"
                title="Previous Page"
              >
                <span className="material-symbols-outlined text-[15px]">chevron_left</span>
                <span className="hidden sm:inline">Prev</span>
              </button>

              <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-900">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-0.5"
                title="Next Page"
              >
                <span className="hidden sm:inline">Next</span>
                <span className="material-symbols-outlined text-[15px]">chevron_right</span>
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                title="Last Page"
              >
                <span className="material-symbols-outlined text-[15px]">last_page</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. ASSIGN ROLE MODAL (Enhanced Enterprise UI/UX for 1-10,000+ Users & Config Master Data) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-2 sm:pt-3 pb-6 overflow-y-auto bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200/90 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-1.5rem)] animate-in zoom-in-95 duration-150 mt-1 sm:mt-2 mb-auto">
            {/* Top decorative gradient accent */}
            <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 via-rose-600 to-indigo-600"></div>

            {/* Modal Header */}
            <div className="px-6 pt-3.5 pb-2.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-50 to-pink-50 border border-rose-200/80 text-rose-600 flex items-center justify-center font-bold shadow-xs shrink-0">
                  <span className="material-symbols-outlined text-xl">admin_panel_settings</span>
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-base text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Assign PTW Authorization Role</span>
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                    <span>Service: <code className="bg-slate-100 text-slate-800 px-1 py-0.2 rounded font-bold">/UserRole</code></span>
                    <span>&middot;</span>
                    <span>Client: <strong className="text-slate-800">{user?.client || 'Automatic'}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Live OData V4</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-xl transition-colors"
                  title="Close (Esc)"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateRole} className="flex-1 overflow-y-auto px-6 py-3.5 space-y-3">
              {/* Section 1: SAP User Account / Personnel Number */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">
                    SAP User Account(s) / Personnel No. <span className="text-rose-500">*</span>
                  </label>
                  {parsedInputUsers.length > 1 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono font-bold">
                      <span className="material-symbols-outlined text-[13px]">groups</span>
                      <span>{parsedInputUsers.length} Users (Batch Mode)</span>
                    </span>
                  )}
                </div>

                {/* Integrated Input with F4 Button */}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-[18px]">
                    account_circle
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SAP_USER, 10001 (or comma-separated for batch)"
                    value={newUserId}
                    onChange={(e) => setNewUserId(e.target.value.toUpperCase())}
                    className="w-full pl-9 pr-28 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all text-slate-900 placeholder:font-normal placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUserF4Modal(true)}
                    className="absolute right-1 top-1 bottom-1 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-mono font-bold flex items-center gap-1 transition-colors shadow-2xs"
                    title="Browse all enterprise SAP user accounts (F4)"
                  >
                    <span className="material-symbols-outlined text-[14px] text-rose-600">manage_search</span>
                    <span>F4 Lookup</span>
                  </button>
                </div>

                {/* Parsed User Chips (Visual confirmation of target users) */}
                {parsedInputUsers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {parsedInputUsers.map((u) => (
                      <span
                        key={u}
                        className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-0.5 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-900 text-xs font-mono font-bold shadow-2xs animate-in fade-in"
                      >
                        <span className="w-4 h-4 rounded bg-rose-600 text-white text-[9px] flex items-center justify-center font-mono">
                          {u.slice(0, 2)}
                        </span>
                        <span>{u}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveUserChip(u)}
                          className="text-rose-400 hover:text-rose-700 hover:bg-rose-100 rounded p-0.5"
                          title={`Remove ${u}`}
                        >
                          <span className="material-symbols-outlined text-[12px]">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Quick Add Suggestions */}
                {(enterpriseUsers.length > 0 ? enterpriseUsers.map(u => ({ userId: u.sapUser, fullName: u.fullName })) : uniqueKnownUsers.map(u => ({ userId: u.userId, fullName: '' }))).length > 0 && (
                  <div className="flex items-center gap-1.5 pt-0.5 text-[11px] font-mono text-slate-500 flex-wrap">
                    <span className="text-slate-400">Quick add:</span>
                    {(enterpriseUsers.length > 0 ? enterpriseUsers.map(u => ({ userId: u.sapUser, fullName: u.fullName })) : uniqueKnownUsers.map(u => ({ userId: u.userId, fullName: '' })))
                      .slice(0, 5)
                      .map((u) => {
                        const isSelected = parsedInputUsers.includes(u.userId);
                        return (
                          <button
                            key={u.userId}
                            type="button"
                            onClick={() => handleAddUserSuggestion(u.userId)}
                            disabled={isSelected}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition-colors border ${
                              isSelected
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default'
                                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                            title={u.fullName ? `${u.userId} - ${u.fullName}` : u.userId}
                          >
                            + {u.userId}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Section 2: PTW Authorization Role (From SAP Config Master) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">
                    PTW Authorization Role (Config Master) <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    Source: Config Table ({mergedRoleOptions.length} Roles)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-[18px]">
                      military_tech
                    </span>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all text-slate-900"
                    >
                      {Object.entries(groupedRoleOptions).map(([groupName, items]) => (
                        <optgroup key={groupName} label={groupName}>
                          {items.map((r) => (
                            <option key={r.code} value={r.code}>
                              {r.code} &mdash; {r.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setRoleF4Target('ASSIGN');
                      setShowRoleF4Modal(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-mono font-bold transition-colors inline-flex items-center gap-1.5 shrink-0 shadow-2xs"
                    title="Browse full SAP Config table with descriptions (F4)"
                  >
                    <span className="material-symbols-outlined text-[15px]">manage_search</span>
                    <span>F4 Role Catalog</span>
                  </button>
                </div>

                {/* Selected Role Rich Information Card */}
                <div className="p-2.5 bg-slate-50/90 rounded-xl border border-slate-200/80 flex items-start gap-3 transition-all">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-rose-600 flex items-center justify-center font-bold shadow-2xs shrink-0">
                    <span className="material-symbols-outlined text-lg">
                      {selectedRoleMeta.icon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-mono font-extrabold text-slate-900">
                        {selectedRoleMeta.code}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-700 font-bold">
                        {selectedConfigRecord?.Config_Type || selectedRoleMeta.configType || 'CONFIG_ROLE'}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                        {selectedRoleMeta.category}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 mt-0.5">
                      {selectedRoleMeta.label}
                    </div>
                    <div className="text-[11px] text-slate-500 font-sans leading-tight">
                      {selectedRoleMeta.description}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Status (Active: true, Inactive: false) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">
                    Status <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">
                    Payload: <code className="font-bold text-slate-800">"ACTIVE": {newIsActive ? '"X"' : '""'}</code>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setNewIsActive(true)}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-between text-xs font-mono font-bold transition-all cursor-pointer ${
                      newIsActive
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                      <span>Active</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                      true
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewIsActive(false)}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-between text-xs font-mono font-bold transition-all cursor-pointer ${
                      !newIsActive
                        ? 'bg-slate-100 text-slate-800 border-slate-300 ring-2 ring-slate-400/20 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0"></span>
                      <span>Inactive</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold">
                      false
                    </span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-500 font-sans leading-tight">
                  {newIsActive
                    ? 'Active (X) will go to SAP in payload: user receives live authorization in PTW modules.'
                    : 'Inactive (empty) will go to SAP in payload: role mapping created in suspended/draft status.'}
                </div>
              </div>

              {/* Section 4: Collapsible Technical OData Details (Clean & Non-Intrusive) */}
              <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setShowPayloadDetails(!showPayloadDetails)}
                  className="w-full px-3 py-1.5 bg-slate-50/80 hover:bg-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-600 font-bold transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px] text-slate-500">terminal</span>
                    <span>Technical OData Payload (POST /UserRole)</span>
                  </span>
                  <span className="material-symbols-outlined text-[15px] text-slate-400">
                    {showPayloadDetails ? 'expand_less' : 'expand_more'}
                  </span>
                </button>

                {showPayloadDetails && (
                  <div className="p-2.5 bg-slate-900 text-emerald-400 font-mono text-[10px] space-y-1">
                    <div className="text-slate-400 text-[10px]">
                      // Endpoint: /sap/opu/odata4/sap/zptw_mamagement_srv/srvd_a2x/sap/zptw_services/0001/UserRole
                    </div>
                    <pre className="overflow-x-auto text-[10px]">
                      {JSON.stringify(
                        parsedInputUsers.length > 1
                          ? parsedInputUsers.map((u) => ({
                              SAP_USER: u,
                              PTW_ROLE: newRole,
                              ACTIVE: newIsActive ? 'X' : ''
                            }))
                          : {
                              SAP_USER: parsedInputUsers[0] || 'SAP_USER',
                              PTW_ROLE: newRole,
                              ACTIVE: newIsActive ? 'X' : ''
                            },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
              </div>
            </form>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] text-slate-600">Esc</kbd> to cancel
              </span>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 text-xs font-mono font-bold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleCreateRole}
                  disabled={isSubmitting || parsedInputUsers.length === 0}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs font-mono font-bold shadow-sm shadow-rose-600/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving to SAP...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
                      <span>
                        {parsedInputUsers.length > 1
                          ? `Assign to ${parsedInputUsers.length} Users`
                          : 'Confirm Role Assignment'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5B. EDIT USER ROLE MODAL (Live OData V4 UserRole Update) */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-2 sm:pt-3 pb-6 overflow-y-auto bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200/90 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-1.5rem)] animate-in zoom-in-95 duration-150 mt-1 sm:mt-2 mb-auto">
            {/* Top decorative gradient accent */}
            <div className="h-1.5 w-full bg-gradient-to-r from-sky-500 via-[#006398] to-indigo-600"></div>

            {/* Modal Header */}
            <div className="px-6 pt-3.5 pb-2.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-50 to-blue-50 border border-sky-200/80 text-[#006398] flex items-center justify-center font-bold shadow-xs shrink-0">
                  <span className="material-symbols-outlined text-xl">manage_accounts</span>
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Edit User Role Assignment</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-100 text-[#006398] font-bold">
                      {editTarget.SAP_USER}
                    </span>
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                    <span>Service: <code className="bg-slate-100 text-slate-800 px-1 py-0.2 rounded font-bold">/UserRole</code></span>
                    <span>&middot;</span>
                    <span>Client: <strong className="text-slate-800">{user?.client || 'Automatic'}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Live OData V4</span>
                </span>
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-xl transition-colors"
                  title="Close (Esc)"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleUpdateRole} className="flex-1 overflow-y-auto px-6 py-3.5 space-y-3">
              {/* Section 1: SAP User Account */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">
                    SAP User Account / Personnel No. <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">Entity Key Field</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[17px]">
                      badge
                    </span>
                    <input
                      type="text"
                      value={editUserId}
                      onChange={(e) => setEditUserId(e.target.value.toUpperCase())}
                      placeholder="e.g. SAP_USER or 1000045"
                      className="w-full pl-9 pr-3 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#006398]/20 focus:border-[#006398] transition-all text-slate-900 uppercase"
                      required
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setUserF4Target('EDIT');
                      setShowUserF4Modal(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-mono font-bold transition-colors inline-flex items-center gap-1.5 shrink-0 shadow-2xs"
                    title="Browse SAP Users in system (F4)"
                  >
                    <span className="material-symbols-outlined text-[15px]">person_search</span>
                    <span>F4 User Help</span>
                  </button>
                </div>
                {editUserId !== editTarget.SAP_USER && (
                  <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg font-mono">
                    ⚠️ Changing the SAP User will migrate this role from <strong>{editTarget.SAP_USER}</strong> to <strong>{editUserId}</strong> in SAP /UserRole.
                  </p>
                )}
              </div>

              {/* Section 2: PTW Authorization Role (From SAP Config Master) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">
                    PTW Authorization Role (Config Master) <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Target: {editRole}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[17px]">
                      security
                    </span>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#006398]/20 focus:border-[#006398] transition-all text-slate-900"
                    >
                      {Object.entries(groupedRoleOptions).map(([groupName, items]) => (
                        <optgroup key={groupName} label={groupName}>
                          {items.map((r) => (
                            <option key={r.code} value={r.code}>
                              {r.code} &mdash; {r.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setRoleF4Target('EDIT');
                      setShowRoleF4Modal(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-mono font-bold transition-colors inline-flex items-center gap-1.5 shrink-0 shadow-2xs"
                    title="Browse full SAP Config table with descriptions (F4)"
                  >
                    <span className="material-symbols-outlined text-[15px]">manage_search</span>
                    <span>F4 Role Catalog</span>
                  </button>
                </div>

                {/* Selected Role Rich Information Card */}
                <div className="p-2.5 bg-slate-50/90 rounded-xl border border-slate-200/80 flex items-start gap-3 transition-all">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-[#006398] flex items-center justify-center font-bold shadow-2xs shrink-0">
                    <span className="material-symbols-outlined text-lg">
                      {editRoleMeta.icon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-mono font-extrabold text-slate-900">
                        {editRoleMeta.code}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-700 font-bold">
                        {editConfigRecord?.Config_Type || editRoleMeta.configType || 'CONFIG_ROLE'}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                        {editRoleMeta.category}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 mt-0.5">
                      {editRoleMeta.label}
                    </div>
                    <div className="text-[11px] text-slate-500 font-sans leading-tight">
                      {editRoleMeta.description}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Status (Active: true, Inactive: false) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">
                    Status <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">
                    Payload: <code className="font-bold text-slate-800">"ACTIVE": {editIsActive ? '"X"' : '""'}</code>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditIsActive(true)}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-between text-xs font-mono font-bold transition-all cursor-pointer ${
                      editIsActive
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                      <span>Active</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                      true
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditIsActive(false)}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-between text-xs font-mono font-bold transition-all cursor-pointer ${
                      !editIsActive
                        ? 'bg-slate-100 text-slate-800 border-slate-300 ring-2 ring-slate-400/20 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0"></span>
                      <span>Inactive</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold">
                      false
                    </span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-500 font-sans leading-tight">
                  {editIsActive
                    ? 'Active (X) will go to SAP in payload: user has live authorization for this role.'
                    : 'Inactive (empty) will go to SAP in payload: role mapping is suspended/inactive.'}
                </div>
              </div>

              {/* Section 4: Audit Information */}
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60 text-[11px] font-mono text-slate-500 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <span className="text-slate-400">Created by: </span>
                  <span className="font-bold text-slate-700">{editTarget.CREATED_BY || 'SYSTEM'}</span>
                  <span className="text-slate-400"> on </span>
                  <span>{editTarget.CREATED_ON || '2026-10-23'} {editTarget.CREATED_AT && editTarget.CREATED_AT !== '::' ? editTarget.CREATED_AT : ''}</span>
                </div>
                {editTarget.CHANGED_BY && (
                  <div>
                    <span className="text-slate-400">Last changed by: </span>
                    <span className="font-bold text-slate-700">{editTarget.CHANGED_BY}</span>
                    <span className="text-slate-400"> on </span>
                    <span>{editTarget.CHANGED_ON} {editTarget.CHANGED_AT && editTarget.CHANGED_AT !== '::' ? editTarget.CHANGED_AT : ''}</span>
                  </div>
                )}
              </div>

              {/* Section 5: Technical OData Payload Accordion */}
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setShowEditPayloadDetails(!showEditPayloadDetails)}
                  className="text-[10px] font-mono text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {showEditPayloadDetails ? 'expand_less' : 'expand_more'}
                  </span>
                  <span>Technical OData Payload (SAP /UserRole)</span>
                </button>

                {showEditPayloadDetails && (
                  <div className="mt-1.5 p-2 bg-slate-900 text-slate-200 rounded-xl text-[10px] font-mono overflow-x-auto shadow-inner">
                    <pre className="text-[10px] leading-tight">
{`// Target: /UserRole(SAP_USER='${editTarget.SAP_USER}',PTW_ROLE='${editTarget.PTW_ROLE}')
{
  "SAP_USER": "${editUserId}",
  "PTW_ROLE": "${editRole}",
  "ACTIVE": "${editIsActive ? 'X' : ''}"
}`}
                    </pre>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  disabled={isUpdating}
                  className="px-4 py-2 text-xs font-mono font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#006398] to-indigo-700 hover:from-[#00527e] hover:to-indigo-800 text-white font-mono font-bold text-xs shadow-sm hover:shadow transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isUpdating ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">save</span>
                      <span>Update Role Assignment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. SAP F4 VALUE HELP MODAL: ROLES (From /Config?$filter=startswith(Config_Type, 'PTW_')) */}
      {showRoleF4Modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-3 sm:pt-5 pb-6 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] mt-1 sm:mt-2 mb-auto">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-xl">table_chart</span>
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                    <span>SAP F4 Value Help: PTW Roles</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-mono font-bold">
                      Config Table
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Service: <code>/Config?$filter=startswith(Config_Type, 'PTW_') and Active eq 'X'</code>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowRoleF4Modal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="p-3.5 border-b border-slate-200 bg-white flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Filter by Role Code (e.g. PTW_APPR1) or Description..."
                  value={roleF4Search}
                  onChange={(e) => setRoleF4Search(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  autoFocus
                />
                {roleF4Search && (
                  <button
                    onClick={() => setRoleF4Search('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  value={roleF4TypeFilter}
                  onChange={(e) => setRoleF4TypeFilter(e.target.value)}
                  className="py-2 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="ALL">All Config Types</option>
                  <option value="PTW_ACCEPTOR_ROLE">PTW_ACCEPTOR_ROLE (Acceptors)</option>
                  <option value="PTW_ADMIN">PTW_ADMIN (Administrators)</option>
                  <option value="PTW_APPROVAL_ROLE">PTW_APPROVAL_ROLE (Approvers)</option>
                  <option value="PTW_AREA_ROLE">PTW_AREA_ROLE (Area Operators)</option>
                  <option value="PTW_AREA_OPP_ROLE">PTW_AREA_OPP_ROLE (Area Operators)</option>
                  <option value="PTW_GASTESTER_ROLE">PTW_GASTESTER_ROLE (Gas Testers)</option>
                  <option value="PTW_HOLDER_ROLE">PTW_HOLDER_ROLE (Holders)</option>
                  <option value="PTW_ISOLATION_ROLE">PTW_ISOLATION_ROLE (Isolation Requestors)</option>
                  <option value="PTW_ISSUER_ROLE">PTW_ISSUER_ROLE (Issuers)</option>
                  <option value="PTW_SAFETY_ROLE">PTW_SAFETY_ROLE (Safety Officers)</option>
                </select>
              </div>
            </div>

            {/* Roles Table */}
            <div className="overflow-y-auto flex-1 p-0">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">Config Type</th>
                    <th className="py-2.5 px-4">Config Code</th>
                    <th className="py-2.5 px-4">Description (Config_Desc)</th>
                    <th className="py-2.5 px-3 text-center">Active</th>
                    <th className="py-2.5 px-4 text-right">Select</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {f4FilteredRoles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        No roles match the search term.
                      </td>
                    </tr>
                  ) : (
                    f4FilteredRoles.map((item) => {
                      const meta = getPtwRoleInfo(item.code);
                      return (
                        <tr
                          key={`${item.configType}-${item.code}`}
                          onClick={() => {
                            if (roleF4Target === 'ASSIGN') {
                              setNewRole(item.code);
                            } else if (roleF4Target === 'EDIT') {
                              setEditRole(item.code);
                            } else {
                              setRoleFilter(item.code);
                            }
                            setShowRoleF4Modal(false);
                            toast.info(`Selected role: ${item.code} (${item.label})`, {
                              title: 'Role Selected'
                            });
                          }}
                          className="hover:bg-blue-50/70 transition-colors cursor-pointer group"
                        >
                          <td className="py-2.5 px-4 font-mono text-slate-500 text-[11px]">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {item.configType}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[16px] text-rose-600">
                                {meta.icon}
                              </span>
                              <span>{item.code}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-slate-700">
                            <div className="font-semibold">{item.label}</div>
                            <div className="text-[11px] text-slate-400 font-sans">{item.desc}</div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              className="px-2.5 py-1 rounded-lg bg-blue-600 group-hover:bg-blue-700 text-white text-[11px] font-mono font-bold transition-colors"
                            >
                              Choose
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-mono text-slate-500">
              <span>Showing {f4FilteredRoles.length} role definition(s)</span>
              <button
                type="button"
                onClick={() => setShowRoleF4Modal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. SAP F4 VALUE HELP MODAL: ENTERPRISE USERS (/PFCGUsers) */}
      {showUserF4Modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-3 sm:pt-5 pb-6 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] mt-1 sm:mt-2 mb-auto">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-xl">group</span>
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                    <span>SAP F4 Value Help: Enterprise Users</span>
                    <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-mono font-bold">
                      {enterpriseUsers.length} Users
                    </span>
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                    <span>Service: <code className="bg-slate-200/60 px-1 py-0.2 rounded font-bold">/PFCGUsers</code></span>
                    <span>&middot;</span>
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Live OData V4
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => loadPfcgUsers()}
                  disabled={loadingPfcgUsers}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
                  title="Refresh users from live SAP /PFCGUsers"
                >
                  <span className={`material-symbols-outlined text-xl ${loadingPfcgUsers ? 'animate-spin text-purple-600' : ''}`}>
                    refresh
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowUserF4Modal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                  title="Close (Esc)"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>
            </div>

            {/* Filter */}
            <div className="p-3.5 border-b border-slate-200 bg-white">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Filter by SAP user ID, full name, email address, or PFCG role..."
                  value={userF4Search}
                  onChange={(e) => setUserF4Search(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  autoFocus
                />
                {userF4Search && (
                  <button
                    type="button"
                    onClick={() => setUserF4Search('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                  </button>
                )}
              </div>
            </div>

            {/* User List */}
            <div className="overflow-y-auto flex-1 p-0 min-h-[220px]">
              {loadingPfcgUsers ? (
                <div className="py-16 flex flex-col items-center justify-center gap-2.5 text-slate-500 font-mono text-xs">
                  <span className="material-symbols-outlined text-3xl animate-spin text-purple-600">sync</span>
                  <span className="font-semibold text-slate-700">Loading enterprise users from live SAP /PFCGUsers...</span>
                  <span className="text-[10px] text-slate-400">Querying /sap/opu/odata4/.../PFCGUsers</span>
                </div>
              ) : pfcgError ? (
                <div className="p-8 text-center">
                  <div className="w-11 h-11 mx-auto rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-2.5 border border-rose-200">
                    <span className="material-symbols-outlined text-2xl">error</span>
                  </div>
                  <h4 className="text-xs text-rose-800 font-mono font-bold mb-1">Live /PFCGUsers Request Error</h4>
                  <p className="text-[11px] text-slate-500 font-mono max-w-md mx-auto mb-4">{pfcgError}</p>
                  <button
                    type="button"
                    onClick={() => loadPfcgUsers()}
                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-mono font-bold transition-colors shadow-xs inline-flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">replay</span>
                    <span>Retry Live API Call</span>
                  </button>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4">SAP User ID</th>
                      <th className="py-2.5 px-4">Full Name</th>
                      <th className="py-2.5 px-4">Email ID</th>
                      <th className="py-2.5 px-3">PFCG Role</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {f4FilteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <span className="material-symbols-outlined text-2xl text-slate-300">person_off</span>
                            <span>{userF4Search ? `No enterprise users match "${userF4Search}".` : 'No users returned by /PFCGUsers.'}</span>
                            <span className="text-[10px] text-slate-400">You can also type the SAP username directly in the input field.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      f4FilteredUsers.map((u) => (
                        <tr
                          key={u.sapUser}
                          onClick={() => {
                            if (userF4Target === 'EDIT') {
                              setEditUserId(u.sapUser);
                            } else {
                              setNewUserId((prev) => {
                                const existing = prev
                                  .split(/[\n,;]+/)
                                  .map((s) => s.trim().toUpperCase())
                                  .filter(Boolean);
                                if (existing.length === 0) return u.sapUser;
                                if (!existing.includes(u.sapUser)) {
                                  return [...existing, u.sapUser].join(', ');
                                }
                                return prev;
                              });
                            }
                            setShowUserF4Modal(false);
                            toast.info(`Selected SAP User: ${u.sapUser} (${u.fullName})`, { title: 'User Selected' });
                          }}
                          className="hover:bg-purple-50/70 transition-colors cursor-pointer group"
                        >
                          <td className="py-2.5 px-4">
                            <div className="font-bold text-slate-900 font-mono flex items-center gap-2">
                              <span className="w-7 h-7 rounded-lg bg-gradient-to-tr from-slate-800 to-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-2xs">
                                {u.sapUser.slice(0, 2)}
                              </span>
                              <span className="tracking-tight text-slate-900">{u.sapUser}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-sans font-semibold text-slate-800 text-xs">
                              {u.fullName || '—'}
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="text-slate-600 text-xs font-mono flex items-center gap-1.5 truncate max-w-[240px]" title={u.email}>
                              {u.email ? (
                                <>
                                  <span className="material-symbols-outlined text-[14px] text-slate-400 shrink-0">mail</span>
                                  <span className="truncate">{u.email}</span>
                                </>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap gap-1">
                              {u.roles.length > 0 ? (
                                u.roles.map((r) => (
                                  <span
                                    key={r}
                                    className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-mono border border-purple-200/80 font-medium"
                                  >
                                    {r}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              className="px-2.5 py-1 rounded-lg bg-purple-600 group-hover:bg-purple-700 text-white text-[11px] font-mono font-bold transition-colors shadow-2xs"
                            >
                              Select
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-mono text-slate-500">
              <span>Found {f4FilteredUsers.length} enterprise user(s)</span>
              <button
                type="button"
                onClick={() => setShowUserF4Modal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. DIAGNOSTICS MODAL */}
      {showDiagnostics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-xl">terminal</span>
                <h3 className="font-display font-bold text-base text-slate-900">
                  SAP OData V4 Service Diagnostics
                </h3>
              </div>
              <button
                onClick={() => setShowDiagnostics(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="text-xs font-mono text-slate-600 space-y-1">
              <div>
                Target URL: <code className="text-slate-900 bg-slate-100 px-1 py-0.5 rounded">/sap/opu/odata4/sap/zptw_mamagement_srv/srvd_a2x/sap/zptw_services/0001/UserRole</code>
              </div>
              <div>Client: <strong>{user?.client || 'Automatic'}</strong></div>
            </div>

            {diagnosticsResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2.5 text-xs font-mono">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[10px] text-slate-400 block uppercase">HTTP Status</span>
                    <span className={`text-sm font-bold ${diagnosticsResult.status === 200 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {diagnosticsResult.status} OK
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[10px] text-slate-400 block uppercase">Latency</span>
                    <span className="text-sm font-bold text-blue-600">{diagnosticsResult.latencyMs} ms</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[10px] text-slate-400 block uppercase">Live Records</span>
                    <span className="text-sm font-bold text-purple-600">{diagnosticsResult.count} returned</span>
                  </div>
                </div>

                <div className="border border-slate-800 bg-slate-950 rounded-xl p-3 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-64">
                  <pre>{JSON.stringify(diagnosticsResult.rawPayload, null, 2)}</pre>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={handleRunDiagnostics}
                disabled={probingService}
                className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-mono font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                <span className={`material-symbols-outlined text-[15px] ${probingService ? 'animate-spin' : ''}`}>
                  speed
                </span>
                <span>{probingService ? 'Testing...' : 'Retest Endpoint'}</span>
              </button>

              <button
                onClick={() => setShowDiagnostics(false)}
                className="px-3.5 py-1.5 text-xs font-mono font-bold text-slate-600 hover:text-slate-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl">warning</span>
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="font-display font-bold text-base text-slate-900">
                Revoke Role Authorization?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                Are you sure you want to revoke <strong className="font-mono text-rose-700">{deleteTarget.PTW_ROLE}</strong> from user <strong className="font-mono text-slate-900">{deleteTarget.SAP_USER}</strong>?
              </p>
            </div>

            <div className="p-2 bg-slate-50 rounded-lg text-[10px] font-mono text-slate-500 text-center border border-slate-200">
              DELETE /UserRole(SAP_USER='{deleteTarget.SAP_USER}',PTW_ROLE='{deleteTarget.PTW_ROLE}')
            </div>

            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-mono font-bold shadow-xs transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Revoking...' : 'Confirm Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWorkspace;
