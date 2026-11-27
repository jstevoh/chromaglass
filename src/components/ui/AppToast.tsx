import type { ToastItem } from '../../app/useToast';

interface AppToastProps {
  toast: ToastItem | null;
  onAction: () => void;
  phone?: boolean;
  bottomClass?: string;
}

/**
 * Floating plate toast pill with an optional interactive Undo action (PLAN 49a).
 * Positioned clear of the bottom dock/tray on desktop, phone and remote alike.
 */
export function AppToast({ toast, onAction, phone = false, bottomClass }: AppToastProps) {
  if (!toast) return null;
  const hasAction = Boolean(toast.actionLabel);
  const bottom = bottomClass ?? (phone ? 'bottom-44' : 'bottom-20');
  return (
    <div
      key={toast.id}
      role={hasAction ? 'status' : undefined}
      className={`fixed ${bottom} ${phone ? 'max-w-[calc(100vw-24px)]' : 'max-w-[min(560px,calc(100vw-32px))]'} left-1/2 z-50 -translate-x-1/2 ${hasAction ? 'pointer-events-auto' : 'pointer-events-none'} flex items-center gap-3 rounded-full border border-white/15 bg-black/85 ${hasAction ? 'pl-4 pr-1.5 py-1.5' : 'px-4 py-2 whitespace-nowrap'} text-[13px] text-white/90 shadow-2xl backdrop-blur-xl`}
      data-testid="toast"
    >
      <div className="min-w-0 flex items-baseline gap-2">
        <span className="truncate font-medium text-white">{toast.title}</span>
        {toast.meta && <span className="hidden sm:inline truncate text-[12px] text-white/65">{toast.meta}</span>}
      </div>
      {toast.actionLabel && (
        <button
          type="button"
          onClick={onAction}
          data-testid="toast-undo"
          className={`shrink-0 rounded-full bg-primary font-semibold text-on-primary transition-opacity hover:opacity-90 active:opacity-80 ${phone ? 'min-h-[38px] px-4 text-[13px]' : 'h-8 px-3.5 text-[12px]'}`}
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}
