import { ImageOff } from 'lucide-react';
import { TopBar } from '@/app/layout/TopBar';
import { navigate } from '@/app/router';
import { AppLogo } from '@/app/shared/AppLogo';
import { ThemeMenu } from '@/app/shared/ThemeMenu';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

/** Mở `#/project/<id>` không còn trong phiên (vd. sau khi tải lại trang, trước khi có autosave). */
export function ProjectMissing() {
  return (
    <div className="flex h-full flex-col" data-testid="project-missing">
      <TopBar start={<AppLogo className="px-1.5" />} end={<ThemeMenu />} />
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center p-6 outline-none"
      >
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <ImageOff className="size-6" />
          </span>
          <h1 className="text-lg font-semibold">{t.editor.missingTitle}</h1>
          <p className="text-muted-foreground">{t.editor.missingBody}</p>
          <Button
            className="mt-2"
            onClick={() => {
              navigate({ name: 'home' }, { replace: true });
            }}
          >
            {t.notFound.goHome}
          </Button>
        </div>
      </main>
    </div>
  );
}
