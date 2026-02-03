import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInputProps,
} from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  containerStyle,
  inputStyle,
  ...textInputProps
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputContainerFocused,
          error && styles.inputContainerError,
        ]}
      >
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
        <TextInput
          style={[
            styles.input,
            leftIcon ? styles.inputWithLeftIcon : undefined,
            rightIcon ? styles.inputWithRightIcon : undefined,
            inputStyle,
          ]}
          placeholderTextColor={colors.textMuted}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...textInputProps}
        />
        {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

interface TextAreaProps extends Omit<InputProps, 'leftIcon' | 'rightIcon'> {
  numberOfLines?: number;
}

export function TextArea({
  numberOfLines = 4,
  containerStyle,
  inputStyle,
  ...props
}: TextAreaProps) {
  return (
    <Input
      {...props}
      containerStyle={containerStyle}
      inputStyle={StyleSheet.flatten([styles.textArea, { minHeight: numberOfLines * 24 }, inputStyle])}
      multiline
      numberOfLines={numberOfLines}
      textAlignVertical="top"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
  },
  inputContainerFocused: {
    borderColor: colors.primary,
  },
  inputContainerError: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  inputWithLeftIcon: {
    paddingLeft: spacing.xs,
  },
  inputWithRightIcon: {
    paddingRight: spacing.xs,
  },
  leftIcon: {
    paddingLeft: spacing.sm,
  },
  rightIcon: {
    paddingRight: spacing.sm,
  },
  error: {
    fontSize: 12,
    color: colors.error,
    marginTop: spacing.xs,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  textArea: {
    textAlignVertical: 'top',
  },
});
