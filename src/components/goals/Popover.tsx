import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useTheme } from '../../theme';
import { popoverPosition, type Rect, type Size } from './popoverPosition';

/** Measure a control on screen, to anchor a popover to it. */
export function measureAnchor(view: View | null, onMeasured: (anchor: Rect) => void): void {
  view?.measureInWindow((x, y, width, height) => onMeasured({ x, y, width, height }));
}

interface PopoverProps {
  /** The control it opened from; `null` hides the popover. */
  anchor: Rect | null;
  onClose: () => void;
  width: number;
  align?: 'left' | 'right';
  accessibilityLabel: string;
  children: React.ReactNode;
}

/**
 * A small box next to the control that opened it (#45: "little pop-ups", not a whole page).
 * Tapping outside or pressing Escape closes it. A transparent Modal so it is never clipped by
 * the scrolling list it opened from.
 */
export function Popover({ anchor, onClose, width, align = 'right', accessibilityLabel, children }: PopoverProps) {
  const { colors } = useTheme();
  const window = useWindowDimensions();
  const [size, setSize] = useState<Size>({ width, height: 0 });
  if (!anchor) return null;

  const position = popoverPosition(anchor, { width, height: size.height }, window, align);
  const onLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (Math.abs(height - size.height) > 1) setSize({ width, height });
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        onLayout={onLayout}
        style={[
          styles.box,
          {
            left: position.left,
            top: position.top,
            width,
            maxHeight: position.maxHeight,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            // Invisible until measured, so it never flashes in the wrong place.
            opacity: size.height > 0 ? 1 : 0,
          },
        ]}
      >
        <ScrollView bounces={false}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

interface PopoverItemProps {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  /** Shown for screen readers when the row is only an icon (the filter list, p62). */
  accessibilityLabel?: string;
  selected?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  hideLabel?: boolean;
}

export function PopoverItem({
  label,
  onPress,
  icon,
  accessibilityLabel,
  selected = false,
  disabled = false,
  destructive = false,
  hideLabel = false,
}: PopoverItemProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="menuitem"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.item,
        hideLabel && styles.itemIconOnly,
        (pressed || selected) && { backgroundColor: colors.backgroundSecondary },
        disabled && styles.itemDisabled,
      ]}
    >
      {icon}
      {!hideLabel && (
        <Text
          numberOfLines={1}
          style={[
            styles.itemLabel,
            { color: destructive ? colors.error : colors.text },
            selected && styles.itemLabelSelected,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  itemIconOnly: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  itemDisabled: {
    opacity: 0.4,
  },
  itemLabel: {
    flexShrink: 1,
    fontSize: 15,
  },
  itemLabelSelected: {
    fontWeight: '600',
  },
  box: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
});
