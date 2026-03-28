import { existsSync } from 'fs';
import { describe, expect, it } from 'bun:test';
import { getDockerAssetPaths } from '../../../src/docker/docker-assets';

describe('docker bundled assets', () => {
  const assets = getDockerAssetPaths();

  it('resolves all required asset paths', () => {
    expect(assets.composeFile).toContain('docker-compose.integrated.yml');
    expect(assets.dockerfile).toContain('Dockerfile.integrated');
    expect(assets.supervisordConfig).toContain('supervisord.conf');
    expect(assets.entrypoint).toContain('entrypoint-integrated.sh');
  });

  it('all bundled assets exist on disk', () => {
    expect(existsSync(assets.composeFile)).toBe(true);
    expect(existsSync(assets.dockerfile)).toBe(true);
    expect(existsSync(assets.supervisordConfig)).toBe(true);
    expect(existsSync(assets.entrypoint)).toBe(true);
  });
});
