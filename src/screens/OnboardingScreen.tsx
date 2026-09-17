import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';
import { useAppStore } from '../store';
import {
  canGoBack,
  isLastSlide,
  nextOnboardingStep,
  paginationDots,
  previousSlideIndex,
  primaryButtonLabel,
  slideWidthFromLayout,
  visibleSlide,
} from './onboardingPaging';

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { colors } = useTheme();
  const addSampleData = useAppStore((state) => state._addSampleData);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Measured from the viewport rather than read from the window once at load,
  // so a slide is always exactly one container wide, including after a resize.
  const [slideWidth, setSlideWidth] = useState<number | null>(null);

  const slide = visibleSlide(currentIndex);
  const lastSlide = isLastSlide(currentIndex);

  const handleNext = () => {
    const step = nextOnboardingStep(currentIndex);
    if (step.finished) {
      onComplete();
    } else {
      setCurrentIndex(step.index);
    }
  };

  const handleBack = () => {
    setCurrentIndex(previousSlideIndex(currentIndex));
  };

  const handleTryExampleData = () => {
    addSampleData();
    onComplete();
  };

  const handleViewportLayout = (event: LayoutChangeEvent) => {
    setSlideWidth(slideWidthFromLayout(event.nativeEvent.layout.width));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        {canGoBack(currentIndex) ? (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Previous slide"
          >
            <Text style={[styles.headerText, { color: colors.textSecondary }]}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        {!lastSlide && (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onComplete}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
          >
            <Text style={[styles.headerText, { color: colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.viewport} onLayout={handleViewportLayout}>
        <View
          key={slide.id}
          style={[styles.slide, slideWidth === null ? styles.slideStretch : { width: slideWidth }]}
        >
          <View style={[styles.emojiContainer, { backgroundColor: slide.color + '20' }]}>
            <Text style={styles.emoji}>{slide.emoji}</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            {slide.title}
          </Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {slide.description}
          </Text>
        </View>
      </View>

      <View style={styles.pagination} accessibilityLabel={`Slide ${currentIndex + 1} of ${paginationDots(currentIndex).length}`}>
        {paginationDots(currentIndex).map((active, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              active ? styles.dotActive : styles.dotInactive,
              { backgroundColor: colors.primary },
            ]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        {lastSlide && (
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, { borderColor: colors.primary }]}
            onPress={handleTryExampleData}
            accessibilityRole="button"
            accessibilityLabel="Try it with example data"
          >
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
              Try it with example data
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={handleNext}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{primaryButtonLabel(currentIndex)}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  headerButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '500',
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  slide: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  slideStretch: {
    alignSelf: 'stretch',
  },
  emojiContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  emoji: {
    fontSize: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: spacing.md,
    maxWidth: 560,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: spacing.md,
    maxWidth: 560,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  dotActive: {
    width: 20,
    opacity: 1,
  },
  dotInactive: {
    width: 8,
    opacity: 0.3,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  button: {
    flexGrow: 1,
    flexBasis: 200,
    paddingVertical: 16,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  secondaryButton: {
    borderWidth: 2,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
