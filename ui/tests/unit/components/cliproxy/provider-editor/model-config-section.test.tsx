import { describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';

vi.mock('@/components/cliproxy/provider-model-selector', () => ({
  FlexibleModelSelector: () => <div data-testid="flexible-model-selector" />,
}));

vi.mock('@/components/cliproxy/extended-context-toggle', () => ({
  ExtendedContextToggle: () => <div data-testid="extended-context-toggle" />,
}));

import { ModelConfigSection } from '@/components/cliproxy/provider-editor/model-config-section';
import { MODEL_CATALOGS } from '@/lib/model-catalogs';

describe('ModelConfigSection presets', () => {
  it('groups codex presets by free and paid tiers', async () => {
    const onApplyPreset = vi.fn();

    render(
      <ModelConfigSection
        catalog={MODEL_CATALOGS.codex}
        savedPresets={[]}
        currentModel="gpt-5-codex"
        opusModel="gpt-5-codex"
        sonnetModel="gpt-5-codex"
        haikuModel="gpt-5-codex-mini"
        providerModels={[]}
        provider="codex"
        onApplyPreset={onApplyPreset}
        onUpdateEnvValue={vi.fn()}
        onOpenCustomPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />
    );

    expect(screen.getByText('Free Tier')).toBeInTheDocument();
    expect(screen.getByText('Paid Tier')).toBeInTheDocument();
    expect(screen.getByText('Available on free or paid plans')).toBeInTheDocument();
    expect(screen.getByText('Requires paid access')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'GPT-5.4' }));

    expect(onApplyPreset).toHaveBeenCalledWith({
      ANTHROPIC_MODEL: 'gpt-5.4',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.4',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.4',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5-codex-mini',
    });
  });

  it('keeps non-tiered provider presets ungrouped', () => {
    render(
      <ModelConfigSection
        catalog={MODEL_CATALOGS.agy}
        savedPresets={[]}
        currentModel="claude-opus-4-6-thinking"
        opusModel="claude-opus-4-6-thinking"
        sonnetModel="claude-sonnet-4-6"
        haikuModel="claude-sonnet-4-6"
        providerModels={[]}
        provider="agy"
        onApplyPreset={vi.fn()}
        onUpdateEnvValue={vi.fn()}
        onOpenCustomPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />
    );

    expect(screen.queryByText('Free Tier')).not.toBeInTheDocument();
    expect(screen.queryByText('Paid Tier')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Claude Opus 4.6 Thinking' })).toBeInTheDocument();
  });
});
