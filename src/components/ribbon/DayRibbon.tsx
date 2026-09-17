import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  PanResponderGestureState,
  Platform,
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
  DEFAULT_RIBBON_WINDOW,
  LABEL_TIER_HEIGHT,
  LABEL_TIERS,
  MARKER_HEAD,
  TICK_EDGE_CLEARANCE_PX,
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
  tickIntervalForWindow,
} from './ribbonLayout';
import {
  BlockTimeUpdate,
  EDGE_TAP_SLOP_PX,
  RibbonEdge,
  applyBlockTimeUpdates,
  dragDeltaToMinutes,
  edgeDragBounds,
  edgeHandleHitWidth,
  edgeMoveUpdates,
  edgeNudgeForKey,
  isFullDay,
  isSharedEdge,
  nextZoomSpan,
  nudgeEdgeUpdates,
  panDeltaMinutes,
  panWindow,
  pinchZoomStep,
  resolveEdgeMinutes,
  ribbonEdges,
  wheelZoomStep,
  windowSpan,
  zoomWindow,
} from './ribbonEdit';

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
  /**
   * Drag activity extents (p31, p34–p35). With `day` set, every edge gets a grab handle; a shared
   * boundary moves both blocks. Called once on release with the snapped, clamped updates. If the
   * caller refuses them the ribbon simply keeps showing `blocks`. `[` `]` `{` `}` on a focused
   * segment nudge its start / end by 15 minutes (web).
   */
  onEdgeCommit?: (updates: BlockTimeUpdate[]) => void;
  /**
   * Makes the ribbon zoomable (p31 "Pinch Zoom"): Ctrl/⌘+wheel on web, pinch on touch, and, when
   * zoomed in, dragging the track pans. Ticks densify with the zoom. `window` is then controlled.
   */
  onWindowChange?: (window: RibbonWindow) => void;
  /** The furthest a zoomable ribbon can show. Defaults to 7am–11pm. */
  zoomBounds?: RibbonWindow;
  /** Bar thickness in pixels. */
  height?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const LABEL_FONT_SIZE = 11;
const UNKNOWN_TYPE_COLOR = '#9E9E9E';
/** The design's drag handle (p34). */
const HANDLE_COLOR = '#F5C518';

// react-native-web honours these; React Native's style types only declare them for other uses.
const webOnly = (style: Record<string, string>): ViewStyle | null =>
  Platform.OS === 'web' ? (style as unknown as ViewStyle) : null;
