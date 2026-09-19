/**
 * Onboarding content and paging, kept free of react-native so it can be tested
 * in Node (#40).
 *
 * The screen renders exactly one slide -- `visibleSlide(index)` -- at the
 * width its container reports through `onLayout`. It used to scroll a
 * horizontal FlatList with `scrollToIndex`, which does not move on
 * react-native-web, and sized slides from the window width read once at module
 * load; the index advanced while slide 1 stayed on screen.
 */

export interface OnboardingSlide {
  id: string;
  emoji: string;
  title: string;
  description: string;
  color: string;
}

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    id: '1',
    emoji: '👋',
    title: 'Welcome to ZenRoutine',
    description: 'Take control of your time and achieve your goals with intelligent routine planning.',
    color: '#216653',
  },
  {
    id: '2',
    emoji: '🎯',
    title: 'Set Meaningful Goals',
    description: 'List your goals with time estimates, most important first. The top of the list is worked on first.',
    color: '#B95142',
  },
  {
    id: '3',
    emoji: '📅',
    title: 'Plan Your Week',
    description: 'Build a weekly routine from activity types. Your goals take that time in list order.',
    color: '#397793',
  },
  {
    id: '4',
    emoji: '⏱️',
    title: 'Track Your Time',
    description: 'Log time manually or start timers to track what you actually do versus what you planned.',
    color: '#28735B',
  },
  {
    id: '5',
    emoji: '📊',
    title: 'See Your Progress',
    description: 'Analyze your time with detailed breakdowns and predictions for when you\'ll reach your goals.',
    color: '#A76320',
  },
];

const SLIDE_COUNT = ONBOARDING_SLIDES.length;

export function clampSlideIndex(index: number, count: number = SLIDE_COUNT): number {
  if (count <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(count - 1, Math.max(0, Math.trunc(index)));
}

export function isLastSlide(index: number, count: number = SLIDE_COUNT): boolean {
  return clampSlideIndex(index, count) === count - 1;
}

/** The slide on screen for an index. */
export function visibleSlide(index: number): OnboardingSlide {
  return ONBOARDING_SLIDES[clampSlideIndex(index)];
}

/** Next on the last slide finishes onboarding; anywhere else it moves one slide. */
export function nextOnboardingStep(
  index: number,
  count: number = SLIDE_COUNT
): { index: number; finished: boolean } {
  const current = clampSlideIndex(index, count);
  if (current === count - 1) return { index: current, finished: true };
  return { index: current + 1, finished: false };
}

export function previousSlideIndex(index: number, count: number = SLIDE_COUNT): number {
  return clampSlideIndex(index - 1, count);
}

export function canGoBack(index: number, count: number = SLIDE_COUNT): boolean {
  return clampSlideIndex(index, count) > 0;
}

export function primaryButtonLabel(index: number, count: number = SLIDE_COUNT): 'Next' | 'Get Started' {
  return isLastSlide(index, count) ? 'Get Started' : 'Next';
}

/** One entry per dot; exactly one is active. */
export function paginationDots(index: number, count: number = SLIDE_COUNT): boolean[] {
  const current = clampSlideIndex(index, count);
  return Array.from({ length: count }, (_, dot) => dot === current);
}

/**
 * The slide width for a container's measured layout width, or null before a
 * usable measurement exists (the slide then stretches to the container).
 * Called on every `onLayout`, so a resize is followed.
 */
export function slideWidthFromLayout(layoutWidth: number): number | null {
  if (!Number.isFinite(layoutWidth) || layoutWidth <= 0) return null;
  return layoutWidth;
}
