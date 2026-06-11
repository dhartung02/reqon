import { useCallback, useEffect, useState } from 'react';
import type { Role, Status } from '../model';
import { initDb, getAllRoles, setRoleStatus, softDeleteRole } from '../db/store';

// App-wide roles state, backed by the expo-sqlite store. Mutations write through then refresh, so
// every screen reflects the persisted truth. (M4 layers sync on top of the same store.)
export function useRoles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setRoles(await getAllRoles());
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await initDb();
      const r = await getAllRoles();
      if (alive) {
        setRoles(r);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setStatus = useCallback(
    async (id: string, status: Status) => {
      await setRoleStatus(id, status);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await softDeleteRole(id);
      await refresh();
    },
    [refresh],
  );

  return { roles, loading, setStatus, remove };
}
