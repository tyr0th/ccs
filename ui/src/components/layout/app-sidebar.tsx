import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Key,
  Zap,
  Users,
  Settings,
  Activity,
  FolderOpen,
  ChevronRight,
  BarChart3,
  Gauge,
  Github,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  SidebarGroupContent,
} from '@/components/ui/sidebar';
import { CcsLogo } from '@/components/shared/ccs-logo';
import { useSidebar } from '@/hooks/use-sidebar';
import { useCliproxyUpdateCheck } from '@/hooks/use-cliproxy';
import { useDashboardTools } from '@/hooks/use-tool';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarBadge {
  text: string;
  icon: string;
}

interface SidebarChildItem {
  path: string;
  label: string;
  icon?: LucideIcon;
}

interface SidebarItem {
  path: string;
  label: string;
  icon?: LucideIcon;
  iconSrc?: string;
  legacyPaths?: string[];
  badge?: SidebarBadge;
  isCollapsible?: boolean;
  children?: SidebarChildItem[];
}

interface SidebarGroupDef {
  title: string;
  items: SidebarItem[];
}

// Define navigation groups
const BASE_NAV_GROUPS: SidebarGroupDef[] = [
  {
    title: 'General',
    items: [
      { path: '/', icon: Home, label: 'Home' },
      { path: '/analytics', icon: BarChart3, label: 'Analytics' },
    ],
  },
  {
    title: 'Identity & Access',
    items: [
      {
        path: '/providers',
        icon: Key,
        label: 'API Profiles',
        badge: { text: 'OpenRouter', icon: '/icons/openrouter.svg' },
      },
      {
        path: '/cliproxy',
        icon: Zap,
        label: 'CLIProxy Plus',
        isCollapsible: true,
        children: [
          { path: '/cliproxy', label: 'Overview' },
          { path: '/cliproxy/control-panel', icon: Gauge, label: 'Control Panel' },
        ],
      },
      {
        path: '/accounts',
        icon: Users,
        label: 'Accounts',
        isCollapsible: true,
        children: [
          { path: '/accounts', label: 'All Accounts' },
          { path: '/shared', icon: FolderOpen, label: 'Shared Data' },
        ],
      },
    ],
  },
  {
    title: 'System',
    items: [
      { path: '/health', icon: Activity, label: 'Health' },
      { path: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const { data: updateCheck } = useCliproxyUpdateCheck();
  const { navItems: dashboardToolNavItems } = useDashboardTools();

  // Dynamic label for CLIProxy based on backend
  const cliproxyLabel = updateCheck?.backendLabel ?? 'CLIProxy';

  // Helper to get dynamic label (for CLIProxy route)
  const getItemLabel = (item: { path: string; label: string }) => {
    if (item.path === '/cliproxy') {
      return cliproxyLabel;
    }
    return item.label;
  };

  const navGroups = useMemo<SidebarGroupDef[]>(() => {
    const toolItems: SidebarItem[] = dashboardToolNavItems.map((item) => ({
      path: item.path,
      label: item.label,
      icon: item.iconKey === 'github' ? Github : item.iconKey === 'wrench' ? Wrench : undefined,
      iconSrc: item.iconSrc,
      legacyPaths: item.legacyPaths,
    }));

    return BASE_NAV_GROUPS.map((group) => {
      if (group.title !== 'Identity & Access') {
        return group;
      }

      const accountsIndex = group.items.findIndex((item) => item.path === '/accounts');
      if (accountsIndex < 0 || toolItems.length === 0) {
        return group;
      }

      return {
        ...group,
        items: [
          ...group.items.slice(0, accountsIndex),
          ...toolItems,
          ...group.items.slice(accountsIndex),
        ],
      };
    });
  }, [dashboardToolNavItems]);

  // Helper to check if a route is active (exact match, alias, or sub-route)
  const isRouteActive = (path: string, aliases?: string[]) => {
    const candidates = aliases ? [path, ...aliases] : [path];
    return candidates.some(
      (candidate) =>
        location.pathname === candidate || location.pathname.startsWith(`${candidate}/`)
    );
  };

  // Helper to check if a group/parent should be open based on active child
  // Also handles sub-routes (e.g., /cliproxy/control-panel matches /cliproxy)
  const isParentActive = (children: { path: string }[]) => {
    return children.some(
      (child) => isRouteActive(child.path) || location.pathname.startsWith(`${child.path}/`)
    );
  };

  const renderMenuIcon = (item: Pick<SidebarItem, 'icon' | 'iconSrc'>) => {
    if (item.iconSrc) {
      return <img src={item.iconSrc} alt="" className="w-4 h-4 object-contain" />;
    }
    if (item.icon) {
      const Icon = item.icon;
      return <Icon className="w-4 h-4" />;
    }
    return null;
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-12 flex items-center justify-center">
        <CcsLogo size="sm" showText={state === 'expanded'} />
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group, index) => (
          <SidebarGroup key={group.title || index}>
            {group.title && <SidebarGroupLabel>{group.title}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    {item.isCollapsible && item.children ? (
                      <Collapsible
                        defaultOpen={isParentActive(item.children) || isRouteActive(item.path)}
                        className="group/collapsible"
                      >
                        <SidebarMenuItem>
                          {/* Click navigates to overview AND opens submenu */}
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton
                              tooltip={getItemLabel(item)}
                              isActive={isParentActive(item.children)}
                              onClick={() => navigate(item.path)}
                            >
                              {renderMenuIcon(item)}
                              <span className="group-data-[collapsible=icon]:hidden">
                                {getItemLabel(item)}
                              </span>
                              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden" />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {item.children.map((child) => (
                                <SidebarMenuSubItem key={child.path}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isRouteActive(child.path)}
                                  >
                                    <Link to={child.path}>
                                      <span>{child.label}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    ) : (
                      <SidebarMenuButton
                        asChild
                        isActive={isRouteActive(item.path, item.legacyPaths)}
                        tooltip={getItemLabel(item)}
                      >
                        <Link to={item.path}>
                          {renderMenuIcon(item)}
                          <span className="group-data-[collapsible=icon]:hidden flex-1">
                            {getItemLabel(item)}
                          </span>
                          {item.badge && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={`group-data-[collapsible=icon]:hidden ml-auto flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
                                    isRouteActive(item.path, item.legacyPaths)
                                      ? 'bg-sidebar-accent-foreground/20 text-sidebar-accent-foreground border border-sidebar-accent-foreground/30'
                                      : 'bg-accent/15 text-accent border border-accent/30 group-hover/menu-item:bg-sidebar-accent-foreground/20 group-hover/menu-item:text-sidebar-accent-foreground group-hover/menu-item:border-sidebar-accent-foreground/30'
                                  }`}
                                >
                                  <img src={item.badge.icon} alt="" className="w-3 h-3" />
                                  <span className="hidden sm:inline">{item.badge.text}</span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                <p>349+ models via OpenRouter</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t flex items-center justify-center">
        <SidebarTrigger />
      </SidebarFooter>
    </Sidebar>
  );
}
