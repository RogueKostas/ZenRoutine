import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { minutesToTimeString, timeStringToMinutes } from '../../core/utils/time';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;

interface TimePickerProps {
  value: number; // minutes from midnight
  onChange: (minutes: number) => void;
  minuteInterval?: 5 | 10 | 15 | 30;
  minTime?: number;
  maxTime?: number;
  label?: string;
}

export function TimePicker({
  value,
  onChange,
  minuteInterval = 15,
  minTime = 0,
  maxTime = 1440,
  label,
}: TimePickerProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => setShowModal(true)}
      >
        <Text style={styles.timeText}>{minutesToTimeString(value)}</Text>
        <Text style={styles.chevron}>▼</Text>
      </TouchableOpacity>

      <TimePickerModal
        visible={showModal}
        value={value}
        onChange={onChange}
        onClose={() => setShowModal(false)}
        minuteInterval={minuteInterval}
        minTime={minTime}
        maxTime={maxTime}
      />
    </View>
  );
}

interface TimePickerModalProps {
  visible: boolean;
  value: number;
  onChange: (minutes: number) => void;
  onClose: () => void;
  minuteInterval?: 5 | 10 | 15 | 30;
  minTime?: number;
  maxTime?: number;
}

export function TimePickerModal({
  visible,
  value,
  onChange,
  onClose,
  minuteInterval = 15,
  minTime = 0,
  maxTime = 1440,
}: TimePickerModalProps) {
  const [selectedHour, setSelectedHour] = useState(Math.floor(value / 60));
  const [selectedMinute, setSelectedMinute] = useState(value % 60);

  const hourScrollRef = useRef<ScrollView>(null);
  const minuteScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      setSelectedHour(Math.floor(value / 60));
      setSelectedMinute(value % 60);

      // Scroll to initial positions
      setTimeout(() => {
        hourScrollRef.current?.scrollTo({
          y: Math.floor(value / 60) * ITEM_HEIGHT,
          animated: false,
        });
        minuteScrollRef.current?.scrollTo({
          y: (value % 60) / minuteInterval * ITEM_HEIGHT,
          animated: false,
        });
      }, 100);
    }
  }, [visible, value, minuteInterval]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 / minuteInterval }, (_, i) => i * minuteInterval);

  const handleConfirm = () => {
    const newValue = selectedHour * 60 + selectedMinute;
    const clampedValue = Math.max(minTime, Math.min(maxTime, newValue));
    onChange(clampedValue);
    onClose();
  };

  const handleHourScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    if (index >= 0 && index < 24) {
      setSelectedHour(index);
    }
  };

  const handleMinuteScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    if (index >= 0 && index < minutes.length) {
      setSelectedMinute(minutes[index]);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Select Time</Text>
          <TouchableOpacity onPress={handleConfirm}>
            <Text style={styles.confirmButton}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.pickerContainer}>
          <View style={styles.selectionIndicator} />

          {/* Hours */}
          <View style={styles.columnContainer}>
            <ScrollView
              ref={hourScrollRef}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              decelerationRate="fast"
              onMomentumScrollEnd={handleHourScroll}
              contentContainerStyle={styles.scrollContent}
            >
              {hours.map((hour) => (
                <TouchableOpacity
                  key={hour}
                  style={styles.pickerItem}
                  onPress={() => {
                    setSelectedHour(hour);
                    hourScrollRef.current?.scrollTo({
                      y: hour * ITEM_HEIGHT,
                      animated: true,
                    });
                  }}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      selectedHour === hour && styles.pickerItemTextSelected,
                    ]}
                  >
                    {hour.toString().padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <Text style={styles.colonSeparator}>:</Text>

          {/* Minutes */}
          <View style={styles.columnContainer}>
            <ScrollView
              ref={minuteScrollRef}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              decelerationRate="fast"
              onMomentumScrollEnd={handleMinuteScroll}
              contentContainerStyle={styles.scrollContent}
            >
              {minutes.map((minute) => (
                <TouchableOpacity
                  key={minute}
                  style={styles.pickerItem}
                  onPress={() => {
                    setSelectedMinute(minute);
                    minuteScrollRef.current?.scrollTo({
                      y: (minute / minuteInterval) * ITEM_HEIGHT,
                      animated: true,
                    });
                  }}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      selectedMinute === minute && styles.pickerItemTextSelected,
                    ]}
                  >
                    {minute.toString().padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        <View style={styles.previewContainer}>
          <Text style={styles.previewLabel}>Selected time</Text>
          <Text style={styles.previewTime}>
            {minutesToTimeString(selectedHour * 60 + selectedMinute)}
          </Text>
        </View>

        {/* Quick select buttons */}
        <View style={styles.quickSelectContainer}>
          <Text style={styles.quickSelectLabel}>Quick select</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[
              { label: '6:00', minutes: 360 },
              { label: '7:00', minutes: 420 },
              { label: '8:00', minutes: 480 },
              { label: '9:00', minutes: 540 },
              { label: '12:00', minutes: 720 },
              { label: '13:00', minutes: 780 },
              { label: '17:00', minutes: 1020 },
              { label: '18:00', minutes: 1080 },
              { label: '20:00', minutes: 1200 },
              { label: '21:00', minutes: 1260 },
              { label: '22:00', minutes: 1320 },
            ].map((preset) => (
              <TouchableOpacity
                key={preset.minutes}
                style={[
                  styles.quickSelectButton,
                  selectedHour * 60 + selectedMinute === preset.minutes &&
                    styles.quickSelectButtonActive,
                ]}
                onPress={() => {
                  const hour = Math.floor(preset.minutes / 60);
                  const minute = preset.minutes % 60;
                  setSelectedHour(hour);
                  setSelectedMinute(minute);
                  hourScrollRef.current?.scrollTo({
                    y: hour * ITEM_HEIGHT,
                    animated: true,
                  });
                  minuteScrollRef.current?.scrollTo({
                    y: (minute / minuteInterval) * ITEM_HEIGHT,
                    animated: true,
                  });
                }}
              >
                <Text
                  style={[
                    styles.quickSelectText,
                    selectedHour * 60 + selectedMinute === preset.minutes &&
                      styles.quickSelectTextActive,
                  ]}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

interface TimeRangePickerProps {
  startTime: number;
  endTime: number;
  onStartTimeChange: (minutes: number) => void;
  onEndTimeChange: (minutes: number) => void;
  minuteInterval?: 5 | 10 | 15 | 30;
}

export function TimeRangePicker({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  minuteInterval = 15,
}: TimeRangePickerProps) {
  const duration = endTime >= startTime
    ? endTime - startTime
    : (1440 - startTime) + endTime;

  return (
    <View style={styles.rangeContainer}>
      <View style={styles.rangeRow}>
        <View style={styles.rangeItem}>
          <Text style={styles.rangeLabel}>Start</Text>
          <TimePicker
            value={startTime}
            onChange={onStartTimeChange}
            minuteInterval={minuteInterval}
          />
        </View>
        <View style={styles.rangeSeparator}>
          <Text style={styles.rangeSeparatorText}>→</Text>
        </View>
        <View style={styles.rangeItem}>
          <Text style={styles.rangeLabel}>End</Text>
          <TimePicker
            value={endTime}
            onChange={onEndTimeChange}
            minuteInterval={minuteInterval}
          />
        </View>
      </View>
      <View style={styles.durationContainer}>
        <Text style={styles.durationLabel}>Duration:</Text>
        <Text style={styles.durationValue}>
          {Math.floor(duration / 60)}h {duration % 60}m
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  timeText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  chevron: {
    fontSize: 12,
    color: colors.textMuted,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cancelButton: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  confirmButton: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  pickerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    marginVertical: spacing.xl,
    position: 'relative',
  },
  selectionIndicator: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: '20%',
    right: '20%',
    height: ITEM_HEIGHT,
    backgroundColor: colors.primary + '15',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  columnContainer: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    width: 80,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingVertical: ITEM_HEIGHT * 2,
  },
  pickerItem: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerItemText: {
    fontSize: 24,
    color: colors.textMuted,
  },
  pickerItemTextSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  colonSeparator: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.text,
    marginHorizontal: spacing.sm,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  previewLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  previewTime: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.primary,
  },
  quickSelectContainer: {
    paddingHorizontal: spacing.lg,
  },
  quickSelectLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  quickSelectButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  quickSelectButtonActive: {
    backgroundColor: colors.primary,
  },
  quickSelectText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  quickSelectTextActive: {
    color: '#fff',
  },
  rangeContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  rangeItem: {
    flex: 1,
  },
  rangeLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  rangeSeparator: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  rangeSeparatorText: {
    fontSize: 20,
    color: colors.textMuted,
  },
  durationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  durationLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  durationValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
});
