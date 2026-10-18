import { TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { recordError } from '@/services/diagnostics/errorLog';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Chặn lỗi render để không trắng trang; lỗi được ghi vào nhật ký lỗi cục bộ (mục 10.3). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Paint Online] Lỗi giao diện', error, info.componentStack);
    recordError('react', error);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;

    return (
      <div role="alert" className="flex h-full items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlert className="size-6" />
          </span>
          <h1 className="text-lg font-semibold">{t.errors.unexpectedTitle}</h1>
          <p className="text-muted-foreground">{t.errors.unexpectedBody}</p>
          <Button
            onClick={() => {
              window.location.reload();
            }}
          >
            {t.errors.reload}
          </Button>
        </div>
      </div>
    );
  }
}
