import { LucideProvider } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { NewImageDialog } from '@/app/dialogs/NewImageDialog';
import { PaintExportDialog } from '@/app/dialogs/PaintExportDialog';
import { RenameDialog } from '@/app/dialogs/RenameDialog';
import {
  closeCurrentProject,
  hasUnsavedChanges,
  useCurrentProject,
  useCurrentProjectName,
} from '@/app/editor/session';
import { StartScreen } from '@/app/home/StartScreen';
import { NotFoundScreen } from '@/app/NotFoundScreen';
import { useRoute, type Route } from '@/app/router';
import { ErrorBoundary } from '@/app/shared/ErrorBoundary';
import { LiveRegion } from '@/app/shared/LiveRegion';
import { Toaster } from '@/app/shared/Toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { t } from '@/i18n';
import { useProjectStore } from '@/stores/project';

// Editor tải lười để trang chủ khởi động nhanh (mục 11.3).
const EditorScreen = lazy(() =>
  import('@/app/editor/EditorScreen').then((module) => ({ default: module.EditorScreen })),
);

/**
 * Tiêu đề tab (mục 7.9): tên project, thêm "•" khi còn thay đổi chưa lưu.
 */
function useDocumentTitle(route: Route): void {
  const project = useCurrentProject();
  const name = useCurrentProjectName();
  // Đọc trạng thái lưu để tính lại tiêu đề mỗi khi trạng thái đổi.
  const status = useProjectStore((s) => s.saveStatus);
  const inEditor = route.name === 'project' && project?.id === route.projectId;
  const unsaved = inEditor && status !== null && hasUnsavedChanges();
  const title = inEditor
    ? `${unsaved ? '• ' : ''}${name ?? t.editor.untitled} — ${t.app.name}`
    : t.app.name;
  useEffect(() => {
    document.title = title;
  }, [title]);
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <StartScreen />;
    case 'project':
      return (
        <Suspense fallback={<div className="h-full bg-workspace" />}>
          <EditorScreen key={route.projectId} projectId={route.projectId} />
        </Suspense>
      );
    case 'not-found':
      return <NotFoundScreen />;
  }
}

/** Gốc ứng dụng: chuyển giữa Trang chủ và Editor theo hash route (mục 8). */
export function App() {
  const route = useRoute();
  useDocumentTitle(route);

  // Rời editor (về trang chủ, Back): lưu bền vững + checkpoint rồi đóng project (mục 6.6).
  useEffect(() => {
    if (route.name !== 'project') void closeCurrentProject();
  }, [route]);

  return (
    <LucideProvider size={20} strokeWidth={1.75}>
      <TooltipProvider delayDuration={500} skipDelayDuration={300}>
        <a
          href="#main"
          onClick={(event) => {
            // Không đổi hash: hash là route của app.
            event.preventDefault();
            document.getElementById('main')?.focus();
          }}
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {t.app.skipToContent}
        </a>
        <ErrorBoundary key={route.name}>
          <Screen route={route} />
        </ErrorBoundary>
        <RenameDialog />
        <PaintExportDialog />
        <NewImageDialog />
        <LiveRegion />
        <Toaster />
      </TooltipProvider>
    </LucideProvider>
  );
}
