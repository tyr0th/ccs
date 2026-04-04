/**
 * Profile Editor Header Section
 * Top header with profile name, badge, last modified, and action buttons
 */

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { OpenRouterBadge } from '@/components/profiles/openrouter-badge';
import { isOpenRouterProfile } from './utils';
import type { Settings } from './types';
import type { CliTarget } from '@/lib/api-client';

interface HeaderSectionProps {
  profileName: string;
  target: CliTarget;
  data: { path?: string; mtime: number } | undefined;
  settings?: Settings;
  isLoading: boolean;
  isSaving: boolean;
  isTargetSaving: boolean;
  hasChanges: boolean;
  isRawJsonValid: boolean;
  onTargetChange: (target: CliTarget) => void;
  onRefresh: () => void;
  onDelete?: () => void;
  onSave: () => void;
}

export function HeaderSection({
  profileName,
  target,
  data,
  settings,
  isLoading,
  isSaving,
  isTargetSaving,
  hasChanges,
  isRawJsonValid,
  onTargetChange,
  onRefresh,
  onDelete,
  onSave,
}: HeaderSectionProps) {
  const isMutating = isSaving || isTargetSaving;
  const disableHeaderActions = isLoading || isMutating;

  return (
    <div className="px-6 py-4 border-b bg-background flex items-center justify-between shrink-0">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{profileName}</h2>
          {data?.path && (
            <Badge variant="outline" className="text-xs">
              {data.path.replace(/^.*\//, '')}
            </Badge>
          )}
          {isOpenRouterProfile(settings) && <OpenRouterBadge className="ml-1" />}
        </div>
        {data && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Last modified: {new Date(data.mtime).toLocaleString()}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Default target:</span>
          <Select
            value={target}
            onValueChange={(value) => {
              if (disableHeaderActions) return;
              onTargetChange(value as CliTarget);
            }}
            disabled={disableHeaderActions}
          >
            <SelectTrigger className="h-7 w-[170px] text-xs" disabled={disableHeaderActions}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude">Claude Code</SelectItem>
              <SelectItem value="droid">Factory Droid</SelectItem>
              <SelectItem value="codex">Codex CLI</SelectItem>
            </SelectContent>
          </Select>
          {isTargetSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={disableHeaderActions}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
        {onDelete && (
          <Button variant="ghost" size="sm" onClick={onDelete} disabled={isMutating}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={isMutating || !hasChanges || !isRawJsonValid}>
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-1" />
              Save
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