const webNoSelect = webOnly({ userSelect: 'none', touchAction: 'pan-y' });
const webResizeCursor = webOnly({ cursor: 'ew-resize', touchAction: 'none' });

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
  onEdgeCommit,
  onWindowChange,
  zoomBounds,
  height,
  style,
  accessibilityLabel,
}: DayRibbonProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const visibleWindow = normalizeRibbonWindow(window);
  const geometry = ribbonGeometry(compact, height);
  const editDay = !compact && onEdgeCommit ? day : undefined;
  const zoomable = !compact && onWindowChange !== undefined;
  const bounds = zoomBounds ?? DEFAULT_RIBBON_WINDOW;
  const zoomedIn = zoomable && !isFullDay(visibleWindow, bounds);

  // The edge being dragged and where it would land; the ribbon previews the result (p35).
  const [drag, setDrag] = useState<{ edge: RibbonEdge; minutes: number } | null>(null);
  const shownBlocks = useMemo(
    () => (drag ? applyBlockTimeUpdates(blocks, edgeMoveUpdates(drag.edge, drag.minutes)) : blocks),
    [blocks, drag]
  );
  const edges = useMemo(
    () => (editDay === undefined ? [] : ribbonEdges(blocks, editDay)),
    [blocks, editDay]
  );

  const segments = useMemo(
    () => layoutRibbonSegments(shownBlocks, { day, window: visibleWindow }),
    [shownBlocks, day, visibleWindow]
  );
  const overlaySegments = useMemo(
    () => layoutRibbonOverlays(overlays ?? [], visibleWindow),
    [overlays, visibleWindow]
  );
  const ticks = useMemo(() => {
    if (compact || width === 0) return [];
    if (!zoomable) return layoutRibbonTicks(visibleWindow, width);
    // Zoomed windows have wider end labels (`7:15pm`); keep tick labels clear of them.
    const endChars = Math.max(
      formatRibbonEdgeLabel(visibleWindow.startMinutes).length,
      formatRibbonEdgeLabel(visibleWindow.endMinutes).length
    );
    return layoutRibbonTicks(visibleWindow, width, {
      intervalMinutes: tickIntervalForWindow(visibleWindow),
      edgeClearancePx: endChars > 4 ? endChars * 7 + 12 : TICK_EDGE_CLEARANCE_PX,
    });
  }, [compact, width, visibleWindow, zoomable]);
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

  // Gesture handlers are created once, so they read the latest render through this ref.
  const renderState = {
    blocks,
    editDay,
    width,
    visibleWindow,
    bounds,
    zoomedIn,
    onEdgeCommit,
    onWindowChange,
    onSegmentPress,
  };
  const latest = useRef(renderState);
  latest.current = renderState;
  const edgeDragRef = useRef<{ edge: RibbonEdge; bounds: { min: number; max: number }; minutes: number } | null>(
    null
  );
  // On web a click still follows a drag's mouseup; it must not open the edit box.
  const suppressPressUntil = useRef(0);
  const pressSuppressed = () => Date.now() < suppressPressUntil.current;

  const edgeDrag = useMemo(
    () => ({
      start(edge: RibbonEdge) {
        const { blocks: current, editDay: currentDay } = latest.current;
        if (currentDay === undefined) return;
        const edgeBounds = edgeDragBounds(edge, current, currentDay);
        edgeDragRef.current = { edge, bounds: edgeBounds, minutes: edge.minutes };
        setDrag({ edge, minutes: edge.minutes });
      },
      move(dx: number) {
        const active = edgeDragRef.current;
        if (!active) return;
        const { width: currentWidth, visibleWindow: currentWindow } = latest.current;
        const raw = dragDeltaToMinutes(active.edge.minutes, dx, currentWidth, currentWindow);
        const minutes = resolveEdgeMinutes(raw, active.bounds);
        if (minutes === active.minutes) return;
        active.minutes = minutes;
        setDrag({ edge: active.edge, minutes });
      },
      end(commit: boolean, dx: number) {
        const active = edgeDragRef.current;
        edgeDragRef.current = null;
        setDrag(null);
        suppressPressUntil.current = Date.now() + 400;
        if (!active || !commit) return;
        if (Math.abs(dx) < EDGE_TAP_SLOP_PX) {
          // A tap on a handle is a tap on its block (p36): the one starting here, else ending.
          const tapped = active.edge.startOf ?? active.edge.endOf;
          if (tapped) latest.current.onSegmentPress?.(tapped);
          return;
        }
        const updates = edgeMoveUpdates(active.edge, active.minutes);
        if (updates.length > 0) latest.current.onEdgeCommit?.(updates);
      },
    }),
    []
  );

  // Pan (drag the track while zoomed in) and pinch (two fingers) on the whole ribbon.
  const trackGesture = useRef<{
    startWindow: RibbonWindow;
    pageLeft: number | null;
    pinchDistance: number | null;
    pinched: boolean;
  } | null>(null);
  const containerRef = useRef<View>(null);
  const trackResponder = useMemo(() => {
    const touchesOf = (event: GestureResponderEvent) => event.nativeEvent.touches ?? [];
    const wantsTrack = (event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      if (!latest.current.onWindowChange || edgeDragRef.current) return false;
      if (touchesOf(event).length >= 2) return true;
      return latest.current.zoomedIn && Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
    };
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: (event) =>
        latest.current.onWindowChange !== undefined && !edgeDragRef.current && touchesOf(event).length >= 2,
      onMoveShouldSetPanResponderCapture: wantsTrack,
      onMoveShouldSetPanResponder: wantsTrack,
      onPanResponderGrant: () => {
        const gesture = {
          startWindow: latest.current.visibleWindow,
          pageLeft: null as number | null,
          pinchDistance: null as number | null,
          pinched: false,
        };
        trackGesture.current = gesture;
        containerRef.current?.measure((_x, _y, _w, _h, pageX) => {
          gesture.pageLeft = pageX;
        });
      },
      onPanResponderMove: (event, gesture) => {
        const active = trackGesture.current;
        const { visibleWindow: current, bounds: limits, width: currentWidth, onWindowChange: change } =
          latest.current;
        if (!active || !change) return;
        suppressPressUntil.current = Date.now() + 400;
        const touches = touchesOf(event);
        if (touches.length >= 2) {
          const [a, b] = touches;
          const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
          if (active.pinchDistance === null) {
            active.pinchDistance = distance;
            return;
          }
          const step = pinchZoomStep(active.pinchDistance, distance);
          if (step === 0) return;
          active.pinched = true;
          active.pinchDistance = distance;
          const centreX = (a.pageX + b.pageX) / 2 - (active.pageLeft ?? 0);
          const focus =
            active.pageLeft !== null && currentWidth > 0
              ? minutesAtFraction(centreX / currentWidth, current)
              : (current.startMinutes + current.endMinutes) / 2;
          const span = nextZoomSpan(windowSpan(current), step > 0 ? 'in' : 'out', limits);
          change(zoomWindow(current, span, focus, limits));
          return;
        }
        if (active.pinched) return;
        const next = panWindow(
          active.startWindow,
          panDeltaMinutes(gesture.dx, currentWidth, active.startWindow),
          limits
        );
        if (next.startMinutes !== current.startMinutes) change(next);
      },
      onPanResponderRelease: () => {
        trackGesture.current = null;
      },
      onPanResponderTerminate: () => {
        trackGesture.current = null;
      },
    });
  }, []);

  // Web: Ctrl/⌘+wheel zooms around the cursor; `[` `]` `{` `}` nudge the focused segment's edges.
  const focusedBlockId = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || (!zoomable && editDay === undefined)) return;
    // On react-native-web a View's ref is its DOM element.
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    let wheelTotal = 0;
    const onWheel = (event: WheelEvent) => {
      const { visibleWindow: current, bounds: limits, onWindowChange: change } = latest.current;
      if (!change || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const result = wheelZoomStep(wheelTotal, event.deltaY);
      wheelTotal = result.remaining;
      if (result.step === 0) return;
      const rect = node.getBoundingClientRect();
      const focus = minutesAtFraction(rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5, current);
      const span = nextZoomSpan(windowSpan(current), result.step > 0 ? 'in' : 'out', limits);
      change(zoomWindow(current, span, focus, limits));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const { blocks: current, editDay: currentDay, onEdgeCommit: commit } = latest.current;
      const blockId = focusedBlockId.current;
      if (!commit || currentDay === undefined || !blockId || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const nudge = edgeNudgeForKey(event.key);
      if (!nudge) return;
      event.preventDefault();
      const updates = nudgeEdgeUpdates(current, currentDay, blockId, nudge.side, nudge.delta);
      if (updates.length > 0) commit(updates);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('keydown', onKeyDown);
    };
  }, [zoomable, editDay]);

  const handleEmptyPress = (event: GestureResponderEvent) => {
    if (!onEmptyPress || width === 0 || pressSuppressed()) return;
    const x = pressLocationX(event.nativeEvent as { locationX?: unknown; offsetX?: unknown });
    if (x === null) return;
    onEmptyPress(minutesAtFraction(x / width, visibleWindow));
  };

  return (
    <View
      ref={containerRef}
      style={[{ height: geometry.total }, styles.container, zoomable ? webNoSelect : null, style]}
      onLayout={onLayout}
      {...(zoomable ? trackResponder.panHandlers : null)}
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
              onPress={() => {
                if (!pressSuppressed()) onSegmentPress(segment.block);
              }}
              onFocus={() => {
                focusedBlockId.current = segment.block.id;
              }}
              onBlur={() => {
                if (focusedBlockId.current === segment.block.id) focusedBlockId.current = null;
              }}
              accessibilityRole="button"
              accessibilityLabel={ribbonSegmentAccessibilityLabel(
                nameFor(segment),
                segment.block,
                day === undefined ? undefined : getDayName(day)
              )}
              accessibilityHint={
                editDay === undefined
                  ? 'Opens the edit box for this activity'
                  : 'Opens the edit box for this activity. [ and ] move its start, { and } its end, by 15 minutes'
              }
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

      {/* Drag handles on activity extents (p31, p34–p35) and the dragged time (like p14's caret) */}
      {edges.map((edge) => {
        const minutes = drag && drag.edge.key === edge.key ? drag.minutes : edge.minutes;
        if (minutes < visibleWindow.startMinutes || minutes > visibleWindow.endMinutes) return null;
        const fraction = (minutes - visibleWindow.startMinutes) / windowSpan(visibleWindow);
        return (
          <EdgeHandle
            key={edge.key}
            edge={edge}
            left={pct(fraction)}
            top={geometry.barTop - 6}
            height={geometry.bar + 12}
            hitWidth={edgeHandleHitWidth(edge, width / windowSpan(visibleWindow))}
            active={drag?.edge.key === edge.key}
            gripColor={colors.text}
            onStart={edgeDrag.start}
            onMove={edgeDrag.move}
            onEnd={edgeDrag.end}
          />
        );
      })}
      {drag && (
        <View
          pointerEvents="none"
          style={[
            styles.dragLabel,
            {
              left: pct((drag.minutes - visibleWindow.startMinutes) / windowSpan(visibleWindow)),
              top: Math.max(0, geometry.barTop - LABEL_TIER_HEIGHT - 8),
              borderColor: colors.text,
            },
          ]}
        >
          <Text style={styles.dragLabelText} numberOfLines={1}>
            {formatRibbonEdgeLabel(drag.minutes)}
          </Text>
        </View>
      )}

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

interface EdgeHandleProps {
  edge: RibbonEdge;
  left: `${number}%`;
  top: number;
  height: number;
  hitWidth: number;
  active: boolean;
  gripColor: string;
  onStart: (edge: RibbonEdge) => void;
  onMove: (dx: number) => void;
  /** `commit` is false when the gesture was taken away; `dx` is the total horizontal travel. */
  onEnd: (commit: boolean, dx: number) => void;
}

/** A grab handle on one edge. Mouse (react-native-web) and touch both go through PanResponder. */
function EdgeHandle({
  edge,
  left,
  top,
  height,
  hitWidth,
  active,
  gripColor,
  onStart,
  onMove,
  onEnd,
}: EdgeHandleProps) {
  const edgeRef = useRef(edge);
  edgeRef.current = edge;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => onStart(edgeRef.current),
        onPanResponderMove: (_event, gesture) => onMove(gesture.dx),
        onPanResponderRelease: (_event, gesture) => {
          onMove(gesture.dx);
          onEnd(true, gesture.dx);
        },
        onPanResponderTerminate: () => onEnd(false, 0),
      }),
    [onStart, onMove, onEnd]
  );
  const shared = isSharedEdge(edge);
  return (
    // Pointer only; keyboard users nudge edges from the focused segment instead.
    <View
      {...responder.panHandlers}
      accessible={false}
      testID={`ribbon-edge-${edge.minutes}`}
      style={[
        styles.handle,
        webResizeCursor,
        { left, top, height, width: hitWidth, marginLeft: -hitWidth / 2 },
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.handleGrip,
          {
            borderColor: gripColor,
            width: active ? 8 : shared ? 6 : 5,
            opacity: shared || active ? 1 : 0.85,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  handle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  handleGrip: {
    height: '100%',
    borderRadius: 3,
    borderWidth: 1,
    backgroundColor: HANDLE_COLOR,
  },
  dragLabel: {
    position: 'absolute',
    width: 64,
    marginLeft: -32,
    height: LABEL_TIER_HEIGHT + 2,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: HANDLE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  dragLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111111',
  },
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
