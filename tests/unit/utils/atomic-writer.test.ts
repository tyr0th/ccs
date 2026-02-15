import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { writeFileAtomic } from '../../../src/utils/atomic-writer';

describe('atomic-writer', () => {
  const tempRoots: string[] = [];

  async function createTempRoot(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ccs-atomic-writer-'));
    tempRoots.push(root);
    return root;
  }

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('writes file content atomically', async () => {
    const root = await createTempRoot();
    const target = path.join(root, 'nested', 'state.json');

    await writeFileAtomic(target, '{"v":1}\n');
    await writeFileAtomic(target, '{"v":2}\n');

    const content = await fs.readFile(target, 'utf8');
    expect(content).toBe('{"v":2}\n');
  });

  it('cleans up temporary files after write', async () => {
    const root = await createTempRoot();
    const target = path.join(root, 'data.txt');
    await writeFileAtomic(target, 'payload');

    const files = await fs.readdir(root);
    expect(files.some((name) => name.includes('.tmp.'))).toBe(false);
  });

  it('cleans temporary files when rename fails', async () => {
    const root = await createTempRoot();
    const target = path.join(root, 'data.txt');
    const renameSpy = spyOn(fs, 'rename').mockImplementation(async () => {
      throw new Error('rename failed');
    });

    try {
      await expect(writeFileAtomic(target, 'payload')).rejects.toThrow('rename failed');
      const files = await fs.readdir(root);
      expect(files.some((name) => name.includes('.tmp.'))).toBe(false);
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('retries temp file creation when collision occurs', async () => {
    const root = await createTempRoot();
    const target = path.join(root, 'data.txt');
    const originalOpen = fs.open.bind(fs);
    const openSpy = spyOn(fs, 'open')
      .mockImplementationOnce(async () => {
        const collisionError = new Error('tmp exists') as Error & { code?: string };
        collisionError.code = 'EEXIST';
        throw collisionError;
      })
      .mockImplementation(originalOpen);

    try {
      await writeFileAtomic(target, 'payload');
      const content = await fs.readFile(target, 'utf8');
      expect(content).toBe('payload');
    } finally {
      openSpy.mockRestore();
    }
  });
});
