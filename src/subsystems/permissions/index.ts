/**
 * Location permission state machine.
 *
 * Location is the most sensitive thing this product touches, so the rules here
 * are deliberately conservative: nothing observes or requests position on
 * import, the browser prompt appears only when the user asks for it, and a
 * permission withdrawn mid-session is noticed rather than silently producing a
 * feed that has quietly stopped updating.
 */

import type { PermissionState } from '../../core/types';

export type PermissionListener = (state: PermissionState) => void;

/**
 * Geolocation is gated on a secure context. Reporting that as a plain "denied"
 * would send the user hunting through browser settings for a permission that was
 * never the problem, so it gets its own state.
 */
export function isSecureContextAvailable(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext;
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export class LocationPermissions {
  private state: PermissionState = 'unknown';
  private listeners = new Set<PermissionListener>();
  private status: PermissionStatus | null = null;
  private onStatusChange: (() => void) | null = null;

  getState(): PermissionState {
    return this.state;
  }

  subscribe(listener: PermissionListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private set(next: PermissionState): void {
    if (this.state === next) return;
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }

  /**
   * Read the current permission without triggering a prompt.
   *
   * The Permissions API is not universally available for geolocation; where it
   * is missing the honest answer is "prompt", because we genuinely cannot know
   * without asking, and claiming "granted" would be a guess.
   */
  async query(): Promise<PermissionState> {
    if (!isGeolocationSupported()) {
      this.set('unavailable');
      return this.state;
    }
    if (!isSecureContextAvailable()) {
      this.set('unavailable');
      return this.state;
    }

    if (typeof navigator.permissions?.query !== 'function') {
      this.set('prompt');
      return this.state;
    }

    try {
      const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      this.attach(status);
      this.set(status.state as PermissionState);
    } catch {
      // Some browsers reject the geolocation descriptor outright. That tells us
      // nothing about the permission itself, so fall back to "must ask".
      this.set('prompt');
    }
    return this.state;
  }

  /**
   * Watch for the permission changing outside the app — revoked in site
   * settings, or granted in another tab. Without this a revocation looks
   * identical to a GPS signal that simply went quiet.
   */
  private attach(status: PermissionStatus): void {
    if (this.status === status) return;
    this.detach();
    this.status = status;
    this.onStatusChange = () => this.set(status.state as PermissionState);
    status.addEventListener('change', this.onStatusChange);
  }

  private detach(): void {
    if (this.status && this.onStatusChange) {
      this.status.removeEventListener('change', this.onStatusChange);
    }
    this.status = null;
    this.onStatusChange = null;
  }

  /**
   * Trigger the browser prompt by making one real position request.
   *
   * There is no API to ask for geolocation permission without also asking for a
   * position, so this is the only honest way to move from `prompt` to a decision.
   */
  async request(): Promise<PermissionState> {
    if (!isGeolocationSupported() || !isSecureContextAvailable()) {
      this.set('unavailable');
      return this.state;
    }

    const outcome = await new Promise<PermissionState>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve('granted'),
        (err) => resolve(err.code === err.PERMISSION_DENIED ? 'denied' : 'prompt'),
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
      );
    });

    this.set(outcome);
    // Re-query so the change listener is attached now that a decision exists.
    void this.query();
    return this.state;
  }

  dispose(): void {
    this.detach();
    this.listeners.clear();
  }
}
