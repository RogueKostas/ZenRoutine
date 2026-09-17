import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { DEFAULT_RIBBON_WINDOW, RibbonWindow, formatRibbonEdgeLabel } from './ribbonLayout';
import { isFullDay, nextZoomSpan, panWindow, windowSpan, zoomSpanLabel, zoomWindow } from './ribbonEdit';

export interface RibbonZoomControlsProps {
  window: RibbonWindow;
  onChange: (window: RibbonWindow) => void;
  /** What + / − zoom around (e.g. the selected activity's centre). Defaults to the middle. */
  focusMinutes?: number;
  bounds?: RibbonWindow;
}

/** − / + zoom, ‹ › pan by half the view, and Reset (p31 "Pinch Zoom", for mouse and keyboard). */
export function RibbonZoomControls({
  window,
  onChange,
  focusMinutes,
  bounds = DEFAULT_RIBBON_WINDOW,
}: RibbonZoomControlsProps) {
  const { colors } = useTheme();
  const span = windowSpan(window);
  const focus = focusMinutes ?? (window.startMinutes + window.endMinutes) / 2;
  const zoomInSpan = nextZoomSpan(span, 'in', bounds);
  const zoomOutSpan = nextZoomSpan(span, 'out', bounds);
  const fullDay = isFullDay(window, bounds);
  const earlier = panWindow(window, -span / 2, bounds);
  const later = panWindow(window, span / 2, bounds);

  const button = (
    label: string,
    accessibilityLabel: string,
    next: RibbonWindow,
    enabled: boolean
  ) => (
    <TouchableOpacity
      key={accessibilityLabel}
      style={[
        styles.button,
        { borderColor: colors.border, opacity: enabled ? 1 : 0.35 },
      ]}
      disabled={!enabled}
      onPress={() => onChange(next)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !enabled }}
    >
      <Text style={[styles.buttonText, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.row}>
      <View style={styles.group}>
        {button('−', 'Zoom out', zoomWindow(window, zoomOutSpan, focus, bounds), zoomOutSpan !== span)}
        {button('+', 'Zoom in', zoomWindow(window, zoomInSpan, focus, bounds), zoomInSpan !== span)}
      </View>
      {!fullDay && (
        <View style={styles.group}>
          {button('‹', 'Show earlier', earlier, earlier.startMinutes !== window.startMinutes)}
          {button('›', 'Show later', later, later.startMinutes !== window.startMinutes)}
        </View>
      )}
      <Text style={[styles.summary, { color: colors.textSecondary }]} numberOfLines={1}>
        {zoomSpanLabel(span)} · {formatRibbonEdgeLabel(window.startMinutes)}–{formatRibbonEdgeLabel(window.endMinutes)}
      </Text>
      {!fullDay && (
        <TouchableOpacity
          style={[styles.button, styles.reset, { borderColor: colors.border }]}
          onPress={() => onChange({ ...bounds })}
          accessibilityRole="button"
          accessibilityLabel="Reset zoom"
        >
          <Text style={[styles.resetText, { color: colors.text }]}>Reset zoom</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  group: {
    flexDirection: 'row',
    gap: 4,
  },
  button: {
    minWidth: 36,
    minHeight: 36,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  summary: {
    flexShrink: 1,
    fontSize: 13,
  },
  reset: {
    marginLeft: 'auto',
  },
  resetText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
