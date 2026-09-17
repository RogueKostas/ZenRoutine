import React from 'react';
import { StyleSheet, View } from 'react-native';

const TOMATO_RED = '#E53935';
const LEAF_GREEN = '#2E7D32';

interface TomatoRowProps {
  /** One 0–1 fill per pomodoro of the set (see `tomatoFills`). */
  fills: readonly number[];
  completed: number;
}

/**
 * p76's tomatoes: "Completed and 'available' pomodoros in this 'session'". Filled for done,
 * part-filled (left to right, as drawn on p75) for the one in progress, outlined for the rest.
 */
export function TomatoRow({ fills, completed }: TomatoRowProps) {
  return (
    <View
      style={styles.row}
      accessibilityRole="image"
      accessibilityLabel={`${completed} ${completed === 1 ? 'pomodoro' : 'pomodoros'} completed this session`}
      testID="tomato-row"
    >
      {fills.map((fill, index) => (
        <View key={index} style={styles.tomato}>
          <View style={styles.leaf} />
          <View style={styles.body}>
            <View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const SIZE = 24;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  tomato: {
    alignItems: 'center',
  },
  leaf: {
    width: 8,
    height: 4,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: LEAF_GREEN,
  },
  body: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderColor: TOMATO_RED,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: TOMATO_RED,
  },
});
