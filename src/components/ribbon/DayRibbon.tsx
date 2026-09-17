import React, { useMemo, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme';
import { getDayName } from '../../core/utils/time';
import type { ActivityType, DayOfWeek, RoutineBlock } from '../../core/types';
import {
  LABEL_TIER_HEIGHT,
  LABEL_TIERS,
  MARKER_HEAD,
  RibbonLabelMode,
  RibbonOverlay,
  RibbonOverlayStyle,
  RibbonSegment,
  RibbonWindow,
  formatRibbonEdgeLabel,
  ribbonGeometry,
  ribbonSegmentLabel,
  layoutRibbonLabels,
  layoutRibbonOverlays,
  layoutRibbonSegments,
  layoutRibbonTicks,
  minutesAtFraction,
  normalizeRibbonWindow,
  nowMarkerFraction,
  pressLocationX,
  ribbonSegmentAccessibilityLabel,
} from './ribbonLayout';

export interface DayRibbonProps {
  /** Blocks to draw. With `day`, blocks from other days are ignored (except overnight tails). */
  blocks: readonly RoutineBlock[];
  activityTypes: readonly ActivityType[];
  /** The displayed day (stored numbering, 0 = Sunday). Omit when `blocks` are already that day's. */
  day?: DayOfWeek;
  /** Visible part of the day. Defaults to 7am–11pm. */
  window?: RibbonWindow;
  /** Draws the green "you are here (in time)" marker when inside the window. */
  now?: Date | null;
  /** `type`: activity type name. `custom`: `labelFor(block)`, falling back to the type name. */
  labels?: RibbonLabelMode;
  labelFor?: (block: RoutineBlock) => string | null | undefined;
  /** Week-strip cell: just the bar, no labels, no ticks. */
  compact?: boolean;
  /** Tap to edit (p36). Without it the segments are not pressable. */
  onSegmentPress?: (block: RoutineBlock) => void;
  /**
   * Tap on time with no segment (p13), with the tapped time in (unrounded) minutes from midnight.
   * Pointer only: keyboard users need a separate "add" control.
   */
  onEmptyPress?: (minutes: number) => void;
  /** Spans drawn over the segments, e.g. grey untracked time (#54). */
  overlays?: readonly RibbonOverlay[];
  /** Bar thickness in pixels. */
  height?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const LABEL_FONT_SIZE = 11;
const UNKNOWN_TYPE_COLOR = '#9E9E9E';

export const RIBBON_OVERLAY_COLORS: Record<RibbonOverlayStyle, string> = {
  untracked: 'rgba(120, 120, 120, 0.85)',
};

export function DayRibbon({
  blocks,
  activityTypes,
  day,
  window,
  now,
  labels = 'type',
  labelFor,
  compact = false,
  onSegmentPress,
  onEmptyPress,
  overlays,
  height,
  style,
  accessibilityLabel,
}: DayRibbonProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const visibleWindow = normalizeRibbonWindow(window);
  const geometry = ribbonGeometry(compact, height);

  const segments = useMemo(
    () => layoutRibbonSegments(blocks, { day, window: visibleWindow }),
    [blocks, day, visibleWindow]
  );
  const overlaySegments = useMemo(
    () => layoutRibbonOverlays(overlays ?? [], visibleWindow),
    [overlays, visibleWindow]
  );
  const ticks = useMemo(
    () => (compact || width === 0 ? [] : layoutRibbonTicks(visibleWindow, width)),
    [compact, width, visibleWindow]
  );
  const placedLabels = useMemo(() => {
    if (compact || labels === 'none' || width === 0) return [];
    return layoutRibbonLabels(
      segments.map((segment) => ({
        key: segment.key,
        text: ribbonSegmentLabel(segment.block, labels, activityTypes, labelFor),
        anchorPx: (segment.x + segment.width / 2) * width,
      })),
      { widthPx: width, maxTiers: LABEL_TIERS }
    );
  }, [compact, labels, width, segments, activityTypes, labelFor]);

  const markerX = nowMarkerFraction(now, visibleWindow);
  const colorFor = (segment: RibbonSegment) =>
    activityTypes.find((type) => type.id === segment.block.activityTypeId)?.color ?? UNKNOWN_TYPE_COLOR;
  const nameFor = (segment: RibbonSegment) =>
    activityTypes.find((type) => type.id === segment.block.activityTypeId)?.name ?? 'Unknown activity';

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  const pct = (fraction: number) => `${fraction * 100}%` as const;

  const handleEmptyPress = (event: GestureResponderEvent) => {
    if (!onEmptyPress || width === 0) return;
    const x = pressLocationX(event.nativeEvent as { locationX?: unknown; offsetX?: unknown });
    if (x === null) return;
    onEmptyPress(minutesAtFraction(x / width, visibleWindow));
  };

  return (
    <View
      style={[{ height: geometry.total }, styles.container, style]}
      onLayout={onLayout}
      // Read-only: one picture with a summary. Editable: the segments are the buttons.
      accessibilityRole={onSegmentPress ? undefined : 'image'}
      accessibilityLabel={
        accessibilityLabel ??
        `Day ribbon, ${formatRibbonEdgeLabel(visibleWindow.startMinutes)} to ${formatRibbonEdgeLabel(visibleWindow.endMinutes)}, ${segments.length} ${segments.length === 1 ? 'activity' : 'activities'}`
      }
    >
      {/* Empty time: the whole ribbon's height is the target; segments sit above it. Childless, so
          on web the click's offsetX is measured from this element's own left edge. */}
      {onEmptyPress && (
        <Pressable
          testID="ribbon-empty-time"
          focusable={false}
          accessible={false}
          onPress={handleEmptyPress}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Labels and leader lines (p24). Taps pass through to the empty-time target. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {placedLabels.map((label) => {
          const labelTop =
            geometry.markerHeadroom + (LABEL_TIERS - 1 - label.tier) * LABEL_TIER_HEIGHT;
          const leaderTop = labelTop + LABEL_TIER_HEIGHT - 1;
          return (
            <React.Fragment key={label.key}>
              <View
                style={[
                  styles.leader,
                  {
                    left: label.anchorPx,
                    top: leaderTop,
                    height: geometry.barTop - leaderTop,
                    backgroundColor: colors.textMuted,
                  },
                ]}
              />
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[
                  styles.label,
                  {
                    left: label.leftPx,
                    width: label.widthPx,
                    top: labelTop,
                    color: colors.textSecondary,
                  },
                ]}
              >
                {label.text}
              </Text>
            </React.Fragment>
          );
        })}
      </View>

      {/* The bar: dotted track for empty time (p13), then segments, then overlays */}
      <View
        pointerEvents="box-none"
        style={[
          styles.bar,
          {
            top: geometry.barTop,
            height: geometry.bar,
            borderRadius: compact ? 2 : geometry.bar / 2,
          },
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.track,
            { top: geometry.bar / 2 - 1, borderColor: colors.textMuted },
          ]}
        />
        {segments.map((segment, index) => {
          const segmentStyle = [
            styles.segment,
            {
              left: pct(segment.x),
              width: pct(segment.width),
              backgroundColor: colorFor(segment),
            },
            // Short dark marks between neighbouring segments (p24).
            index > 0 && !compact ? { borderLeftWidth: 1, borderLeftColor: colors.text } : null,
          ];
          if (!onSegmentPress) return <View key={segment.key} style={segmentStyle} />;
          return (
            <Pressable
              key={segment.key}
              style={segmentStyle}
              onPress={() => onSegmentPress(segment.block)}
              accessibilityRole="button"
              accessibilityLabel={ribbonSegmentAccessibilityLabel(
                nameFor(segment),
                segment.block,
                day === undefined ? undefined : getDayName(day)
              )}
              accessibilityHint="Opens the edit box for this activity"
            />
          );
        })}
        {overlaySegments.map((overlay) => (
          <View
            key={overlay.key}
            pointerEvents="none"
            style={[
              styles.segment,
              {
                left: pct(overlay.x),
                width: pct(overlay.width),
                backgroundColor: RIBBON_OVERLAY_COLORS[overlay.style],
              },
            ]}
          />
        ))}
      </View>

      {/* Hour ticks and the window's end labels (p24) */}
      {!compact && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {ticks.map((tick) => (
            <React.Fragment key={tick.minutes}>
              <View
                style={[
                  styles.tickMark,
                  {
                    left: pct(tick.x),
                    top: geometry.barTop + geometry.bar,
                    height: tick.label ? 4 : 2,
                    backgroundColor: colors.textMuted,
                  },
                ]}
              />
              {tick.label !== '' && (
                <Text
                  style={[
                    styles.tickLabel,
                    {
                      left: pct(tick.x),
                      top: geometry.barTop + geometry.bar + 4,
                      color: colors.textSecondary,
                    },
                  ]}
                >
                  {tick.label}
                </Text>
              )}
            </React.Fragment>
          ))}
          <Text
            style={[
              styles.edgeLabel,
              { left: 0, top: geometry.barTop + geometry.bar + 3, color: colors.text },
            ]}
          >
            {formatRibbonEdgeLabel(visibleWindow.startMinutes)}
          </Text>
          <Text
            style={[
              styles.edgeLabel,
              styles.edgeLabelRight,
              { top: geometry.barTop + geometry.bar + 3, color: colors.text },
            ]}
          >
            {formatRibbonEdgeLabel(visibleWindow.endMinutes)}
          </Text>
        </View>
      )}

      {/* "You are here (in time)": green lollipop (p73–p77) */}
      {markerX !== null && (
        <View
          pointerEvents="none"
          style={[
            styles.marker,
            {
              left: pct(markerX),
              top: 0,
              height: geometry.barTop + geometry.bar + (compact ? 0 : 3),
            },
          ]}
        >
          {!compact && (
            <View style={[styles.markerHead, { backgroundColor: colors.success }]} />
          )}
          <View style={[styles.markerStem, { backgroundColor: colors.success }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
  },
  leader: {
    position: 'absolute',
    width: 1,
    marginLeft: -0.5,
  },
  label: {
    position: 'absolute',
    height: LABEL_TIER_HEIGHT - 1,
    lineHeight: LABEL_TIER_HEIGHT - 1,
    fontSize: LABEL_FONT_SIZE,
    textAlign: 'center',
    overflow: 'hidden',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dotted',
  },
  segment: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  tickMark: {
    position: 'absolute',
    width: 1,
    marginLeft: -0.5,
  },
  tickLabel: {
    position: 'absolute',
    width: 24,
    marginLeft: -12,
    fontSize: 10,
    textAlign: 'center',
  },
  edgeLabel: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '600',
  },
  edgeLabelRight: {
    right: 0,
    textAlign: 'right',
  },
  marker: {
    position: 'absolute',
    width: MARKER_HEAD,
    marginLeft: -MARKER_HEAD / 2,
    alignItems: 'center',
    zIndex: 5,
  },
  markerHead: {
    width: MARKER_HEAD,
    height: MARKER_HEAD,
    borderRadius: MARKER_HEAD / 2,
  },
  markerStem: {
    flex: 1,
    width: 2,
  },
});
