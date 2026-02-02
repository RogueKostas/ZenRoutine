import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { useActivityTypes } from '../../store';
import { ColorDot } from '../common/Badge';
import type { ActivityType } from '../../core/types';

interface ActivityPickerProps {
  selectedId: string | null;
  onSelect: (activityType: ActivityType) => void;
  layout?: 'grid' | 'list' | 'horizontal';
  showLabels?: boolean;
}

export function ActivityPicker({
  selectedId,
  onSelect,
  layout = 'grid',
  showLabels = true,
}: ActivityPickerProps) {
  const activityTypes = useActivityTypes();

  if (layout === 'horizontal') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalContainer}
      >
        {activityTypes.map((at) => (
          <TouchableOpacity
            key={at.id}
            style={[
              styles.horizontalItem,
              selectedId === at.id && styles.selectedItem,
            ]}
            onPress={() => onSelect(at)}
          >
            <ColorDot color={at.color} size={showLabels ? 20 : 32} />
            {showLabels && (
              <Text
                style={[
                  styles.horizontalLabel,
                  selectedId === at.id && styles.selectedLabel,
                ]}
                numberOfLines={1}
              >
                {at.name}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  if (layout === 'list') {
    return (
      <View style={styles.listContainer}>
        {activityTypes.map((at) => (
          <TouchableOpacity
            key={at.id}
            style={[
              styles.listItem,
              selectedId === at.id && styles.selectedListItem,
            ]}
            onPress={() => onSelect(at)}
          >
            <ColorDot color={at.color} size={12} style={styles.listDot} />
            <Text
              style={[
                styles.listLabel,
                selectedId === at.id && styles.selectedLabel,
              ]}
            >
              {at.name}
            </Text>
            {selectedId === at.id && (
              <Text style={styles.checkmark}>✓</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  // Grid layout
  return (
    <View style={styles.gridContainer}>
      {activityTypes.map((at) => (
        <TouchableOpacity
          key={at.id}
          style={[
            styles.gridItem,
            selectedId === at.id && styles.selectedItem,
          ]}
          onPress={() => onSelect(at)}
        >
          <ColorDot color={at.color} size={16} />
          {showLabels && (
            <Text
              style={[
                styles.gridLabel,
                selectedId === at.id && styles.selectedLabel,
              ]}
              numberOfLines={1}
            >
              {at.name}
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

interface ActivityPickerModalProps {
  visible: boolean;
  selectedId: string | null;
  onSelect: (activityType: ActivityType) => void;
  onClose: () => void;
  title?: string;
}

export function ActivityPickerModal({
  visible,
  selectedId,
  onSelect,
  onClose,
  title = 'Select Activity',
}: ActivityPickerModalProps) {
  const activityTypes = useActivityTypes();

  const handleSelect = (at: ActivityType) => {
    onSelect(at);
    onClose();
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
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{title}</Text>
          <View style={styles.modalPlaceholder} />
        </View>
        <ScrollView style={styles.modalContent}>
          {activityTypes.map((at) => (
            <TouchableOpacity
              key={at.id}
              style={[
                styles.modalItem,
                selectedId === at.id && styles.modalItemSelected,
              ]}
              onPress={() => handleSelect(at)}
            >
              <View style={[styles.modalColorBadge, { backgroundColor: at.color }]} />
              <View style={styles.modalItemContent}>
                <Text style={styles.modalItemName}>{at.name}</Text>
                {at.icon && <Text style={styles.modalItemIcon}>{at.icon}</Text>}
              </View>
              {selectedId === at.id && (
                <Text style={styles.modalCheckmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

interface ActivityBadgeProps {
  activityType: ActivityType;
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
  onPress?: () => void;
}

export function ActivityBadge({
  activityType,
  size = 'medium',
  showIcon = false,
  onPress,
}: ActivityBadgeProps) {
  const content = (
    <View style={[styles.badge, styles[`badge_${size}`]]}>
      <ColorDot
        color={activityType.color}
        size={size === 'small' ? 8 : size === 'medium' ? 10 : 12}
        style={styles.badgeDot}
      />
      <Text style={[styles.badgeText, styles[`badgeText_${size}`]]}>
        {activityType.name}
      </Text>
      {showIcon && activityType.icon && (
        <Text style={styles.badgeIcon}>{activityType.icon}</Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  // Horizontal layout
  horizontalContainer: {
    paddingHorizontal: spacing.sm,
  },
  horizontalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  horizontalLabel: {
    fontSize: 14,
    color: colors.text,
    marginLeft: spacing.xs,
    maxWidth: 100,
  },

  // Grid layout
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gridLabel: {
    fontSize: 14,
    color: colors.text,
    marginLeft: spacing.xs,
  },

  // List layout
  listContainer: {},
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  selectedListItem: {
    backgroundColor: colors.primary + '10',
  },
  listDot: {
    marginRight: spacing.md,
  },
  listLabel: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  checkmark: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '600',
  },

  // Shared
  selectedItem: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  selectedLabel: {
    fontWeight: '600',
  },

  // Modal
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
  modalCancel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalPlaceholder: {
    width: 50,
  },
  modalContent: {
    flex: 1,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalItemSelected: {
    backgroundColor: colors.primary + '10',
  },
  modalColorBadge: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    marginRight: spacing.md,
  },
  modalItemContent: {
    flex: 1,
  },
  modalItemName: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  modalItemIcon: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalCheckmark: {
    fontSize: 20,
    color: colors.primary,
    fontWeight: '600',
  },

  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.full,
  },
  badge_small: {
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  badge_medium: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  badge_large: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  badgeDot: {
    marginRight: spacing.xs,
  },
  badgeText: {
    color: colors.text,
  },
  badgeText_small: {
    fontSize: 11,
  },
  badgeText_medium: {
    fontSize: 13,
  },
  badgeText_large: {
    fontSize: 15,
  },
  badgeIcon: {
    marginLeft: spacing.xs,
  },
});
