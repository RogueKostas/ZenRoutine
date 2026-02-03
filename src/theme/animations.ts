import { Animated, Easing } from 'react-native';

// Animation durations
export const duration = {
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 500,
  slower: 800,
};

// Common easing functions
export const easing = {
  standard: Easing.bezier(0.4, 0, 0.2, 1),
  accelerate: Easing.bezier(0.4, 0, 1, 1),
  decelerate: Easing.bezier(0, 0, 0.2, 1),
  sharp: Easing.bezier(0.4, 0, 0.6, 1),
  bounce: Easing.bounce,
  elastic: Easing.elastic(1),
};

// Fade animations
export function fadeIn(
  value: Animated.Value,
  options?: { duration?: number; delay?: number }
): Animated.CompositeAnimation {
  return Animated.timing(value, {
    toValue: 1,
    duration: options?.duration ?? duration.normal,
    delay: options?.delay ?? 0,
    easing: easing.decelerate,
    useNativeDriver: true,
  });
}

export function fadeOut(
  value: Animated.Value,
  options?: { duration?: number; delay?: number }
): Animated.CompositeAnimation {
  return Animated.timing(value, {
    toValue: 0,
    duration: options?.duration ?? duration.normal,
    delay: options?.delay ?? 0,
    easing: easing.accelerate,
    useNativeDriver: true,
  });
}

// Scale animations
export function scaleIn(
  value: Animated.Value,
  options?: { duration?: number; fromScale?: number }
): Animated.CompositeAnimation {
  value.setValue(options?.fromScale ?? 0.8);
  return Animated.spring(value, {
    toValue: 1,
    friction: 8,
    tension: 40,
    useNativeDriver: true,
  });
}

export function scaleOut(
  value: Animated.Value,
  options?: { duration?: number; toScale?: number }
): Animated.CompositeAnimation {
  return Animated.timing(value, {
    toValue: options?.toScale ?? 0.8,
    duration: options?.duration ?? duration.fast,
    easing: easing.accelerate,
    useNativeDriver: true,
  });
}

// Slide animations
export function slideInFromBottom(
  value: Animated.Value,
  options?: { duration?: number; distance?: number }
): Animated.CompositeAnimation {
  value.setValue(options?.distance ?? 100);
  return Animated.spring(value, {
    toValue: 0,
    friction: 8,
    tension: 40,
    useNativeDriver: true,
  });
}

export function slideInFromRight(
  value: Animated.Value,
  options?: { duration?: number; distance?: number }
): Animated.CompositeAnimation {
  value.setValue(options?.distance ?? 100);
  return Animated.spring(value, {
    toValue: 0,
    friction: 8,
    tension: 40,
    useNativeDriver: true,
  });
}

// Pulse animation (for recording indicators, etc.)
export function pulse(value: Animated.Value): Animated.CompositeAnimation {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, {
        toValue: 0.4,
        duration: duration.slow,
        easing: easing.standard,
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 1,
        duration: duration.slow,
        easing: easing.standard,
        useNativeDriver: true,
      }),
    ])
  );
}

// Shake animation (for errors)
export function shake(value: Animated.Value): Animated.CompositeAnimation {
  return Animated.sequence([
    Animated.timing(value, { toValue: 10, duration: 50, useNativeDriver: true }),
    Animated.timing(value, { toValue: -10, duration: 50, useNativeDriver: true }),
    Animated.timing(value, { toValue: 10, duration: 50, useNativeDriver: true }),
    Animated.timing(value, { toValue: -10, duration: 50, useNativeDriver: true }),
    Animated.timing(value, { toValue: 0, duration: 50, useNativeDriver: true }),
  ]);
}

// Stagger animations for lists
export function staggeredFadeIn(
  values: Animated.Value[],
  options?: { stagger?: number; duration?: number }
): Animated.CompositeAnimation {
  const stagger = options?.stagger ?? 50;
  const animDuration = options?.duration ?? duration.normal;

  return Animated.stagger(
    stagger,
    values.map((value) =>
      Animated.timing(value, {
        toValue: 1,
        duration: animDuration,
        easing: easing.decelerate,
        useNativeDriver: true,
      })
    )
  );
}

// Progress animation
export function animateProgress(
  value: Animated.Value,
  toValue: number,
  options?: { duration?: number }
): Animated.CompositeAnimation {
  return Animated.timing(value, {
    toValue,
    duration: options?.duration ?? duration.slow,
    easing: easing.standard,
    useNativeDriver: false, // Can't use native driver for width/height
  });
}

// Create spring animation config (without toValue, to be added when used)
export function springConfig(options?: {
  friction?: number;
  tension?: number;
  speed?: number;
  bounciness?: number;
}): Omit<Animated.SpringAnimationConfig, 'toValue'> {
  return {
    friction: options?.friction ?? 7,
    tension: options?.tension ?? 40,
    speed: options?.speed,
    bounciness: options?.bounciness,
    useNativeDriver: true,
  };
}
