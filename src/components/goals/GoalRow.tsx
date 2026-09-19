import React, { useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme';
import type { ActivityType, Goal } from '../../core/types';
import {
  estimateDraftStart,
  formatGoalEstimate,
  readEstimateDraft,
  type EstimateDraft,
} from '../../core/engine/goalList';
import { measureAnchor } from './Popover';
import type { Rect } from './popoverPosition';
import { TypeIcon } from './TypeIcon';

export interface RowDragHandlers {
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: (dy: number) => void;
  onCancel: () => void;
}

interface GoalRowProps {
  goal: Goal;
  activityType?: ActivityType;
  /** False in a filtered list (p64). */
  showType: boolean;
  hint: string | null;
  onToggleDone: () => void;
  onRename: (name: string) => void;
  /** Save a typed estimate, or remove it (an emptied field). */
  onSetEstimate: (draft: Exclude<EstimateDraft, { kind: 'error' }>) => void;
  onOpenTypePicker: (anchor: Rect) => void;
  onOpenMenu: (anchor: Rect) => void;
  drag: RowDragHandlers;
  onLayout: (event: LayoutChangeEvent) => void;
  offsetY: number;
  isDragging: boolean;
}

/** On web the handle must not start a page scroll or a text selection. */
const WEB_HANDLE_STYLE = Platform.OS === 'web'
  ? ({ touchAction: 'none', cursor: 'grab', userSelect: 'none' } as unknown as ViewStyle)
  : null;

/**
 * One goal: `[☐] name [type] [estimate]` (p50–p51), plus a drag handle and a `⋯` menu. The name
 * and estimate edit in place (p55–p58); the type opens a small list (p52–p53).
 */
export function GoalRow({
  goal,
  activityType,
  showType,
  hint,
  onToggleDone,
  onRename,
  onSetEstimate,
  onOpenTypePicker,
  onOpenMenu,
  drag,
  onLayout,
  offsetY,
  isDragging,
}: GoalRowProps) {
  const { colors } = useTheme();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [estimateText, setEstimateText] = useState<string | null>(null);
  const typeRef = useRef<View>(null);
  const menuRef = useRef<View>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => dragRef.current.onStart(),
      onPanResponderMove: (_event, gesture) => dragRef.current.onMove(gesture.dy),
      onPanResponderRelease: (_event, gesture) => dragRef.current.onEnd(gesture.dy),
      onPanResponderTerminate: () => dragRef.current.onCancel(),
    })
  ).current;

  const done = goal.status === 'completed';
  const estimate = formatGoalEstimate(goal.estimatedMinutes);
  const estimateDraft = estimateText === null ? null : readEstimateDraft(estimateText);

  // Enter commits and closes; so does leaving the field, but the field then blurs as it unmounts,
  // so each edit is settled once: `settled` stops the second call (and Escape's close) committing.
  const settled = useRef(false);

  const openName = () => {
    settled.current = false;
    setNameDraft(goal.name);
  };
  const commitName = () => {
    if (settled.current) return;
    settled.current = true;
    if (nameDraft !== null && nameDraft.trim() && nameDraft.trim() !== goal.name) {
      onRename(nameDraft.trim());
    }
    setNameDraft(null);
  };

  const openEstimate = () => {
    settled.current = false;
    setEstimateText(estimateDraftStart(goal.estimatedMinutes));
  };
  /** Enter keeps a mistyped estimate open with its error; leaving the field drops it. */
  const commitEstimate = (onError: 'stay' | 'discard') => {
    if (settled.current || !estimateDraft) return;
    if (estimateDraft.kind === 'error') {
      if (onError === 'stay') return;
      settled.current = true;
      setEstimateText(null);
      return;
    }
    settled.current = true;
    onSetEstimate(estimateDraft);
    setEstimateText(null);
  };

  const cancelOnEscape = (key: string, close: () => void) => {
    if (key !== 'Escape') return;
    settled.current = true;
    close();
  };

  const subline = estimateDraft
    ? estimateDraft.kind === 'error'
      ? { text: estimateDraft.error, color: colors.error }
      : { text: estimateDraft.echo, color: colors.primary }
    : hint
      ? { text: hint, color: colors.textMuted }
      : null;

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.row,
        { borderBottomColor: colors.border, backgroundColor: colors.background },
        offsetY !== 0 && { transform: [{ translateY: offsetY }] },
        isDragging && [styles.dragging, { backgroundColor: colors.surface }],
      ]}
    >
      <View
        {...panResponder.panHandlers}
        style={[styles.handle, WEB_HANDLE_STYLE]}
        accessibilityLabel={`Drag to reorder ${goal.name}`}
        accessibilityHint="Or use Move up and Move down in the row's menu"
      >
        <Text style={[styles.handleGlyph, { color: colors.textMuted }]}>⋮⋮</Text>
      </View>

      <Pressable
        onPress={onToggleDone}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityLabel={`Done: ${goal.name}`}
        accessibilityState={{ checked: done }}
        style={[
          styles.checkbox,
          { borderColor: done ? colors.primary : colors.text },
          done && { backgroundColor: colors.primary },
        ]}
      >
        {done && <Text style={[styles.checkmark, { color: colors.onPrimary }]}>✓</Text>}
      </Pressable>

      <View style={styles.body}>
        {nameDraft !== null ? (
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            onSubmitEditing={commitName}
            onBlur={commitName}
            onKeyPress={(event) => cancelOnEscape(event.nativeEvent.key, () => setNameDraft(null))}
            autoFocus
            accessibilityLabel="Goal name"
            style={[styles.name, styles.nameInput, { color: colors.text, borderBottomColor: colors.primary }]}
          />
        ) : (
          <Pressable
            onPress={openName}
            accessibilityRole="button"
            accessibilityLabel={`${goal.name}. Rename`}
          >
            <Text
              style={[
                styles.name,
                { color: done || goal.status !== 'active' ? colors.textSecondary : colors.text },
                done && styles.nameDone,
              ]}
            >
              {goal.name}
            </Text>
          </Pressable>
        )}
        {subline && (
          <Text
            accessibilityLiveRegion={estimateDraft ? 'polite' : undefined}
            style={[styles.hint, { color: subline.color }]}
            numberOfLines={2}
          >
            {subline.text}
          </Text>
        )}
      </View>

      {showType && (
        <View ref={typeRef} collapsable={false}>
          <Pressable
            onPress={() => measureAnchor(typeRef.current, onOpenTypePicker)}
            accessibilityRole="button"
            accessibilityLabel={
              activityType ? `Activity type: ${activityType.name}. Change` : 'No activity type. Choose one'
            }
            style={[styles.typeBox, { borderColor: colors.text }]}
          >
            <TypeIcon type={activityType} size={24} />
          </Pressable>
        </View>
      )}

      <View style={styles.estimate}>
        {estimateText !== null ? (
          <TextInput
            value={estimateText}
            onChangeText={setEstimateText}
            onSubmitEditing={() => commitEstimate('stay')}
            onBlur={() => commitEstimate('discard')}
            onKeyPress={(event) => cancelOnEscape(event.nativeEvent.key, () => setEstimateText(null))}
            autoFocus
            selectTextOnFocus
            autoCapitalize="none"
            autoCorrect={false}
            submitBehavior="submit"
            accessibilityLabel="Estimate, for example 12h, 90m or a number of hours"
            style={[
              styles.estimateText,
              styles.estimateInput,
              {
                color: colors.text,
                borderBottomColor: estimateDraft?.kind === 'error' ? colors.error : colors.primary,
              },
            ]}
          />
        ) : (
          <Pressable
            onPress={openEstimate}
            accessibilityRole="button"
            accessibilityLabel={
              estimate.placeholder ? 'No estimate. Set one' : `Estimate ${estimate.text}. Change`
            }
          >
            <Text
              style={[
                styles.estimateText,
                { color: estimate.placeholder ? colors.textMuted : colors.text },
              ]}
            >
              {estimate.text}
            </Text>
          </Pressable>
        )}
      </View>

      <View ref={menuRef} collapsable={false}>
        <Pressable
          onPress={() => measureAnchor(menuRef.current, onOpenMenu)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`More for ${goal.name}: move, pause, archive, notes, delete`}
          style={styles.menuButton}
        >
          <Text style={[styles.menuGlyph, { color: colors.textSecondary }]}>⋯</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 6,
    paddingRight: 4,
    borderBottomWidth: 1,
  },
  dragging: {
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  handle: {
    width: 28,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleGlyph: {
    fontSize: 14,
    letterSpacing: -3,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkmark: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  name: {
    fontSize: 17,
    paddingVertical: 4,
  },
  nameInput: {
    borderBottomWidth: 2,
    paddingHorizontal: 0,
  },
  nameDone: {
    textDecorationLine: 'line-through',
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
  typeBox: {
    width: 38,
    height: 34,
    borderWidth: 1.5,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estimate: {
    width: 68,
    alignItems: 'flex-end',
  },
  estimateText: {
    fontSize: 16,
    textAlign: 'right',
    paddingVertical: 4,
  },
  estimateInput: {
    width: 60,
    borderBottomWidth: 2,
    paddingHorizontal: 0,
  },
  menuButton: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuGlyph: {
    fontSize: 20,
    fontWeight: '700',
  },
});
