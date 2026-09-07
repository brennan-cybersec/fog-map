/**
 * Privacy and data controls.
 *
 * The brief treats privacy as a first-class feature rather than a settings
 * footnote, so this panel sits in the main rail beside the map, and every
 * control here does something real: export writes a genuine lossless file,
 * deletion genuinely destroys the history and the reveal derived from it.
 *
 * Where this build has a limitation, it is stated plainly instead of being
 * hidden behind a control that looks like it works.
 */

import { useState } from 'react';
import { formatCount } from '../../core/format';
import type { DemoHistory } from '../../subsystems/demo-data';
import { exportGeoJson, exportRawJson } from '../../subsystems/storage/export';
import type { TrackingStatus } from '../../core/types';

export interface PrivacyPanelProps {
  history: DemoHistory;
  tracking: TrackingStatus;
  onToggleTracking: () => void;
  maskHome: boolean;
  onToggleMaskHome: () => void;
  onDeleteAll: () => void;
  deleted: boolean;
}

export function PrivacyPanel({
  history,
  tracking,
  onToggleTracking,
  maskHome,
  onToggleMaskHome,
  onDeleteAll,
  deleted,
}: PrivacyPanelProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="panelbody">
      <header className="panelbody__head">
        <h2 className="panelbody__title">Privacy &amp; data</h2>
        <p className="panelbody__sub">Your history stays on this device.</p>
      </header>

      <div className="statbody">
        <section className="statblock">
          <h3 className="statblock__title">Tracking</h3>
          <Toggle
            label="Record my location"
            detail={
              tracking.enabled
                ? 'Live tracking is on. New territory is revealed as you move.'
                : 'Live tracking is off. Nothing is being recorded.'
            }
            checked={tracking.enabled}
            onChange={onToggleTracking}
          />
          <Toggle
            label="Mask my home area"
            detail="Hides the reveal within roughly 300 m of home, so a shared screenshot does not give away where you live."
            checked={maskHome}
            onChange={onToggleMaskHome}
          />
        </section>

        <section className="statblock">
          <h3 className="statblock__title">Where your data lives</h3>
          <p className="prose">
            Everything you see is held on this device. There is no account, no server and
            no upload. The only network requests this app makes are for map tiles, which
            reveal the area you are looking at and nothing about your history.
          </p>
          <p className="prose prose--note">
            This build loads a synthetic demo history into memory rather than writing to
            disk, so clearing it removes it for this session. Real recorded movement would
            persist locally in your browser&rsquo;s storage.
          </p>
        </section>

        <section className="statblock">
          <h3 className="statblock__title">Export</h3>
          <p className="prose">
            Exports are lossless — full-precision coordinates, original timestamps and
            accuracy, with inferred values labelled as inferred.
          </p>
          <div className="btnrow">
            <button
              type="button"
              className="btn"
              disabled={deleted}
              onClick={() => exportGeoJson(history)}
            >
              GeoJSON
            </button>
            <button
              type="button"
              className="btn"
              disabled={deleted}
              onClick={() => exportRawJson(history)}
            >
              Raw JSON
            </button>
          </div>
          {!deleted && (
            <p className="prose prose--note">
              {formatCount(history.fixes.length)} points, {formatCount(history.segments.length)}{' '}
              movements, {formatCount(history.visits.length)} visits.
            </p>
          )}
        </section>

        <section className="statblock">
          <h3 className="statblock__title">Delete</h3>
          {deleted ? (
            <p className="prose">
              Your history has been deleted. The map has returned to unexplored, and the
              statistics derived from it are gone with it.
            </p>
          ) : (
            <>
              <p className="prose">
                Deleting removes every recorded point, the journeys built from them and the
                territory they revealed. It cannot be undone.
              </p>
              {confirming ? (
                <div className="btnrow">
                  <button type="button" className="btn btn--danger" onClick={onDeleteAll}>
                    Delete everything
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" className="btn" onClick={() => setConfirming(true)}>
                  Delete all history
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="toggle__body">
        <span className="toggle__label">{label}</span>
        <span className="toggle__detail">{detail}</span>
      </span>
    </label>
  );
}
