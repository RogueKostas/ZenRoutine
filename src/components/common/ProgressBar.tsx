import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { borderRadius, spacing } from '../../theme/spacing';

interface ProgressBarProps {
  progress: number; // 0-100
  color?: string;
  backgroundColor?: string;
  height?: number;
  showLabel?: boolean;
  labelPosition?: 'inside' | 'right' | 'below';
  style?: ViewStyle;
}

export function ProgressBar({
  progress,
  color = colors.primary,
  backgroundColor = colors.borderLight,
  height = 8,
  showLabel = false,
  labelPosition = 'right',
  style,
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.progressContainer,
          labelPosition === 'right' && styles.containerWithRightLabel,
        ]}
      >
        <View
          style={[
            styles.track,
            { height, backgroundColor },
          ]}
        >
          <View
            style={[
              styles.fill,
              {
                width: `${clampedProgress}%`,
                height,
                backgroundColor: color,
              },
            ]}
          />
          {showLabel && labelPosition === 'inside' && clampedProgress > 15 && (
            <View style={styles.insideLabel}>
              <Text style={styles.insideLabelText}>{Math.round(clampedProgress)}%</Text>
            </View>
          )}
        </View>
        {showLabel && labelPosition === 'right' && (
          <Text style={styles.rightLabel}>{Math.round(clampedProgress)}%</Text>
        )}
      </View>
      {showLabel && labelPosition === 'below' && (
        <Text style={styles.belowLabel}>{Math.round(clampedProgress)}%</Text>
      )}
    </View>
  );
}

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  showLabel?: boolean;
  children?: React.ReactNode;
}

export function ProgressRing({
  progress,
  size = 60,
  strokeWidth = 6,
  color = colors.primary,
  backgroundColor = colors.borderLight,
  showLabel = true,
  children,
}: ProgressRingProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

  return (
    <View style={[styles.ringContainer, { width: size, height: size }]}>
      <View style={styles.ringBackground}>
        <View
          style={[
            styles.ringTrack,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: backgroundColor,
            },
          ]}
        />
        <View
          style={[
            styles.ringProgress,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: color,
              transform: [{ rotate: '-90deg' }],
            },
          ]}
        />
      </View>
      <View style={styles.ringContent}>
        {children || (showLabel && (
          <Text style={styles.ringLabel}>{Math.round(clampedProgress)}%</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  containerWithRightLabel: {
    flex: 1,
  },
  track: {
    flex: 1,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    borderRadius: borderRadius.full,
  },
  insideLabel: {
    position: 'absolute',
    right: spacing.xs,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  insideLabelText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  rightLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
    marginLeft: spacing.sm,
    width: 35,
    textAlign: 'right',
  },
  belowLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  ringContainer: {
    position: 'relative',
  },
  ringBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  ringTrack: {
    position: 'absolute',
  },
  ringProgress: {
    position: 'absolute',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  ringContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
