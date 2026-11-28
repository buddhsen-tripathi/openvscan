import { type CredentialKind, isActiveRun } from "@openvscan/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAccount,
  getAccount,
  revokeOtherSessions,
  revokeSession,
  unlinkGithubAccount,
  updateProfile,
} from "@/lib/account-server";
import {
  connectRepository,
  disconnectRepository,
  getGithubConnection,
  getRepository,
  listConnectableRepos,
  listRepositories,
  type RepositorySettingsInput,
  startManualRun,
  syncGithub,
  updateRepositorySettings,
} from "@/lib/github-server";
import {
  cancelRun,
  deleteCredential,
  getOverview,
  getRun,
  listCredentials,
  listRuns,
  rerun,
  saveCredential,
} from "@/lib/server";
import {
  deleteSkill,
  getSkill,
  listSkills,
  previewSkillUrl,
  type SaveSkillInput,
  saveSkill,
} from "@/lib/skills-server";

const queryKeys = {
  account: ["account"] as const,
  overview: ["overview"] as const,
  runs: ["runs"] as const,
  run: (id: string) => ["runs", id] as const,
  credentials: ["credentials"] as const,
  github: ["github"] as const,
  connectableRepos: ["github", "connectable"] as const,
  repositories: ["repositories"] as const,
  repository: (id: string) => ["repositories", id] as const,
  skills: ["skills"] as const,
  skill: (id: string) => ["skills", id] as const,
};

/* ------------------------------ Overview ------------------------------ */

export function useOverviewQuery() {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: () => getOverview(),
    refetchInterval: (query) =>
      query.state.data?.recentRuns.some((r) => isActiveRun(r.status))
        ? 4000
        : 15_000,
  });
}

/* -------------------------------- Runs -------------------------------- */

export function useRunsQuery() {
  return useQuery({
    queryKey: queryKeys.runs,
    queryFn: () => listRuns(),
    // Webhooks start runs at any time; poll faster while one is in flight.
    refetchInterval: (query) =>
      query.state.data?.some((r) => isActiveRun(r.status)) ? 4000 : 15_000,
  });
}

export function useRunQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.run(id),
    queryFn: () => getRun({ data: id }),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data && isActiveRun(query.state.data.status) ? 4000 : false,
  });
}

export function useRerunMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rerun({ data: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runs });
      queryClient.invalidateQueries({ queryKey: queryKeys.repositories });
      queryClient.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export function useCancelRunMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelRun({ data: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.run(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.runs });
    },
  });
}

/* ------------------------------ Credentials --------------------------- */

export function useCredentialsQuery() {
  return useQuery({
    queryKey: queryKeys.credentials,
    queryFn: () => listCredentials(),
  });
}

export function useSaveCredentialMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { kind: CredentialKind; secret: string }) =>
      saveCredential({ data }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials }),
  });
}

export function useDeleteCredentialMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCredential({ data: id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials }),
  });
}

/* ---------------------------- Review skills --------------------------- */

export function useSkillsQuery() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: () => listSkills(),
  });
}

export function useSkillQuery(id: string | null) {
  return useQuery({
    queryKey: queryKeys.skill(id ?? ""),
    queryFn: () => getSkill({ data: id as string }),
    enabled: Boolean(id),
  });
}

export function usePreviewSkillUrlMutation() {
  return useMutation({
    mutationFn: (url: string) => previewSkillUrl({ data: url }),
  });
}

export function useSaveSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SaveSkillInput) => saveSkill({ data }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.skills }),
  });
}

export function useDeleteSkillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSkill({ data: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills });
      // Deleting a skill takes it off repositories.
      queryClient.invalidateQueries({ queryKey: queryKeys.repositories });
    },
  });
}

/* ------------------------------ Account ------------------------------ */

export function useAccountQuery() {
  return useQuery({
    queryKey: queryKeys.account,
    queryFn: () => getAccount(),
  });
}

/** Mutations that change the account refetch it on success. */
function useAccountMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.account }),
  });
}

export const useUpdateProfileMutation = () =>
  useAccountMutation((data: { name: string }) => updateProfile({ data }));

export const useUnlinkGithubMutation = () =>
  useAccountMutation((_?: undefined) => unlinkGithubAccount());

export const useRevokeSessionMutation = () =>
  useAccountMutation((id: string) => revokeSession({ data: id }));

export const useRevokeOtherSessionsMutation = () =>
  useAccountMutation((_?: undefined) => revokeOtherSessions());

export function useDeleteAccountMutation() {
  return useMutation({
    mutationFn: (confirmEmail: string) =>
      deleteAccount({ data: { confirmEmail } }),
  });
}

/* ------------------------------- GitHub ------------------------------- */

export function useGithubConnectionQuery() {
  return useQuery({
    queryKey: queryKeys.github,
    queryFn: () => getGithubConnection(),
  });
}

/** Reconcile with GitHub, then refresh everything that shows GitHub data. */
export function useSyncGithubMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => syncGithub(),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useConnectableReposQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.connectableRepos,
    queryFn: () => listConnectableRepos(),
    enabled,
  });
}

export function useRepositoriesQuery() {
  return useQuery({
    queryKey: queryKeys.repositories,
    queryFn: () => listRepositories(),
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.runs[0] && isActiveRun(r.runs[0].status))
        ? 5000
        : 30_000,
  });
}

export function useRepositoryQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.repository(id),
    queryFn: () => getRepository({ data: id }),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.runs.some((r) => isActiveRun(r.status)) ? 4000 : 15_000,
  });
}

export function useConnectRepositoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (githubRepoId: string) =>
      connectRepository({ data: githubRepoId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repositories });
      queryClient.invalidateQueries({ queryKey: queryKeys.connectableRepos });
    },
  });
}

export function useDisconnectRepositoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => disconnectRepository({ data: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repositories });
      queryClient.invalidateQueries({ queryKey: queryKeys.connectableRepos });
    },
  });
}

export function useUpdateRepositorySettingsMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<RepositorySettingsInput, "id">) =>
      updateRepositorySettings({ data: { id, ...data } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repository(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.repositories });
    },
  });
}

export function useStartManualRunMutation(repositoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (branch?: string) =>
      startManualRun({ data: { repositoryId, branch } }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.repository(repositoryId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.runs });
    },
  });
}
