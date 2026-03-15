import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { withApiBase } from '@/lib/api-client';

export interface ClaudeExtensionProfileOption {
  name: string;
  profileType: string;
  label: string;
  description: string;
}

export interface ClaudeExtensionHostOption {
  id: 'vscode' | 'cursor' | 'windsurf';
  label: string;
  settingsKey: string;
  disableLoginPromptKey?: string;
  settingsTargetLabel: string;
  description: string;
  defaultSettingsPath: string;
}

export interface ClaudeExtensionSetupPayload {
  profile: {
    requestedProfile: string;
    resolvedProfileName: string;
    profileType: string;
    label: string;
    description: string;
  };
  host: ClaudeExtensionHostOption;
  env: Array<{ name: string; value: string }>;
  warnings: string[];
  notes: string[];
  removeEnvKeys: string[];
  sharedSettings: {
    path: string;
    command: string;
    json: string;
  };
  ideSettings: {
    path: string;
    targetLabel: string;
    json: string;
  };
}

export interface ClaudeExtensionBinding {
  id: string;
  name: string;
  profile: string;
  host: ClaudeExtensionHostOption['id'];
  ideSettingsPath?: string;
  effectiveIdeSettingsPath: string;
  usesDefaultIdeSettingsPath: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaudeExtensionBindingInput {
  name: string;
  profile: string;
  host: ClaudeExtensionHostOption['id'];
  ideSettingsPath?: string;
  notes?: string;
}

export type ClaudeExtensionActionTarget = 'shared' | 'ide' | 'all';
export type ClaudeExtensionFileState = 'applied' | 'drifted' | 'missing' | 'unconfigured';

export interface ClaudeExtensionTargetStatus {
  target: 'shared' | 'ide';
  path: string;
  exists: boolean;
  mtime: number | null;
  state: ClaudeExtensionFileState;
  message: string;
}

export interface ClaudeExtensionBindingStatus {
  binding: ClaudeExtensionBinding;
  bindingId: string;
  sharedSettings: ClaudeExtensionTargetStatus;
  ideSettings: ClaudeExtensionTargetStatus;
}

const bindingsQueryKey = ['claude-extension-bindings'] as const;

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(withApiBase(url), {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export function useClaudeExtensionOptions() {
  return useQuery({
    queryKey: ['claude-extension-options'],
    queryFn: () =>
      requestJson<{ profiles: ClaudeExtensionProfileOption[]; hosts: ClaudeExtensionHostOption[] }>(
        '/claude-extension/profiles'
      ),
  });
}

export function useClaudeExtensionSetup(profile?: string, host: string = 'vscode') {
  return useQuery({
    queryKey: ['claude-extension-setup', profile, host],
    enabled: Boolean(profile),
    queryFn: () =>
      requestJson<ClaudeExtensionSetupPayload>(
        `/claude-extension/setup?profile=${encodeURIComponent(profile || '')}&host=${encodeURIComponent(host)}`
      ),
  });
}

export function useClaudeExtensionBindings() {
  return useQuery({
    queryKey: bindingsQueryKey,
    queryFn: () =>
      requestJson<{ bindings: ClaudeExtensionBinding[] }>('/claude-extension/bindings'),
  });
}

export function useClaudeExtensionBindingStatus(bindingId?: string) {
  return useQuery({
    queryKey: ['claude-extension-binding-status', bindingId],
    enabled: Boolean(bindingId),
    queryFn: () =>
      requestJson<ClaudeExtensionBindingStatus>(
        `/claude-extension/bindings/${encodeURIComponent(bindingId || '')}/verify`
      ),
  });
}

export function useCreateClaudeExtensionBinding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (binding: ClaudeExtensionBindingInput) =>
      requestJson<{ binding: ClaudeExtensionBinding }>('/claude-extension/bindings', {
        method: 'POST',
        body: JSON.stringify(binding),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bindingsQueryKey });
      toast.success('Binding created');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateClaudeExtensionBinding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, binding }: { id: string; binding: ClaudeExtensionBindingInput }) =>
      requestJson<{ binding: ClaudeExtensionBinding }>(
        `/claude-extension/bindings/${encodeURIComponent(id)}`,
        {
          method: 'PUT',
          body: JSON.stringify(binding),
        }
      ),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: bindingsQueryKey });
      queryClient.invalidateQueries({
        queryKey: ['claude-extension-binding-status', variables.id],
      });
      toast.success('Binding saved');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteClaudeExtensionBinding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      requestJson<void>(`/claude-extension/bindings/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bindingsQueryKey });
      toast.success('Binding deleted');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

function useClaudeExtensionActionMutation(action: 'apply' | 'reset', successMessage: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, target }: { id: string; target: ClaudeExtensionActionTarget }) =>
      requestJson<ClaudeExtensionBindingStatus>(
        `/claude-extension/bindings/${encodeURIComponent(id)}/${action}`,
        {
          method: 'POST',
          body: JSON.stringify({ target }),
        }
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: bindingsQueryKey });
      queryClient.setQueryData(['claude-extension-binding-status', result.bindingId], result);
      toast.success(successMessage);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useApplyClaudeExtensionBinding() {
  return useClaudeExtensionActionMutation('apply', 'Binding applied');
}

export function useResetClaudeExtensionBinding() {
  return useClaudeExtensionActionMutation('reset', 'Managed values removed');
}
