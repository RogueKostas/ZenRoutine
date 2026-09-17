import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { minutesToTimeString, parseTimeOfDay } from '../../core/utils/time';
import {
  blockDurationLabel,
  nearestTimeOptionIndex,
  timeOptions,
  TIME_OPTION_STEP,
  type TimeDraftState,
} from './timeFields';

const OPTION_HEIGHT = 36;
const VISIBLE_OPTIONS = 5;

interface TimeFieldProps {
  label: string;
  value: number; // minutes from midnight
  onChange: (minutes: number) => void;
  onDraftChange: (draft: TimeDraftState) => void;
  options: readonly number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * A compact, directly editable time: type any time ("7.15am", "19:30") or pick one from the
 * dropdown below it. The dropdown opens in place, never as a separate screen.
 */
function TimeField({
  label,
  value,
  onChange,
  onDraftChange,
  options,
  open,
  onOpenChange,
}: TimeFieldProps) {
  const [draft, setDraft] = useState(() => minutesToTimeString(value));
  const focused = useRef(false);
  const listRef = useRef<ScrollView>(null);

  // A value set from outside (dropdown, editor reset) replaces the text unless the user is typing.
  useEffect(() => {
    if (!focused.current) setDraft(minutesToTimeString(value));
  }, [value]);

  const handleChangeText = (text: string) => {
    setDraft(text);
    const parsed = parseTimeOfDay(text);
    if ('minutes' in parsed) {
      onDraftChange({ revealed: false });
      if (parsed.minutes !== value) onChange(parsed.minutes);
    } else {
      onDraftChange({ error: parsed.error, revealed: false });
    }
  };

  const handleBlur = () => {
    focused.current = false;
    const parsed = parseTimeOfDay(draft);
    if ('minutes' in parsed) {
      setDraft(minutesToTimeString(parsed.minutes));
      onDraftChange({ revealed: true });
    } else {
      onDraftChange({ error: parsed.error, revealed: true });
    }
  };

  const handlePick = (minutes: number) => {
    setDraft(minutesToTimeString(minutes));
    onDraftChange({ revealed: false });
    onChange(minutes);
    onOpenChange(false);
  };

  const selectedIndex = nearestTimeOptionIndex(options, value);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={handleChangeText}
          onFocus={() => {
            focused.current = true;
            onOpenChange(false);
          }}
          onBlur={handleBlur}
          onSubmitEditing={handleBlur}
          accessibilityLabel={`${label} time`}
          placeholder="7:15am"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          maxLength={10}
          selectTextOnFocus
        />
        <TouchableOpacity
          style={[styles.toggle, open && styles.toggleOpen]}
          onPress={() => onOpenChange(!open)}
          accessibilityRole="button"
          accessibilityLabel={`Choose ${label.toLowerCase()} time`}
          accessibilityState={{ expanded: open }}
        >
          <Text style={styles.toggleText}>{open ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      </View>
      {open && (
        <ScrollView
          ref={listRef}
          style={styles.list}
          nestedScrollEnabled
          onLayout={() =>
            listRef.current?.scrollTo({
              y: Math.max(0, (selectedIndex - 2) * OPTION_HEIGHT),
              animated: false,
            })
          }
        >
          {options.map((minutes, index) => {
            const selected = index === selectedIndex && minutes === value;
            return (
              <TouchableOpacity
                key={minutes}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => handlePick(minutes)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {minutesToTimeString(minutes)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

interface TimeRangePickerProps {
  startTime: number;
  endTime: number;
  onStartTimeChange: (minutes: number) => void;
  onEndTimeChange: (minutes: number) => void;
  onStartDraftChange: (draft: TimeDraftState) => void;
  onEndDraftChange: (draft: TimeDraftState) => void;
  minuteInterval?: number;
}

/** Start and end as two inline time fields, with the duration beside them. */
export function TimeRangePicker({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  onStartDraftChange,
  onEndDraftChange,
  minuteInterval = TIME_OPTION_STEP,
}: TimeRangePickerProps) {
  const options = useMemo(() => timeOptions(minuteInterval), [minuteInterval]);
  const [openField, setOpenField] = useState<'start' | 'end' | null>(null);

  const openChange = (field: 'start' | 'end') => (open: boolean) =>
    setOpenField((current) => (open ? field : current === field ? null : current));

  return (
    <View style={styles.rangeContainer}>
      <View style={styles.rangeRow}>
        <TimeField
          label="Start"
          value={startTime}
          onChange={onStartTimeChange}
          onDraftChange={onStartDraftChange}
          options={options}
          open={openField === 'start'}
          onOpenChange={openChange('start')}
        />
        <Text style={styles.rangeSeparator}>→</Text>
        <TimeField
          label="End"
          value={endTime}
          onChange={onEndTimeChange}
          onDraftChange={onEndDraftChange}
          options={options}
          open={openField === 'end'}
          onOpenChange={openChange('end')}
        />
        <View style={styles.duration}>
          <Text style={styles.fieldLabel}>Duration</Text>
          <Text style={styles.durationValue}>{blockDurationLabel(startTime, endTime)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rangeContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    columnGap: spacing.sm,
    rowGap: spacing.md,
  },
  field: {
    width: 104,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  toggle: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  toggleOpen: {
    backgroundColor: colors.primary + '15',
  },
  toggleText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  list: {
    maxHeight: OPTION_HEIGHT * VISIBLE_OPTIONS,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
  },
  option: {
    height: OPTION_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  optionSelected: {
    backgroundColor: colors.primary + '15',
  },
  optionText: {
    fontSize: 15,
    color: colors.text,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  rangeSeparator: {
    fontSize: 18,
    color: colors.textMuted,
    // Line up with the inputs, below their labels.
    marginTop: 26,
  },
  duration: {
    minWidth: 72,
    marginLeft: spacing.xs,
  },
  durationValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    lineHeight: 40,
  },
});
