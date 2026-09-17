import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import type { ActivityType } from '../../core/types';

/** A type's coloured circle with its icon (p53, p59), or a `?` when there is no type (p50). */
export function TypeIcon({ type, size = 26 }: { type?: Pick<ActivityType, 'color' | 'icon' | 'name'>; size?: number }) {
  const { colors } = useTheme();
  if (!type) {
    return (
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.unknown, { color: colors.textSecondary, fontSize: size * 0.6 }]}>?</Text>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: type.color + '55' },
      ]}
    >
      <Text style={{ fontSize: size * 0.55 }}>{type.icon ?? type.name.charAt(0)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  unknown: {
    fontWeight: '700',
  },
});
