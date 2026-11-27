import { type CredentialKind, isActiveRun } from "@openvscan/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAccount,
  revokeSession,
  setPassword,
  updateProfile,
} from "@/lib/account-server";
import { authClient } from "@/lib/auth-client";
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
  useAccountMutation((data: { name: string; image?: string | null }) =>
    updateProfile({ data }),
  );

/** Better Auth client calls resolve to `{ error }`; turn that into a throw. */
async function authCall(
  call: Promise<{ error: { message?: string } | null }>,
): Promise<void> {
  const { error } = await call;
  if (error) throw new Error(error.message || "Request failed");
}

export const useChangePasswordMutation = () =>
  useAccountMutation(
    (data: {
      currentPassword: string;
      newPassword: string;
      signOutOthers: boolean;
    }) =>
      authCall(
        authClient.changePassword({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          revokeOtherSessions: data.signOutOthers,
        }),
      ),
  );

export const useSetPasswordMutation = () =>
  useAccountMutation((newPassword: string) =>
    setPassword({ data: { newPassword } }),
  );

export const useUnlinkGithubMutation = () =>
  useAccountMutation((accountId: string) =>
    authCall(authClient.unlinkAccount({ accountId })),
  );

export const useRevokeSessionMutation = () =>
  useAccountMutation((id: string) => revokeSession({ data: id }));

export const useRevokeOtherSessionsMutation = () =>
  useAccountMutation((_?: undefined) =>
    authCall(authClient.revokeOtherSessions()),
  );

export function useDeleteAccountMutation() {
  return useMutation({
    // Password accounts confirm with the password; GitHub-only accounts need
    // a recent sign-in (Better Auth's fresh-session rule).
    mutationFn: (password?: string) =>
      authCall(authClient.deleteUser(password ? { password } : {})).catch(
        (err: Error) => {
          throw /fresh|expired/i.test(err.message)
            ? new Error(
                "For your security, sign out and sign in again, then delete the account within a day.",
              )
            : err;
        },
      ),
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
