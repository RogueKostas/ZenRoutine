import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import { pieSlices, pieWedges, type BreakdownDatum } from './pieLayout';

interface BreakdownPieProps {
  data: readonly BreakdownDatum[];
  size?: number;
  /** "Tap this pie chart to see a breakdown" (p42). */
  onPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  expanded?: boolean;
}

/**
 * A pie drawn with plain views (no chart library). Each wedge of at most 180° is a half-disc,
 * rotated by the wedge's sweep inside a clip that shows only the right half of the circle, and
 * the whole thing is rotated to the wedge's start angle. Rotation is about each view's centre,
 * and every rotated view is the full circle's size and position, so they share one centre.
 */
export function BreakdownPie({
  data,
  size = 160,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  expanded,
}: BreakdownPieProps) {
  const { colors } = useTheme();
  const wedges = useMemo(() => pieWedges(pieSlices(data)), [data]);
  const radius = size / 2;

  const disc = (
    <View
      style={[
        styles.disc,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: colors.backgroundSecondary,
        },
      ]}
    >
      {wedges.map((wedge) => (
        <View
          key={wedge.key}
          pointerEvents="none"
          style={[
            styles.layer,
            { width: size, height: size, transform: [{ rotate: `${wedge.startAngle}deg` }] },
          ]}
        >
          <View style={[styles.clip, { left: radius, width: radius, height: size }]}>
            <View
              style={[
                styles.layer,
                {
                  left: -radius,
                  width: size,
                  height: size,
                  transform: [{ rotate: `${wedge.sweep}deg` }],
                },
              ]}
            >
              <View
                style={{
                  width: radius,
                  height: size,
                  backgroundColor: wedge.color,
                  borderTopLeftRadius: radius,
                  borderBottomLeftRadius: radius,
                }}
              />
            </View>
          </View>
        </View>
      ))}
      {/* The design's thick outline (p42) */}
      <View
        pointerEvents="none"
        style={[
          styles.layer,
          { width: size, height: size, borderRadius: radius, borderColor: colors.text },
          styles.outline,
        ]}
      />
    </View>
  );

  if (!onPress) {
    return (
      <View accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        {disc}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      style={({ pressed }) => [styles.pressable, pressed ? styles.pressed : null]}
    >
      {disc}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: 9999,
  },
  pressed: {
    opacity: 0.8,
  },
  disc: {
    position: 'relative',
    overflow: 'hidden',
  },
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  clip: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  outline: {
    borderWidth: 3,
  },
});
