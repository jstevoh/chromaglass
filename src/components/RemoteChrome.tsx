import { SlidersHorizontal, ListMusic, Paintbrush, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import type { RemoteStatus } from '../hooks/useRemoteLink';
import { isPhoneApp, relayFromUrl } from '../lib/appLink';
import { LIT } from './ui';

export type RemoteView = 'draw' | 'controls' | 'songs';
export type RemoteLinkPhase = 'linked' | 'linking' | 'offline';
export type RemoteSectionId = 'pad' | 'bottles' | 'dyes' | 'sliders' | 'looks';

export const REMOTE_SECTIONS: { id: RemoteSectionId; label: string }[] = [
  { id: 'pad', label: 'Pad' },
  { id: 'bottles', label: 'Bottles' },
  { id: 'dyes', label: 'Dyes' },
  { id: 'sliders', label: 'Sliders' },
  { id: 'looks', label: 'Looks' },
];

/** The desk address this remote is pointing at, formatted for a compact banner. */
export function remoteDeskAddress(): string {
  const relay = isPhoneApp() ? relayFromUrl() : null;
  if (relay) {
    try {
      return new URL(relay).host || relay;
    } catch {
      return relay;
    }
  }
  if (typeof window === 'undefined') return '';
  return window.location.host || window.location.origin;
}

/** Three states a performer reads at a glance: linked, linking, or offline. */
export function remoteLinkPhase(connected: boolean, status: RemoteStatus): RemoteLinkPhase {
  if (connected) return 'linked';
  if (status === 'connecting') return 'linking';
  return 'offline';
}

const PHASE_LABEL: Record<RemoteLinkPhase, string> = {
  linked: 'Linked',
  linking: 'Linking',
  offline: 'Offline',
};

/**
 * Symmetric top navigation shared by Draw, Controls, and Songs so each screen
 * reaches either of the other two in one 44 px+ tap.
 */
export function RemoteNav({
  view,
  onSelect,
  compact = false,
}: {
  view: RemoteView;
  onSelect: (next: RemoteView) => void;
  compact?: boolean;
}) {
  const items: { id: RemoteView; label: string; icon: typeof Paintbrush; testId: string }[] = [
    { id: 'draw', label: 'Draw', icon: Paintbrush, testId: 'remote-nav-draw' },
    {
      id: 'controls',
      label: 'Controls',
      icon: SlidersHorizontal,
      testId: view === 'draw' ? 'draw-controls' : 'remote-nav-controls',
    },
    {
      id: 'songs',
      label: 'Songs',
      icon: ListMusic,
      testId: view === 'songs' ? 'remote-nav-songs' : 'remote-to-songs',
    },
  ];
  return (
    <nav
      role="tablist"
      aria-label="Remote screen"
      data-testid="remote-nav"
      className="flex min-w-0 items-center gap-1 rounded-full border border-white/10 bg-[rgba(17,17,19,.85)] p-1 backdrop-blur-[16px]"
    >
      {items.map(({ id, label, icon: Icon, testId }) => {
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => { if (!active) onSelect(id); }}
            data-testid={testId}
            className={`flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full border text-[12px] font-semibold transition-colors active:scale-95 ${
              compact ? 'px-2.5' : 'px-3.5'
            } ${active ? LIT : 'border-transparent text-white/75 hover:bg-white/5 hover:text-white'}`}
          >
            <Icon size={14} className="shrink-0" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Connection status banner shared by Draw, Controls, and Songs: shows the link
 * state (Linked, Linking, Offline), the desk address, and a 44 px+ Retry button.
 */
export function RemoteLinkBanner({
  connected,
  status,
  onRetry,
  lookText,
  lookTestId,
  detail,
  action,
  compact = false,
}: {
  connected: boolean;
  status: RemoteStatus;
  onRetry: () => void;
  lookText?: string | null;
  lookTestId?: string;
  detail?: string | null;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  const phase = remoteLinkPhase(connected, status);
  const address = remoteDeskAddress();
  const label = PHASE_LABEL[phase];
  const tone = phase === 'linked'
    ? 'border-ok/30 bg-ok/10 text-ok'
    : 'border-warn/35 bg-warn/10 text-warn';

  return (
    <div
      data-testid="remote-link-banner"
      data-phase={phase}
      className={`flex min-h-11 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border px-3 py-1 ${tone} ${compact ? 'flex-1' : 'w-full'}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2" data-testid={lookTestId}>
        {phase === 'linked' ? <Wifi size={14} className="shrink-0" /> : <WifiOff size={14} className="shrink-0" />}
        <span className="shrink-0 text-[12px] font-bold tracking-wide">{label}</span>
        {lookText && (
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">
            · {lookText}
          </span>
        )}
        {address && (
          <span className="min-w-0 max-w-[44%] shrink-0 truncate font-mono text-[12px] text-white/75" data-testid="remote-desk-address">
            {address}
          </span>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {action}
        <button
          type="button"
          onClick={onRetry}
          data-testid="remote-retry"
          title="Reconnect to the desk"
          className="flex h-11 min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-[12px] font-semibold text-white active:scale-95"
        >
          <RefreshCw size={13} className={phase === 'linking' ? 'animate-spin' : undefined} />
          <span>Retry</span>
        </button>
      </div>
      {detail && !connected && (
        <p className="basis-full pb-1 text-[12px] leading-snug text-white/80" data-testid="remote-link-detail">
          {detail}
        </p>
      )}
    </div>
  );
}

/**
 * Sticky section jumper for Remote Controls so a performer can jump straight to
 * Pad, Bottles, Dyes, Sliders, or Looks without thumb-scrolling past 14 bottles.
 */
export function RemoteSectionJumper({
  active,
  onJump,
}: {
  active: RemoteSectionId;
  onJump: (id: RemoteSectionId) => void;
}) {
  return (
    <nav
      role="tablist"
      aria-label="Controls sections"
      data-testid="remote-section-jumper"
      className="flex items-center gap-1 overflow-x-auto scrollbar-hide"
    >
      {REMOTE_SECTIONS.map((sec) => {
        const on = active === sec.id;
        return (
          <button
            key={sec.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onJump(sec.id)}
            data-testid={`remote-jump-${sec.id}`}
            className={`flex h-11 min-w-[44px] flex-1 items-center justify-center whitespace-nowrap rounded-xl border px-2 text-[12px] font-semibold transition-colors active:scale-95 ${
              on ? LIT : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10'
            }`}
          >
            {sec.label}
          </button>
        );
      })}
    </nav>
  );
}
