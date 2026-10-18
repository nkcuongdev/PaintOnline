import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useEffect } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useUiStore, type Toast } from '@/stores/ui';

const DURATION_MS = 4500;

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUiStore((s) => s.dismissToast);
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        dismiss(toast.id);
      },
      toast.kind === 'error' ? DURATION_MS * 1.5 : DURATION_MS,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast, dismiss]);

  const Icon = toast.kind === 'success' ? CircleCheck : toast.kind === 'error' ? CircleAlert : Info;
  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      data-testid="toast"
      data-kind={toast.kind}
      className="pointer-events-auto flex max-w-md animate-in items-start gap-2.5 rounded-xl border bg-popover px-3.5 py-2.5 text-popover-foreground shadow-island fade-in-0 slide-in-from-bottom-2"
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          toast.kind === 'success' && 'text-success',
          toast.kind === 'error' && 'text-destructive',
          toast.kind === 'info' && 'text-primary',
        )}
        aria-hidden="true"
      />
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        aria-label={t.actions.close}
        onClick={() => {
          dismiss(toast.id);
        }}
        className="-mr-1 rounded-md p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Thông báo ngắn ở đáy màn hình (copy xong, lỗi mở ảnh, hết bộ nhớ…). */
export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-10 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
