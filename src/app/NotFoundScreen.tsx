import { TopBar } from '@/app/layout/TopBar';
import { navigate } from '@/app/router';
import { AppLogo } from '@/app/shared/AppLogo';
import { ThemeMenu } from '@/app/shared/ThemeMenu';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

/** Hash không hợp lệ (vd. `#/project/abc`). */
export function NotFoundScreen() {
  return (
    <div className="flex h-full flex-col" data-testid="not-found-screen">
      <TopBar start={<AppLogo className="px-1.5" />} end={<ThemeMenu />} />
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center p-6 outline-none"
      >
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-5xl font-semibold tracking-tight text-muted-foreground/60">404</p>
          <h1 className="text-lg font-semibold">{t.notFound.title}</h1>
          <p className="text-muted-foreground">{t.notFound.body}</p>
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
