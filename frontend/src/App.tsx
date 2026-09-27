import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import CampaignWizard from './pages/CampaignWizard';
import CampaignDetail from './pages/CampaignDetail';
import Templates from './pages/Templates';
import Assets from './pages/Assets';
import Users from './pages/Users';
import Settings from './pages/Settings';

// The composer carries Monaco and the block editor, so it loads on demand.
const ComposerHome = lazy(() => import('./composer/ComposerHome'));
const ComposerRoute = lazy(() => import('./composer/ComposerRoute'));
const ComposerAdmin = lazy(() => import('./composer/admin/ComposerAdmin'));

function ComposerFallback() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center gap-2 text-gray-500">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-sm">Loading the composer…</span>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, user } = useAuthStore();
  const loadSettings = useThemeStore(s => s.loadSettings);

  // Branding is public, so the login page is themed too; reload on auth change
  useEffect(() => {
    loadSettings();
  }, [isAuthenticated, loadSettings]);

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/change-password" element={<ChangePassword />} />

      {/* New composer: full-viewport workspace, isolated from the classic editor */}
      <Route
        path="/composer/template/:code"
        element={
          <Suspense fallback={<ComposerFallback />}>
            <ComposerRoute targetType="template" />
          </Suspense>
        }
      />
      <Route
        path="/composer/campaign/:code"
        element={
          <Suspense fallback={<ComposerFallback />}>
            <ComposerRoute targetType="campaign" />
          </Suspense>
        }
      />

      {/* Protected routes */}
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/campaigns/new" element={<CampaignWizard />} />
        <Route path="/campaigns/:id/edit" element={<CampaignWizard />} />
        <Route path="/campaigns/:id" element={<CampaignDetail />} />
        <Route path="/templates" element={<Templates />} />
        <Route
          path="/composer"
          element={
            <Suspense fallback={<ComposerFallback />}>
              <ComposerHome />
            </Suspense>
          }
        />
        {/* Admin-only routes */}
        {user?.role === 'admin' && (
          <>
            <Route path="/assets" element={<Assets />} />
            <Route path="/users" element={<Users />} />
            <Route path="/settings" element={<Settings />} />
            <Route
              path="/settings/composer"
              element={
                <Suspense fallback={<ComposerFallback />}>
                  <ComposerAdmin />
                </Suspense>
              }
            />
          </>
        )}
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
