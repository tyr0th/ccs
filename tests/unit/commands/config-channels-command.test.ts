import { describe, expect, it } from 'bun:test';
import { parseChannelsCommandArgs } from '../../../src/commands/config-channels-command';

describe('config channels command parser', () => {
  it('parses selection, unattended mode, and token input', () => {
    const result = parseChannelsCommandArgs([
      '--set',
      'telegram,discord',
      '--unattended',
      '--set-token',
      'telegram=telegram-secret',
    ]);

    expect(result.setSelection).toBe('telegram,discord');
    expect(result.unattended).toBe(true);
    expect(result.setToken).toEqual({
      channelId: 'telegram',
      token: 'telegram-secret',
    });
  });

  it('supports inline token assignment, legacy flags, and clear-token variants', () => {
    const result = parseChannelsCommandArgs([
      '--disable',
      '--no-unattended',
      '--set-token=abc',
    ]);
    const clearAll = parseChannelsCommandArgs(['--clear-token']);
    const clearOne = parseChannelsCommandArgs(['--clear-token', 'discord']);

    expect(result.disable).toBe(true);
    expect(result.noUnattended).toBe(true);
    expect(result.setToken).toEqual({ channelId: 'discord', token: 'abc' });
    expect(clearAll.clearTokenAll).toBe(true);
    expect(clearOne.clearTokenChannel).toBe('discord');
  });
});
