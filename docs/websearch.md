# WebSearch Configuration Guide

Last Updated: 2026-03-27

CCS provides automatic web search for third-party profiles that cannot access Anthropic's native WebSearch API.

## How WebSearch Works

### Native Claude Accounts

Native Claude subscription accounts still use Anthropic's server-side WebSearch directly.

### Third-Party Profiles

Third-party profiles cannot execute Anthropic's server-side WebSearch because the tool never reaches their backend. CCS now solves that by intercepting WebSearch and running real local search providers directly.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Claude Code CLI                           │
│                                                              │
│  WebSearch Tool Request                                      │
│       │                                                      │
│       ├── Native Claude Account? → Anthropic WebSearch API  │
│       │                                                      │
│       └── Third-party Profile? → PreToolUse Hook            │
│                                   │                          │
│                                   ├── 1. Exa Search API      │
│                                   ├── 2. Tavily Search API   │
│                                   ├── 3. Brave Search API    │
│                                   ├── 4. DuckDuckGo HTML     │
│                                   └── 5. Legacy CLI fallback │
│                                      (Gemini/OpenCode/Grok)  │
└──────────────────────────────────────────────────────────────┘
```

## Why This Changed

The previous design asked another model CLI to perform web search and summarize the answer. That was brittle:

- CLI syntax changed upstream
- auth state varied per tool
- prompt/tool behavior drifted across releases

The new flow matches the `goclaw` model more closely: web search is treated as a first-class deterministic capability, not an LLM-to-LLM workaround.

## Providers

| Provider | Type | Setup | Default | Notes |
|----------|------|-------|---------|-------|
| Exa | HTTP API | `EXA_API_KEY` | No | High-quality API search with extracted content |
| Tavily | HTTP API | `TAVILY_API_KEY` | No | Agent-oriented search API |
| DuckDuckGo | HTML fetch | None | Yes | Built-in zero-setup fallback |
| Brave Search | HTTP API | `BRAVE_API_KEY` | No | Cleaner snippets and metadata |
| Gemini CLI | Legacy CLI | `npm i -g @google/gemini-cli` | No | Optional compatibility fallback |
| OpenCode | Legacy CLI | `curl -fsSL https://opencode.ai/install \| bash` | No | Optional compatibility fallback |
| Grok CLI | Legacy CLI | `npm i -g @vibe-kit/grok-cli` + `GROK_API_KEY` | No | Optional compatibility fallback |

## Configuration

### Via Dashboard

Open `ccs config` → `Settings` → `WebSearch`.

- Enable Exa, Tavily, Brave, or DuckDuckGo in the backend chain
- Set or rotate Exa, Tavily, and Brave API keys directly inside each provider card
- Saved keys are persisted in `global_env` and injected at runtime, so readiness updates from the same screen
- Review whether any legacy fallback CLIs are still enabled in config

### Via Config File

Edit `~/.ccs/config.yaml`:

```yaml
websearch:
  enabled: true
  providers:
    exa:
      enabled: false
      max_results: 5
    tavily:
      enabled: false
      max_results: 5
    duckduckgo:
      enabled: true
      max_results: 5
    brave:
      enabled: false
      max_results: 5
    gemini:
      enabled: false
      model: gemini-2.5-flash
      timeout: 55
    opencode:
      enabled: false
      model: opencode/grok-code
      timeout: 90
    grok:
      enabled: false
      timeout: 55
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EXA_API_KEY` | Enables Exa when `providers.exa.enabled: true` |
| `TAVILY_API_KEY` | Enables Tavily when `providers.tavily.enabled: true` |
| `BRAVE_API_KEY` | Enables Brave Search when `providers.brave.enabled: true` |
| `GROK_API_KEY` | Required only for legacy Grok CLI fallback |
| `CCS_WEBSEARCH_SKIP` | Skip hook entirely |
| `CCS_DEBUG` | Verbose hook logging |

## Troubleshooting

### WebSearch says "Ready (DuckDuckGo)"

That is expected. DuckDuckGo is the default zero-setup backend.

### Exa, Tavily, or Brave is enabled but not ready

Set the matching API key in the WebSearch dashboard card, or export it in the environment that launches CCS, then refresh status:

```bash
export EXA_API_KEY="your-api-key"
# or: export TAVILY_API_KEY="your-api-key"
# or: export BRAVE_API_KEY="your-api-key"
ccs config
```

If the dashboard says the key is stored but still not ready, check whether `Settings -> Global Env` is disabled. WebSearch reuses that injection path for dashboard-managed keys.

### I still want Gemini/OpenCode/Grok fallback

Those providers remain supported, but they are no longer the primary path. Enable them explicitly in `config.yaml` if you want them as last-resort fallback.

### WebSearch returns no results

1. Check `websearch.enabled: true`
2. Keep DuckDuckGo enabled unless you have a strong reason to disable it
3. If using Exa, Tavily, or Brave, verify the matching API key
4. Run with `CCS_DEBUG=1` for hook logs

## Security Considerations

- API keys entered from the dashboard are stored in `~/.ccs/config.yaml` under `global_env` and injected as environment variables at runtime
- Shell-exported keys still work and are detected as external environment input
- Never commit API keys to version control
- Use the dashboard only on trusted machines, and protect `~/.ccs/config.yaml` with normal user-level filesystem permissions
