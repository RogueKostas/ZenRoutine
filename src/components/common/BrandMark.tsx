import React from 'react';
import { Image } from 'react-native';
import { useTheme } from '../../theme';

/**
 * The ZenRoutine shell (brand kit v1, assets/brand/zenroutine-shell-v1). The supplied transparent
 * PNGs, never a re-drawing: shell-colour on light surfaces, shell-dark on dark ones. Callers give
 * it clear space (a quarter of its height) and keep it at 24 px wide or more.
 */
const SHELL = {
  light: require('../../../assets/brand/zenroutine-shell-v1/marks/shell-colour.png'),
  dark: require('../../../assets/brand/zenroutine-shell-v1/marks/shell-dark.png'),
};
const SHELL_ASPECT = 550 / 760;

const LOCKUP = {
  light: require('../../../assets/brand/zenroutine-shell-v1/logos/horizontal-light-transparent.png'),
  dark: require('../../../assets/brand/zenroutine-shell-v1/logos/horizontal-dark-transparent.png'),
};
const LOCKUP_ASPECT = 230 / 780;

export function ShellMark({ width = 64, decorative = false }: { width?: number; decorative?: boolean }) {
  const { isDark } = useTheme();
  return (
    <Image
      source={isDark ? SHELL.dark : SHELL.light}
      style={{ width, height: Math.round(width * SHELL_ASPECT) }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      {...(decorative
        ? { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no' as const }
        : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: 'ZenRoutine' })}
    />
  );
}

/** Shell and wordmark side by side. Use sparingly: headers and the About footer, 180 px wide. */
export function BrandLockup({ width = 180 }: { width?: number }) {
  const { isDark } = useTheme();
  return (
    <Image
      source={isDark ? LOCKUP.dark : LOCKUP.light}
      style={{ width, height: Math.round(width * LOCKUP_ASPECT) }}
      resizeMode="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel="ZenRoutine"
      accessibilityIgnoresInvertColors
    />
  );
}
