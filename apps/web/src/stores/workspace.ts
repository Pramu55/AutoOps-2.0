import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface WorkspaceOrg {
  id: string;
  name: string;
  slug: string;
  avatarUrl?: string | null;
}

interface WorkspaceState {
  currentOrg: WorkspaceOrg | null;
  orgs: WorkspaceOrg[];

  setCurrentOrg: (org: WorkspaceOrg) => void;
  setOrgs: (orgs: WorkspaceOrg[]) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentOrg: null,
      orgs: [],

      setCurrentOrg: (org) => set({ currentOrg: org }),
      setOrgs: (orgs) => set({ orgs }),
      reset: () => set({ currentOrg: null, orgs: [] }),
    }),
    {
      name: 'autoops-workspace',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ currentOrg: state.currentOrg }),
    },
  ),
);
