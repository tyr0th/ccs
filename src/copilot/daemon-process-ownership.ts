import { spawnSync } from 'child_process';
import * as fs from 'fs';

export type DaemonOwnershipStatus = 'owned' | 'not-owned' | 'not-running' | 'unknown';

function getProcessCommandLine(pid: number): string | null {
  if (process.platform === 'linux') {
    try {
      // /proc cmdline uses null separators between arguments.
      return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
    } catch {
      return null;
    }
  }

  if (process.platform === 'darwin') {
    try {
      const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
        encoding: 'utf8',
      });
      if (result.error || result.status !== 0) {
        return null;
      }
      return result.stdout.trim();
    } catch {
      return null;
    }
  }

  if (process.platform === 'win32') {
    const command = `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object -ExpandProperty CommandLine)`;
    const shells = ['powershell.exe', 'powershell', 'pwsh.exe', 'pwsh'];
    for (const shell of shells) {
      try {
        const result = spawnSync(shell, ['-NoProfile', '-Command', command], {
          encoding: 'utf8',
        });
        if (result.error) {
          continue;
        }
        if (result.status !== 0) {
          return null;
        }
        return result.stdout.trim();
      } catch {
        // Try next shell candidate
      }
    }
    return null;
  }

  return null;
}

export function verifyCopilotDaemonOwnership(pid: number): DaemonOwnershipStatus {
  try {
    process.kill(pid, 0);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ESRCH') {
      return 'not-running';
    }
    return 'unknown';
  }

  const commandLine = getProcessCommandLine(pid);
  if (!commandLine) {
    return 'unknown';
  }

  // copilot-api is launched as `... copilot-api start --port <n>`
  const lower = commandLine.toLowerCase();
  const looksLikeCopilotDaemon = lower.includes('copilot-api') && lower.includes(' start');

  return looksLikeCopilotDaemon ? 'owned' : 'not-owned';
}
