import { useCallback, useState } from 'react';
import type { OfficialChannelId, OfficialChannelsConfig, OfficialChannelsStatus } from '../types';

const DEFAULT_CONFIG: OfficialChannelsConfig = {
  selected: [],
  unattended: false,
};

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    return typeof data.error === 'string' && data.error.trim().length > 0 ? data.error : fallback;
  } catch {
    return fallback;
  }
}

export function useOfficialChannelsConfig() {
  const [config, setConfig] = useState<OfficialChannelsConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<OfficialChannelsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const flashSuccess = useCallback((message: string) => {
    setSuccess(message);
    window.setTimeout(() => setSuccess(null), 1500);
  }, []);

  const fetchConfig = useCallback(async (): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/channels');
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Failed to load Official Channels settings'));
      }

      const data = (await res.json()) as {
        config?: OfficialChannelsConfig;
        status?: OfficialChannelsStatus;
      };

      setConfig(data.config ?? DEFAULT_CONFIG);
      setStatus(data.status ?? null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConfig = useCallback(
    async (
      updates: Partial<OfficialChannelsConfig>,
      successMessage = 'Settings saved'
    ): Promise<boolean> => {
      try {
        setSaving(true);
        setError(null);

        const res = await fetch('/api/channels', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!res.ok) {
          throw new Error(await readErrorMessage(res, 'Failed to save Official Channels settings'));
        }

        const data = (await res.json()) as { config?: OfficialChannelsConfig };
        setConfig((current) => data.config ?? { ...current, ...updates });
        flashSuccess(successMessage);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [flashSuccess]
  );

  const saveToken = useCallback(
    async (channelId: OfficialChannelId, token: string): Promise<boolean> => {
      try {
        setSaving(true);
        setError(null);

        const res = await fetch(`/api/channels/${channelId}/token`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          throw new Error(await readErrorMessage(res, `Failed to save ${channelId} token`));
        }

        const refreshed = await fetchConfig();
        if (!refreshed) {
          return false;
        }

        flashSuccess(`${channelId} token saved`);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [fetchConfig, flashSuccess]
  );

  const clearToken = useCallback(
    async (channelId: OfficialChannelId): Promise<boolean> => {
      try {
        setSaving(true);
        setError(null);

        const res = await fetch(`/api/channels/${channelId}/token`, {
          method: 'DELETE',
        });

        if (!res.ok) {
          throw new Error(await readErrorMessage(res, `Failed to clear ${channelId} token`));
        }

        const refreshed = await fetchConfig();
        if (!refreshed) {
          return false;
        }

        flashSuccess(`${channelId} token cleared`);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [fetchConfig, flashSuccess]
  );

  return {
    config,
    status,
    loading,
    saving,
    error,
    success,
    fetchConfig,
    updateConfig,
    saveToken,
    clearToken,
  };
}
