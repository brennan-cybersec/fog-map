/**
 * Journeys — the history explorer.
 *
 * The brief asks that this not feel like a spreadsheet, so it is built as a
 * chronological narrative: days as headings, and within them the alternation of
 * travelling and staying somewhere. Selecting anything moves the map, which is
 * what keeps the timeline and the world feeling like one product.
 *
 * The list is virtualised because the demo world alone has 453 days; rendering
 * every row would cost more than the map does.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { formatDate, formatDistance, formatDuration, formatTime } from '../../core/format';
import type { Segment, Trip } from '../../core/types';
import { buildTimeline, type TimelineDay } from '../../subsystems/timeline';

const MODE_LABEL: Record<Segment['mode'], string> = {
  walking: 'Walk',
  running: 'Run',
  cycling: 'Ride',
  driving: 'Drive',
  transit: 'Transit',
  flight: 'Flight',
};

export interface JourneysPanelProps {
  segments: readonly Segment[];
  visits: readonly import('../../core/types').Visit[];
  trips: readonly Trip[];
  onSelectSegment: (segment: Segment) => void;
  onReplayTrip: (trip: Trip) => void;
}

/** Rendered window size. Generous enough that fast scrolling never shows gaps. */
const WINDOW = 24;

export function JourneysPanel({
  segments,
  visits,
  trips,
  onSelectSegment,
  onReplayTrip,
}: JourneysPanelProps) {
  const days = useMemo(() => buildTimeline(segments, visits), [segments, visits]);
  const tripsById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);

  const [start, setStart] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeightRef = useRef(148);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const approx = Math.floor(el.scrollTop / rowHeightRef.current);
    setStart(Math.max(0, Math.min(days.length - 1, approx)));
  }, [days.length]);

  const visible = days.slice(start, start + WINDOW);

  return (
    <div className="panelbody">
      <header className="panelbody__head">
        <h2 className="panelbody__title">Journeys</h2>
        <p className="panelbody__sub">
          {days.length.toLocaleString()} days with recorded movement
        </p>
      </header>

      {/* Named trips are the memorable part of a history and would otherwise be
          buried hundreds of days down a chronological list, so they get their
          own shelf at the top. */}
      {trips.length > 0 && (
        <section className="trips">
          <h3 className="trips__title">Notable journeys</h3>
          <ul className="trips__list">
            {trips.map((trip) => (
              <li key={trip.id}>
                <button type="button" className="tl__trip" onClick={() => onReplayTrip(trip)}>
                  <span className="tl__tripmain">
                    <span className="tl__tripname">{trip.title}</span>
                    <span className="trips__meta">
                      {formatDate(trip.startAt)} · {formatDistance(trip.distanceMeters)}
                    </span>
                  </span>
                  <span className="tl__replay">Replay</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="tl" ref={scrollRef} onScroll={onScroll}>
        {/* Spacers preserve the true scroll height while only a window of days
            is actually mounted. */}
        <div style={{ height: start * rowHeightRef.current }} />
        {visible.map((day) => (
          <DayBlock
            key={day.dayStart}
            day={day}
            tripsById={tripsById}
            onSelectSegment={onSelectSegment}
            onReplayTrip={onReplayTrip}
          />
        ))}
        <div style={{ height: Math.max(0, (days.length - start - WINDOW) * rowHeightRef.current) }} />
      </div>
    </div>
  );
}

function DayBlock({
  day,
  tripsById,
  onSelectSegment,
  onReplayTrip,
}: {
  day: TimelineDay;
  tripsById: Map<string, Trip>;
  onSelectSegment: (segment: Segment) => void;
  onReplayTrip: (trip: Trip) => void;
}) {
  const trip = day.tripIds.map((id) => tripsById.get(id)).find((t) => t && t.title);

  return (
    <section className="tl__day">
      <div className="tl__dayhead">
        <h3 className="tl__date">{formatDate(day.dayStart)}</h3>
        {day.distanceMeters > 0 && (
          <span className="tl__daymeta">
            {formatDistance(day.distanceMeters)} · {formatDuration(day.movingMs)}
          </span>
        )}
      </div>

      {trip && (
        <button type="button" className="tl__trip" onClick={() => onReplayTrip(trip)}>
          <span className="tl__tripname">{trip.title}</span>
          <span className="tl__replay">Replay</span>
        </button>
      )}

      <ol className="tl__list">
        {day.entries.map((entry) =>
          entry.segment ? (
            <li key={entry.id}>
              <button
                type="button"
                className="tl__entry"
                onClick={() => onSelectSegment(entry.segment!)}
              >
                <span className={`tl__dot tl__dot--${entry.segment.mode}`} />
                <span className="tl__entrymain">
                  <span className="tl__entrytitle">
                    {MODE_LABEL[entry.segment.mode]} · {formatDistance(entry.segment.distanceMeters)}
                  </span>
                  <span className="tl__entrytime">
                    {formatTime(entry.at)} – {formatTime(entry.endAt)}
                    {/* Movement mode is inferred, never measured, so weak
                        guesses are hedged rather than stated as fact. */}
                    {entry.segment.modeConfidence < 0.75 && (
                      <span className="tl__hedge"> · approx.</span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ) : (
            <li key={entry.id}>
              <div className="tl__entry tl__entry--visit">
                <span className="tl__dot tl__dot--visit" />
                <span className="tl__entrymain">
                  <span className="tl__entrytitle">Stayed</span>
                  <span className="tl__entrytime">
                    {formatTime(entry.at)} · {formatDuration(entry.endAt - entry.at)}
                  </span>
                </span>
              </div>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
