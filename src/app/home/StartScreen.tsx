import { useCallback, useEffect, useState } from 'react';
import {
  importProjectFile,
  notifyNoImageInClipboard,
  openImageAsProject,
} from '@/app/editor/actions';
import { refreshProjects, watchProjects } from '@/app/projects';
import { FullscreenButton, PaletteButton, SettingsButton } from '@/app/layout/AppButtons';
import { TopBar } from '@/app/layout/TopBar';
import { AppLogo } from '@/app/shared/AppLogo';
import { ThemeMenu } from '@/app/shared/ThemeMenu';
import { initStorage } from '@/app/storage';
import { t } from '@/i18n';
import { imageFileFrom, isPaintFileName } from '@/services/io/clipboard';
import { isEditableTarget } from '@/services/platform/browserGuards';
import { DropZone } from './DropZone';
import { HomeBanners } from './HomeBanners';
import { PresetList } from './PresetList';
import { ProjectsSection } from './ProjectsSection';

/**
 * Trang chủ (mục 7.3): dán/thả/mở ảnh hoặc file .paint, preset kích thước, lưới project gần đây
 * có ảnh thu nhỏ, tìm kiếm, sắp xếp, thùng rác; banner khôi phục phiên.
 */
export function StartScreen() {
  const [busy, setBusy] = useState<'image' | 'project' | null>(null);

  useEffect(() => {
    void initStorage().then(refreshProjects);
    return watchProjects();
  }, []);

  const open = useCallback(
    (file: Blob, source: 'file' | 'paste') => {
      if (busy) return;
      const isProject = file instanceof File && isPaintFileName(file.name);
      setBusy(isProject ? 'project' : 'image');
      const task = isProject ? importProjectFile(file) : openImageAsProject(file, source);
      void task.finally(() => {
        setBusy(null);
      });
    },
    [busy],
  );

  // Ctrl+V ở trang chủ → document mới từ ảnh trong clipboard (mục 7.4).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      const file = imageFileFrom(e.clipboardData);
      if (file) open(file, 'paste');
      else notifyNoImageInClipboard();
    };
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('paste', onPaste);
    };
  }, [open]);

  return (
    <div className="flex h-full flex-col" data-testid="start-screen">
      <TopBar
        start={<AppLogo className="px-1.5" />}
        center={<PaletteButton />}
        end={
          <>
            <FullscreenButton />
            <SettingsButton />
            <ThemeMenu />
          </>
        }
      />

      <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-8 lg:py-12">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">
              {t.home.title}
            </h1>
            <p className="mt-1.5 text-[0.875rem] text-muted-foreground">{t.app.tagline}</p>
          </div>

          <HomeBanners />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,1fr)]">
            <DropZone
              busy={busy}
              onFile={(file) => {
                open(file, 'file');
              }}
            />
            <PresetList />
          </div>

          <ProjectsSection />
        </div>
      </main>
    </div>
  );
}
