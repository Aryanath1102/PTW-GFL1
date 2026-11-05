/** Clear this application's protected records without touching other SAP apps. */
export function clearProtectedStorage(): void {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[name];
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key && (key.startsWith('gfl_ptw_draft_') || key.startsWith('ptw_acceptor_cache_') ||
          key.startsWith('ptw_area_operator_cache_') || key === 'ptw_recent_created_permits' || key === 'ptw_isolation_permit_links' ||
          key === 'gfl_ptw_active_module' || key.startsWith('gfl_ptw_user_session_'))) storage.removeItem(key);
      }
    } catch { /* Browser storage can be disabled. */ }
  }
}
