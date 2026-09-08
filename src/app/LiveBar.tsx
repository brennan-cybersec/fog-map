/**
 * Live tracking control.
 *
 * The one thing someone should be able to find without looking, so it sits
 * bottom-centre — thumb-reachable on a phone — and is the only accent-filled
 * control on the screen when tracking is off.
 *
 * While tracking it becomes a readout instead of a button, because the
 * interesting information at that moment is whether a fix has arrived, how good
 * it is, and how much new ground has opened up.
 */

import { formatDistance, formatDuration } from '../core/format';
import type { TrackingStatus } from '../core/types';
import type { LiveSessionState } from '../subsystems/exploration/liveSession';
import type { ProviderCapabilities } from '../subsystems/gps/provider';

export interface LiveBarProps {
  status: TrackingStatus;
  session: LiveSessionState;
  accuracyMeters: number | null;
  provider: ProviderCapabilities;
  onStart: () => void;
  onStop: () => void;
}

export function LiveBar({
  status,
  session,
  accuracyMeters,
  provider,
  onStart,
  onStop,
}: LiveBarProps) {
  if (!status.enabled) {
    return (
      <div className="live">
        <button type="button" className="live__start" onClick={onStart}>
          <span className="live__dot" aria-hidden="true" />
          Start live tracking
        </button>
      </div>
    );
  }

  // Tracking is on but nothing has arrived yet. Saying so beats a frozen zero,
  // which reads as broken when it is simply a phone still finding satellites.
  const waiting = session.fixCount === 0;

  return (
    <div className="live">
      {!provider.background && (
        <p className="live__caveat">Keep this screen on — locking the phone pauses tracking</p>
      )}
      <div className="live__panel">
        <span className="live__pulse" aria-hidden="true" />
        <span className="live__readout">
          {waiting ? (
            <span className="live__waiting">Waiting for GPS…</span>
          ) : (
            <>
              <span className="live__metric">
                <b>{formatDistance(session.distanceMeters)}</b> moved
              </span>
              <span className="live__metric">
                <b>{session.discoveredCells}</b> new
              </span>
              {accuracyMeters !== null && (
                <span className="live__accuracy">±{Math.round(accuracyMeters)} m</span>
              )}
              {/* A gap means the app was suspended and genuinely saw nothing.
                  Saying so beats a trail that silently skips a mile. */}
              {session.gapMs > 0 && (
                <span className="live__gap" title="Tracking was suspended while the app was in the background">
                  {formatDuration(session.gapMs)} missed
                </span>
              )}
            </>
          )}
        </span>
        <button type="button" className="live__stop" onClick={onStop}>
          Stop
        </button>
      </div>
    </div>
  );
}

/**
 * Discovery announcement.
 *
 * Fires only when a fix opens a cell that was genuinely unexplored, so it stays
 * meaningful on a long walk instead of firing on every step.
 */
export function DiscoveryToast({
  total,
  onDismiss,
}: {
  total: number;
  onDismiss: () => void;
}) {
  return (
    <button type="button" className="discovery" onClick={onDismiss}>
      <span className="discovery__label">New territory discovered</span>
      <span className="discovery__count">
        {total} {total === 1 ? 'place' : 'places'} this session
      </span>
    </button>
  );
}
