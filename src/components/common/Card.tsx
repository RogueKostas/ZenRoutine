import React from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  noPadding?: boolean;
  variant?: 'default' | 'elevated' | 'outlined';
}

export function Card({
  children,
  style,
  onPress,
  noPadding = false,
  variant = 'default',
}: CardProps) {
  const content = (
    <View
      style={[
        styles.base,
        styles[variant],
        noPadding && styles.noPadding,
        style,
      ]}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

interface CardHeaderProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardHeader({ children, style }: CardHeaderProps) {
  return <View style={[styles.header, style]}>{children}</View>;
}

interface CardContentProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardContent({ children, style }: CardContentProps) {
  return <View style={[styles.content, style]}>{children}</View>;
}

interface CardFooterProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardFooter({ children, style }: CardFooterProps) {
  return <View style={[styles.footer, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  noPadding: {
    padding: 0,
  },
  default: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  header: {
    marginBottom: spacing.sm,
  },
  content: {
    // Default content styles
  },
  footer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
});
