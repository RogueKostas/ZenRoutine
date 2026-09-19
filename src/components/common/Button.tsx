import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '../../theme';
import type { ThemeColors } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  // Colours follow the theme: a primary button is Evergreen with Paper text in light mode and Mint
  // with Night text in dark mode, never white text on an assumed-dark accent.
  const { colors } = useTheme();
  const themed = variantColors(colors, variant, isDisabled);

  return (
    <TouchableOpacity
      style={[
        styles.base,
        themed.container,
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={themed.label.color}
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && <>{icon}</>}
          <Text
            style={[
              styles.text,
              themed.label,
              styles[`textSize_${size}`],
              icon && iconPosition === 'left' ? styles.textWithLeftIcon : undefined,
              icon && iconPosition === 'right' ? styles.textWithRightIcon : undefined,
              textStyle,
            ]}
          >
            {title}
          </Text>
          {icon && iconPosition === 'right' && icon}
        </>
      )}
    </TouchableOpacity>
  );
}

function variantColors(colors: ThemeColors, variant: ButtonVariant, disabled: boolean) {
  switch (variant) {
    case 'primary':
      return { container: { backgroundColor: colors.primary }, label: { color: colors.onPrimary } };
    case 'secondary':
      return { container: { backgroundColor: colors.secondary }, label: { color: colors.onPrimary } };
    case 'destructive':
      return { container: { backgroundColor: colors.error }, label: { color: colors.onError } };
    case 'outline':
      return {
        container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: disabled ? colors.border : colors.primary },
        label: { color: disabled ? colors.textMuted : colors.primary },
      };
    case 'ghost':
      return { container: { backgroundColor: 'transparent' }, label: { color: disabled ? colors.textMuted : colors.primary } };
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },

  // Sizes
  size_small: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: 32,
  },
  size_medium: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  size_large: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },

  // Text
  text: {
    fontWeight: '600',
  },
  textWithLeftIcon: {
    marginLeft: spacing.xs,
  },
  textWithRightIcon: {
    marginRight: spacing.xs,
  },

  // Text sizes
  textSize_small: {
    fontSize: 13,
  },
  textSize_medium: {
    fontSize: 15,
  },
  textSize_large: {
    fontSize: 17,
  },
});
