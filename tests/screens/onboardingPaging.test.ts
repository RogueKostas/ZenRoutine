import { describe, expect, it } from 'vitest';

import {
  ONBOARDING_SLIDES,
  canGoBack,
  clampSlideIndex,
  nextOnboardingStep,
  paginationDots,
  previousSlideIndex,
  primaryButtonLabel,
  slideWidthFromLayout,
  visibleSlide,
} from '../../src/screens/onboardingPaging';

const TITLES = [
  'Welcome to ZenRoutine',
  'Set Meaningful Goals',
  'Plan Your Week',
  'Track Your Time',
  'See Your Progress',
];

describe('onboarding paging (#40)', () => {
  it('shows each of the five slides in turn as Next is pressed, then finishes', () => {
    let index = 0;
    const seen = [visibleSlide(index).title];
    const labels = [primaryButtonLabel(index)];
    let finished = false;
    for (let press = 1; press <= 5; press += 1) {
      const step = nextOnboardingStep(index);
      index = step.index;
      finished = step.finished;
      if (!finished) {
        seen.push(visibleSlide(index).title);
        labels.push(primaryButtonLabel(index));
      }
      // Finishing happens on the fifth press, not before.
      expect(finished).toBe(press === 5);
    }
    expect(seen).toEqual(TITLES);
    expect(labels).toEqual(['Next', 'Next', 'Next', 'Next', 'Get Started']);
    expect(ONBOARDING_SLIDES.map((slide) => slide.title)).toEqual(TITLES);
  });

  it('moves back one slide at a time and never before the first', () => {
    expect(previousSlideIndex(3)).toBe(2);
    expect(visibleSlide(previousSlideIndex(1)).title).toBe(TITLES[0]);
    expect(previousSlideIndex(0)).toBe(0);
    expect(canGoBack(0)).toBe(false);
    expect(canGoBack(1)).toBe(true);
    expect(canGoBack(4)).toBe(true);
  });

  it('clamps indexes into range', () => {
    expect(clampSlideIndex(-2)).toBe(0);
    expect(clampSlideIndex(9)).toBe(4);
    expect(clampSlideIndex(Number.NaN)).toBe(0);
    expect(clampSlideIndex(2.7)).toBe(2);
    expect(clampSlideIndex(3, 0)).toBe(0);
    expect(visibleSlide(99).title).toBe(TITLES[4]);
    expect(nextOnboardingStep(99)).toEqual({ index: 4, finished: true });
  });

  it('marks exactly the current dot', () => {
    expect(paginationDots(0)).toEqual([true, false, false, false, false]);
    expect(paginationDots(3)).toEqual([false, false, false, true, false]);
  });

  it('sizes a slide to the latest container measurement, so a resize is followed', () => {
    // An 800px pane in a 1920px window: one slide is 800 wide, not 1920.
    expect(slideWidthFromLayout(800)).toBe(800);
    expect(slideWidthFromLayout(400)).toBe(400);
    expect(slideWidthFromLayout(1920)).toBe(1920);
    expect(slideWidthFromLayout(0)).toBeNull();
    expect(slideWidthFromLayout(Number.NaN)).toBeNull();
  });
});
