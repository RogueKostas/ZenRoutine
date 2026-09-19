import { Platform } from 'react-native';

/**
 * ZenRoutine shell brand v1: DM Sans (SIL OFL, assets/brand/zenroutine-shell-v1/fonts/OFL.txt).
 *
 * Web: public/index.html declares the four static faces from the site's own /fonts folder (no
 * font CDN) under one family, "DM Sans", with real 400/500/600/700 weights, and applies it to all
 * text. Every existing `fontWeight` in the app therefore picks a real face, never a synthetic one,
 * and a failed or slow font load falls back to the system stack without blocking launch.
 *
 * Native: not yet. Custom fonts on iOS/Android need one registered family per weight and every
 * text style to name its face, which the app's ~180 ad-hoc `fontWeight` styles don't do. Native
 * keeps the system font until that migration; recorded in docs/ITERATION-2-PLAN.md (branding).
 */
const fontFamily = Platform.select({
  ios: 'System',
  android: 'Roboto',
  web: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
});

export const typography = {
  h1: {
    fontFamily,
    fontSize: 32,
    fontWeight: '600' as const,
    lineHeight: 40,
  },
  h2: {
    fontFamily,
    fontSize: 24,
    fontWeight: '600' as const,
    lineHeight: 32,
  },
  h3: {
    fontFamily,
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  body: {
    fontFamily,
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodySmall: {
    fontFamily,
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  label: {
    fontFamily,
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
  },
  caption: {
    fontFamily,
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
  button: {
    fontFamily,
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
};
