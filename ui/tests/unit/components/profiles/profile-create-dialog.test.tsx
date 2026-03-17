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

  it('reveals more presets from custom mode and keeps custom unselected after choosing a template', async () => {
    render(
      <ProfileCreateDialog
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        initialMode="openrouter"
      />
    );

    expect(screen.getByText('Featured Providers')).toBeInTheDocument();
    expect(screen.queryByText('More Presets')).not.toBeInTheDocument();
    expect(document.body.querySelectorAll('.overflow-x-auto')).toHaveLength(1);

    const customButton = screen.getByRole('button', { name: /Custom Endpoint/i });
    await userEvent.click(customButton);

    expect(await screen.findByText('More Presets')).toBeInTheDocument();
    expect(document.body.querySelectorAll('.overflow-x-auto')).toHaveLength(2);

    const glmButton = screen.getByText('GLM').closest('button');
    expect(glmButton).not.toBeNull();
    if (!glmButton) {
      throw new Error('GLM preset button not found');
    }
    await userEvent.click(glmButton);

    await waitFor(() => {
      expect(customButton).not.toHaveClass('border-primary');
    });
    expect(glmButton).toHaveClass('border-primary');
  });
});
