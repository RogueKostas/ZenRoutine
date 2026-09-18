/**
 * A Supabase email link (sign-up confirmation, until codes are switched on) confirms the account
 * on Supabase's side and then opens the web app with the result in the URL fragment. On an iPhone
 * or iPad that is Safari, not the Home Screen app. The client ignores sessions in the URL
 * (client.ts), so this only reads what happened, tells the person, and tidies the address bar.
 */

export interface RedirectNotice {
  title: string;
  message: string;
}

export function describeAuthRedirect(hash: string): RedirectNotice | null {
  if (!hash || hash.length < 2) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const errorDescription = params.get('error_description');
  if (errorDescription) {
    const expired = /expired|invalid/i.test(errorDescription) || params.get('error_code') === 'otp_expired';
    return {
      title: "That link didn't work",
      message: expired
        ? 'The link has expired or was already used. If your account is confirmed, just sign in with your password in Settings → Account.'
        : `${errorDescription.replace(/\+/g, ' ')}. Try signing in with your password in Settings → Account.`,
    };
  }
  const type = params.get('type');
  if (type === 'signup' || type === 'email' || (params.has('access_token') && type !== 'recovery')) {
    return {
      title: 'Email confirmed',
      message:
        'Your ZenRoutine account is ready. Go back to the app you signed up in (on an iPhone or iPad, the Home Screen icon) and sign in with your password in Settings → Account.',
    };
  }
  return null;
}

/** Web only: read the fragment once, then remove it so tokens never linger in the address bar or history. */
export function consumeAuthRedirect(): RedirectNotice | null {
  const location = (globalThis as { location?: Location }).location;
  const history = (globalThis as { history?: History }).history;
  if (!location || !location.hash) return null;
  const notice = describeAuthRedirect(location.hash);
  if (notice && history?.replaceState) {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  return notice;
}
