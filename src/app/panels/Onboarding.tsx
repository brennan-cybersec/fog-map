/**
 * First run.
 *
 * One screen, one idea, two honest choices. The brief asks that a person
 * understand what this is immediately, and that location permission never be
 * demanded as the price of entry — so exploring the demo world is offered as a
 * first-class option rather than a consolation prize, and the tracking choice
 * says plainly what it will do before the browser prompt appears.
 */

import { BrandMark } from '../../ui/primitives';

export interface OnboardingProps {
  onExploreDemo: () => void;
  onStartTracking: () => void;
}

export function Onboarding({ onExploreDemo, onStartTracking }: OnboardingProps) {
  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <div className="onboard__card">
        <BrandMark className="onboard__mark" />
        <h1 className="onboard__title" id="onboard-title">
          Terra Incognita
        </h1>
        <p className="onboard__lede">
          A map of your life &mdash; and the world you still haven&rsquo;t seen.
        </p>
        <p className="onboard__body">
          Everywhere you&rsquo;ve physically been is revealed in full colour. Everywhere else
          stays a pale survey map: drawn, but not yet experienced. The more you travel, the
          more of the world comes into focus.
        </p>

        <div className="onboard__actions">
          <button type="button" className="btn btn--primary" onClick={onExploreDemo}>
            Explore a demo world
          </button>
          <button type="button" className="btn" onClick={onStartTracking}>
            Track my own movement
          </button>
        </div>

        <p className="onboard__fine">
          The demo uses invented history for a fictional person &mdash; no location access
          needed. Tracking asks your browser for location, records it only on this device,
          and can be turned off or deleted at any time.
        </p>
      </div>
    </div>
  );
}
