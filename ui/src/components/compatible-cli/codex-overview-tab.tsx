import {
  AlertTriangle,
  CheckCircle2,
  Folder,
  Info,
  Route,
  ShieldCheck,
  TerminalSquare,
  XCircle,
} from 'lucide-react';
import { QuickCommands } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CodexDashboardDiagnostics } from '@/hooks/use-codex-types';
import { CLIPROXY_NATIVE_CODEX_RECIPE } from '@/lib/codex-config';
import { cn } from '@/lib/utils';

function formatTimestamp(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return 'N/A';
  return new Date(value).toLocaleString();
}

function formatBytes(value: number | null | undefined): string {
  if (!value || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn('text-right break-all', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}

interface CodexOverviewTabProps {
  diagnostics: CodexDashboardDiagnostics;
}

export function CodexOverviewTab({ diagnostics }: CodexOverviewTabProps) {
  const inspectProfileCommand = diagnostics.config.activeProfile
    ? `codex --profile ${diagnostics.config.activeProfile}`
    : 'codex';
  const supportsManagedRouting = diagnostics.binary.supportsConfigOverrides;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pr-1">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4" />
              How Codex works in CCS
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="ml-4 list-disc space-y-1.5 [&>li]:pl-1">
              <li>Codex is a first-class, runtime-only target in CCS v1.</li>
              <li>
                <strong>Native config:</strong> <code>ccs-codex</code> and <code>ccsx</code> launch
                native Codex using your saved defaults.
              </li>
              <li>
                <strong>Transient overrides:</strong> <code>ccsxp</code> (or{' '}
                <code>ccs codex --target codex</code>) uses the CCS provider shortcut.
              </li>
              <li>
                <strong>CLIProxy default:</strong> To make plain <code>codex</code> use CLIProxy,
                set <code>model_provider = "cliproxy"</code> and add the recipe below.
              </li>
              <li>API profiles continue to default to Claude or Droid.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TerminalSquare className="h-4 w-4" />
              Runtime install
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant={diagnostics.binary.installed ? 'default' : 'secondary'}>
                {diagnostics.binary.installed ? 'Detected' : 'Not found'}
              </Badge>
            </div>
            <DetailRow label="Detection source" value={diagnostics.binary.source} mono />
            <DetailRow label="Binary path" value={diagnostics.binary.path || 'Not found'} mono />
            <DetailRow
              label="Install directory"
              value={diagnostics.binary.installDir || 'N/A'}
              mono
            />
            <DetailRow label="Version" value={diagnostics.binary.version || 'Unknown'} mono />
            <DetailRow label="Native aliases" value="ccs-codex, ccsx" mono />
            <DetailRow label="CCS provider shortcut" value="ccsxp" mono />
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm text-muted-foreground">--config override support</span>
              <Badge variant={diagnostics.binary.supportsConfigOverrides ? 'default' : 'secondary'}>
                {diagnostics.binary.supportsConfigOverrides ? 'Available' : 'Missing'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Route className="h-4 w-4" />
              CLIProxy-backed native Codex
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {supportsManagedRouting ? (
              <>
                <div className="space-y-1.5">
                  <p>
                    <strong>Two supported paths:</strong>
                  </p>
                  <ul className="ml-4 list-disc space-y-1 [&>li]:pl-1">
                    <li>
                      <strong>Built-in:</strong> Use <code>ccsxp</code> for the CCS provider
                      shortcut.
                    </li>
                    <li>
                      <strong>Native:</strong> Configure the recipe below to use CLIProxy directly
                      with <code>codex</code>.
                    </li>
                  </ul>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="font-medium text-foreground">Saved native Codex recipe</p>
                  <pre className="mt-2 overflow-x-auto rounded-md bg-background p-3 text-xs text-foreground">
                    {CLIPROXY_NATIVE_CODEX_RECIPE}
                  </pre>
                </div>
                <ol className="ml-4 list-decimal space-y-1.5 [&>li]:pl-1">
                  <li>
                    Save a provider named <code>cliproxy</code> with the base URL and env key above.
                  </li>
                  <li>
                    In <strong>Top-level settings</strong>, set <strong>Default provider</strong> to{' '}
                    <code>cliproxy</code>.
                  </li>
                  <li>
                    Export <code>CLIPROXY_API_KEY</code> in your shell before launching native
                    Codex.
                  </li>
                </ol>
              </>
            ) : (
              <p>
                This Codex build can still use the native path, but CCS-backed Codex routing via{' '}
                <code>ccsxp</code> or <code>ccs codex --target codex</code> stays unavailable until
                the detected Codex binary exposes <code>--config</code> overrides.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Folder className="h-4 w-4" />
              Config file
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">User config</span>
                {diagnostics.file.exists ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <DetailRow label="Path" value={diagnostics.file.path} mono />
              <DetailRow label="Resolved" value={diagnostics.file.resolvedPath} mono />
              <DetailRow label="Size" value={formatBytes(diagnostics.file.sizeBytes)} />
              <DetailRow label="Last modified" value={formatTimestamp(diagnostics.file.mtimeMs)} />
              {diagnostics.file.parseError && (
                <p className="text-xs text-amber-600">
                  TOML warning: {diagnostics.file.parseError}
                </p>
              )}
              {diagnostics.file.readError && (
                <p className="text-xs text-destructive">
                  Read warning: {diagnostics.file.readError}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" />
              Current user-layer summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Model" value={diagnostics.config.model || 'Not set'} mono />
            <DetailRow
              label="Model provider"
              value={diagnostics.config.modelProvider || 'Not set'}
              mono
            />
            <DetailRow
              label="Active profile"
              value={diagnostics.config.activeProfile || 'Not set'}
              mono
            />
            <DetailRow
              label="Approval policy"
              value={diagnostics.config.approvalPolicy || 'Not set'}
              mono
            />
            <DetailRow
              label="Sandbox mode"
              value={diagnostics.config.sandboxMode || 'Not set'}
              mono
            />
            <DetailRow label="Web search" value={diagnostics.config.webSearch || 'Not set'} mono />
            <Separator />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Badge variant="outline" className="justify-center">
                providers: {diagnostics.config.modelProviderCount}
              </Badge>
              <Badge variant="outline" className="justify-center">
                profiles: {diagnostics.config.profileCount}
              </Badge>
              <Badge variant="outline" className="justify-center">
                enabled features: {diagnostics.config.enabledFeatures.length}
              </Badge>
              <Badge variant="outline" className="justify-center">
                MCP servers: {diagnostics.config.mcpServerCount}
              </Badge>
            </div>
            {diagnostics.config.topLevelKeys.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  User-layer keys present
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {diagnostics.config.topLevelKeys.map((key) => (
                    <Badge key={key} variant="secondary" className="font-mono text-[10px]">
                      {key}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <QuickCommands
          snippets={[
            {
              label: 'Native short alias',
              command: 'ccsx',
              description: 'Launch the short native Codex runtime alias.',
            },
            {
              label: 'CCS Codex shortcut',
              command: 'ccsxp "your prompt"',
              description: supportsManagedRouting
                ? 'Run the built-in CCS Codex provider on native Codex.'
                : 'Requires a Codex build that exposes --config overrides.',
            },
            {
              label: 'Explicit provider route',
              command: 'ccs codex --target codex "your prompt"',
              description: supportsManagedRouting
                ? 'Use the explicit built-in Codex provider route.'
                : 'Requires a Codex build that exposes --config overrides.',
            },
            {
              label: diagnostics.config.activeProfile
                ? 'Inspect active profile'
                : 'Open native Codex',
              command: inspectProfileCommand,
              description: diagnostics.config.activeProfile
                ? 'Inspect the active named profile directly in native Codex.'
                : 'Open native Codex without forcing a named profile overlay.',
            },
          ]}
        />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Route className="h-4 w-4" />
              Runtime vs provider
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col rounded-md border p-3 text-sm">
              <p className="font-medium text-foreground">Native Codex runtime</p>
              <ul className="mt-2 flex-grow list-disc space-y-1.5 pl-4 text-muted-foreground [&>li]:pl-1">
                <li>
                  <code>ccs-codex</code>
                </li>
                <li>
                  <code>ccsx</code>
                </li>
                <li>
                  <code>--target codex</code>
                </li>
              </ul>
              <Badge variant="secondary" className="mt-4 w-fit justify-center font-normal">
                Honors saved native user config
              </Badge>
            </div>
            <div className="flex flex-col rounded-md border p-3 text-sm">
              <p className="font-medium text-foreground">CCS Codex provider / bridge</p>
              {supportsManagedRouting ? (
                <>
                  <ul className="mt-2 flex-grow list-disc space-y-1.5 pl-4 text-muted-foreground [&>li]:pl-1">
                    <li>
                      <code>ccsxp</code>
                    </li>
                    <li>
                      <code>ccs codex --target codex</code>
                    </li>
                  </ul>
                  <Badge variant="secondary" className="mt-4 w-fit justify-center font-normal">
                    Uses transient overrides
                  </Badge>
                </>
              ) : (
                <p className="mt-2 text-muted-foreground">
                  Unavailable (Codex build lacks <code>--config</code> support).
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Supported flows</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flow</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagnostics.supportMatrix.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs">{entry.label}</TableCell>
                    <TableCell>
                      <Badge variant={entry.supported ? 'default' : 'secondary'}>
                        {entry.supported ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entry.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {diagnostics.warnings.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Warnings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {diagnostics.warnings.map((warning) => (
                <p key={warning} className="text-sm text-amber-800 dark:text-amber-300">
                  - {warning}
                </p>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
