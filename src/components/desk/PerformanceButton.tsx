import { Button } from '../ui';

/**
 * Record a performance: what you paint until you stop, kept with the song
 * that is playing (lib/performanceTake.ts).
 *
 * On both desks, beside the look, because the only way in was a dot in the
 * header and nobody could find it (reported: "I'm not seeing any new
 * performance controls or stop/start"). Design is where a fresh browser
 * opens, so it has to be there as well as on Perform.
 */
export function PerformanceButton({ performance, onToggle }: {
  performance: { clock: string; title?: string } | null;
  onToggle: () => void;
}) {
  const title = performance?.title;
  const short = title && title.length > 22 ? `${title.slice(0, 21)}…` : title;
  return (
    <Button
      height={32}
      variant={performance ? 'danger' : 'secondary'}
      kbd="T"
      onClick={onToggle}
      midiKey="action:performance-toggle"
      testId="performance-button"
      title={performance
        ? 'Stop, and keep what was painted with the song that was playing'
        : 'Record what you paint from now until you stop, with the song that is playing'}
    >
      {/* Short below 1280, where the row beside the look is tight: at 1024 the
          full label wrapped and squeezed the layer switch into two lines. */}
      <span className="whitespace-nowrap">
        {performance
          ? <>■ Stop · {performance.clock}{short && <span className="hidden xl:inline"> · {short}</span>}</>
          : <>● Record<span className="hidden xl:inline"> performance</span></>}
      </span>
    </Button>
  );
}
