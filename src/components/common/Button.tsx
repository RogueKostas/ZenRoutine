import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { colors } from '../../theme/colors';
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

  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles[`variant_${variant}`],
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        isDisabled && styles[`disabled_${variant}`],
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'destructive' ? '#fff' : colors.primary}
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && icon}
          <Text
            style={[
              styles.text,
              styles[`text_${variant}`],
              styles[`textSize_${size}`],
              isDisabled ? styles.textDisabled : undefined,
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

  // Variants
  variant_primary: {
    backgroundColor: colors.primary,
  },
  variant_secondary: {
    backgroundColor: colors.secondary,
  },
  variant_outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  variant_ghost: {
    backgroundColor: 'transparent',
  },
  variant_destructive: {
    backgroundColor: colors.error,
  },

  // Disabled variants
  disabled_primary: {},
  disabled_secondary: {},
  disabled_outline: {
    borderColor: colors.textMuted,
  },
  disabled_ghost: {},
  disabled_destructive: {},

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
  text_primary: {
    color: '#fff',
  },
  text_secondary: {
    color: '#fff',
  },
  text_outline: {
    color: colors.primary,
  },
  text_ghost: {
    color: colors.primary,
  },
  text_destructive: {
    color: '#fff',
  },
  textDisabled: {
    color: colors.textMuted,
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
