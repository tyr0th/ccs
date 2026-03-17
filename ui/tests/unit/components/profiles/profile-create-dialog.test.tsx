import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileCreateDialog } from '@/components/profiles/profile-create-dialog';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';

const mutateAsync = vi.fn();

vi.mock('@/hooks/use-profiles', () => ({
  useCreateProfile: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/hooks/use-openrouter-models', () => ({
  useOpenRouterCatalog: () => ({
    models: [],
  }),
}));

describe('ProfileCreateDialog', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
  });

  it('keeps advanced presets collapsed until explicitly opened and deselects custom after choosing a template', async () => {
    render(
      <ProfileCreateDialog
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        initialMode="openrouter"
      />
    );

    expect(screen.getByText('Featured Providers')).toBeInTheDocument();
    expect(screen.getByText('Alibaba Coding Plan')).toBeVisible();
    const morePresetsToggle = screen.getByRole('button', { name: /More Presets/i });
    expect(morePresetsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.body.querySelectorAll('.overflow-x-auto')).toHaveLength(1);

    const customButton = screen.getByRole('button', { name: /Custom Endpoint/i });
    await userEvent.click(customButton);

    expect(morePresetsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.body.querySelectorAll('.overflow-x-auto')).toHaveLength(1);

    await userEvent.click(morePresetsToggle);

    expect(morePresetsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.body.querySelectorAll('.overflow-x-auto')).toHaveLength(2);

    const glmButton = screen.getByText('GLM').closest('button');
    expect(glmButton).not.toBeNull();
    if (!glmButton) {
      throw new Error('GLM preset button not found');
    }
    await userEvent.click(glmButton);

    expect(morePresetsToggle).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => {
      expect(customButton).not.toHaveClass('border-primary');
    });
    expect(glmButton).toHaveClass('border-primary');
  });
});
