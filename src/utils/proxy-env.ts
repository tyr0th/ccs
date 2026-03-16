type ProxyEnv = Record<string, string | undefined>;
type ProxyResolution = { url?: string; error?: string };
type ProxyResolutionOptions = { allowedProtocols?: string[] };

function getEnvValue(env: ProxyEnv, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return undefined;
}

function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isIpLikeHost(hostname: string): boolean {
  return /^[\d.:]+$/.test(hostname);
}

function validateProxyUrl(proxyUrl: string, allowedProtocols?: string[]): string {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(proxyUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (allowedProtocols && !allowedProtocols.includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported proxy protocol: ${parsedUrl.protocol}`);
  }

  return proxyUrl;
}

function getProxyKeys(isHttps: boolean): string[] {
  if (isHttps) {
    return ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY'];
  }

  return ['http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY'];
}

export function getProxyResolution(
  isHttps: boolean,
  env: ProxyEnv = process.env,
  options: ProxyResolutionOptions = {}
): ProxyResolution {
  let firstError: string | undefined;

  for (const key of getProxyKeys(isHttps)) {
    const proxyUrl = getEnvValue(env, [key]);
    if (!proxyUrl) {
      continue;
    }

    try {
      return { url: validateProxyUrl(proxyUrl, options.allowedProtocols) };
    } catch (error) {
      if (!firstError) {
        firstError = error instanceof Error ? error.message : 'Unknown proxy configuration error';
      }
    }
  }

  return { error: firstError };
}

export function getProxyUrl(isHttps: boolean, env: ProxyEnv = process.env): string | undefined {
  const { url } = getProxyResolution(isHttps, env);
  return url;
}

export function isLoopbackHost(hostname: string): boolean {
  const normalizedHost = normalizeHostname(hostname);
  if (!normalizedHost) {
    return false;
  }

  if (
    normalizedHost === 'localhost' ||
    normalizedHost.endsWith('.localhost') ||
    normalizedHost === '0.0.0.0' ||
    normalizedHost === '::1'
  ) {
    return true;
  }

  if (/^127(?:\.\d{1,3}){3}$/.test(normalizedHost)) {
    return true;
  }

  return normalizedHost.startsWith('::ffff:127.') || normalizedHost.startsWith('::ffff:7f');
}

export function getNoProxyValue(env: ProxyEnv = process.env): string | undefined {
  return getEnvValue(env, ['no_proxy', 'NO_PROXY']);
}

export function shouldBypassProxy(hostname: string, env: ProxyEnv = process.env): boolean {
  const normalizedHost = normalizeHostname(hostname);
  if (!normalizedHost) {
    return false;
  }

  if (isLoopbackHost(normalizedHost)) {
    return true;
  }

  const noProxy = getNoProxyValue(env);
  if (!noProxy) {
    return false;
  }

  const patterns = noProxy
    .split(/[,\s]+/)
    .map((pattern) => normalizeHostname(pattern))
    .filter(Boolean);

  for (const pattern of patterns) {
    if (pattern === '*') {
      return true;
    }

    const canonicalPattern = pattern.startsWith('.')
      ? pattern.slice(1)
      : pattern.replace(/^\*\.?/, '');

    if (!canonicalPattern) {
      continue;
    }

    if (normalizedHost === canonicalPattern) {
      return true;
    }

    if (!isIpLikeHost(canonicalPattern) && normalizedHost.endsWith(`.${canonicalPattern}`)) {
      return true;
    }
  }

  return false;
}
