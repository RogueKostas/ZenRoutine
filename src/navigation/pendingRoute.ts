import type { RootStackParamList } from './types';

/**
 * A screen to open as soon as the app's navigator exists. Onboarding runs before navigation is
 * mounted, so "Sign in or create an account" on its last slide asks for the Account screen here,
 * and App opens it when the navigator is ready.
 */
type PendingRoute = 'Account';

let pending: PendingRoute | null = null;

export function requestRoute(route: PendingRoute & keyof RootStackParamList): void {
  pending = route;
}

/** The waiting route, once: taking it clears it. */
export function takePendingRoute(): PendingRoute | null {
  const route = pending;
  pending = null;
  return route;
}
