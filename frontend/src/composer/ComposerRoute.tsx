/**
 * Route wrapper for the composer workspace.
 *
 * Mounted outside the application layout so the editor owns the whole viewport, which is
 * what the full-width workspace and full-screen requirements need.
 */

import { Navigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import type { TargetType } from './api/types';
import { ComposerWorkspace } from './ComposerWorkspace';

export default function ComposerRoute({ targetType }: { targetType: TargetType }) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const { code } = useParams<{ code: string }>();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!code) return <Navigate to="/composer" replace />;

  return (
    <div className="h-screen overflow-hidden bg-white">
      <ComposerWorkspace key={`${targetType}:${code}`} targetType={targetType} targetCode={code} />
    </div>
  );
}
