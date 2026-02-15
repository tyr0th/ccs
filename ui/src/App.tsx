import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/query-client';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { PrivacyProvider } from '@/contexts/privacy-context';
import { AuthProvider } from '@/contexts/auth-context';
import { RequireAuth } from '@/components/auth/require-auth';
import { Layout } from '@/components/layout/layout';
import { Loader2 } from 'lucide-react';

// Eager load: HomePage (initial route) + LoginPage (auth flow)
import { HomePage } from '@/pages';
import { LoginPage } from '@/pages/login';

// Lazy load: heavy pages with charts or complex dependencies
const AnalyticsPage = lazy(() =>
  import('@/pages/analytics').then((m) => ({ default: m.AnalyticsPage }))
);
const ApiPage = lazy(() => import('@/pages/api').then((m) => ({ default: m.ApiPage })));
const CliproxyPage = lazy(() =>
  import('@/pages/cliproxy').then((m) => ({ default: m.CliproxyPage }))
);
const CliproxyControlPanelPage = lazy(() =>
  import('@/pages/cliproxy-control-panel').then((m) => ({ default: m.CliproxyControlPanelPage }))
);
const ToolPage = lazy(() => import('@/pages/tool').then((m) => ({ default: m.ToolPage })));
const AccountsPage = lazy(() =>
  import('@/pages/accounts').then((m) => ({ default: m.AccountsPage }))
);
const SettingsPage = lazy(() =>
  import('@/pages/settings').then((m) => ({ default: m.SettingsPage }))
);
const HealthPage = lazy(() => import('@/pages/health').then((m) => ({ default: m.HealthPage })));
const SharedPage = lazy(() => import('@/pages/shared').then((m) => ({ default: m.SharedPage })));

// Loading fallback for lazy components
function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <PrivacyProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                {/* Public route: Login page */}
                <Route path="/login" element={<LoginPage />} />

                {/* Protected routes: wrapped with RequireAuth */}
                <Route element={<RequireAuth />}>
                  <Route element={<Layout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route
                      path="/analytics"
                      element={
                        <Suspense fallback={<PageLoader />}>
                          <AnalyticsPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/providers"
                      element={
                        <Suspense fallback={<PageLoader />}>
                          <ApiPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/cliproxy"
                      element={
                        <Suspense fallback={<PageLoader />}>
                          <CliproxyPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/cliproxy/control-panel"
                      element={
                        <Suspense fallback={<PageLoader />}>
                          <CliproxyControlPanelPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/tools/:toolId"
                      element={
                        <Suspense fallback={<PageLoader />}>
                          <ToolPage />
                        </Suspense>
                      }
                    />
                    {/* Legacy redirects */}
                    <Route path="/copilot" element={<Navigate to="/tools/copilot" replace />} />
                    <Route path="/cursor" element={<Navigate to="/tools/cursor" replace />} />
                    <Route
                      path="/accounts"
                      element={
                        <Suspense fallback={<PageLoader />}>
                          <AccountsPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <Suspense fallback={<PageLoader />}>
                          <SettingsPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/health"
                      element={
                        <Suspense fallback={<PageLoader />}>
                          <HealthPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/shared"
                      element={
                        <Suspense fallback={<PageLoader />}>
                          <SharedPage />
                        </Suspense>
                      }
                    />
                  </Route>
                </Route>
              </Routes>
              <Toaster position="top-right" />
            </BrowserRouter>
          </AuthProvider>
        </PrivacyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
