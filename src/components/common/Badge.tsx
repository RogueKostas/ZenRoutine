import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'muted';
export type BadgeSize = 'small' | 'medium';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  style?: ViewStyle;
}

export function Badge({
  label,
  variant = 'default',
  size = 'small',
  style,
}: BadgeProps) {
  return (
    <View style={[styles.base, styles[`variant_${variant}`], styles[`size_${size}`], style]}>
      <Text style={[styles.text, styles[`text_${variant}`], styles[`textSize_${size}`]]}>
        {label}
      </Text>
    </View>
  );
}

interface ColorDotProps {
  color: string;
  size?: number;
  style?: ViewStyle;
}

export function ColorDot({ color, size = 12, style }: ColorDotProps) {
  return (
    <View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

interface StatusIndicatorProps {
  status: 'active' | 'inactive' | 'pending';
  size?: number;
  style?: ViewStyle;
}

export function StatusIndicator({ status, size = 8, style }: StatusIndicatorProps) {
  const statusColors = {
    active: colors.success,
    inactive: colors.textMuted,
    pending: colors.warning,
  };

  return (
    <View
      style={[
        styles.statusIndicator,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: statusColors[status],
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: borderRadius.sm,
  },

  // Variants
  variant_default: {
    backgroundColor: colors.primary + '20',
  },
  variant_success: {
    backgroundColor: colors.success + '20',
  },
  variant_warning: {
    backgroundColor: colors.warning + '20',
  },
  variant_error: {
    backgroundColor: colors.error + '20',
  },
  variant_info: {
    backgroundColor: colors.info + '20',
  },
  variant_muted: {
    backgroundColor: colors.textMuted + '20',
  },

  // Sizes
  size_small: {
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  size_medium: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },

  // Text
  text: {
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  text_default: {
    color: colors.primary,
  },
  text_success: {
    color: colors.success,
  },
  text_warning: {
    color: colors.warning,
  },
  text_error: {
    color: colors.error,
  },
  text_info: {
    color: colors.info,
  },
  text_muted: {
    color: colors.textMuted,
  },

  // Text sizes
  textSize_small: {
    fontSize: 10,
  },
  textSize_medium: {
    fontSize: 12,
  },

  // Other components
  dot: {},
  statusIndicator: {},
});
