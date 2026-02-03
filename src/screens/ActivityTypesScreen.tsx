import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';
import { useActivityTypes, useAppStore } from '../store';
import type { ActivityType } from '../core/types';

// Predefined color palette for activity types
const COLOR_PALETTE = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1',
  '#3949AB', '#1E88E5', '#039BE5', '#00ACC1',
  '#00897B', '#43A047', '#7CB342', '#C0CA33',
  '#FDD835', '#FFB300', '#FB8C00', '#F4511E',
  '#6D4C41', '#757575', '#546E7A', '#78909C',
];

// Common emoji icons for activities
const EMOJI_ICONS = [
  '💼', '🚀', '❤️', '💪', '📚', '📺', '👥', '🚗',
  '🍴', '💧', '🌙', '🎯', '✨', '🎨', '🎵', '💻',
  '📱', '🏃', '🧘', '🏠', '💰', '🛒', '✈️', '🎮',
  '📝', '☕', '🍳', '🧹', '👶', '🐕', '🌱', '⚡',
];

interface EditingActivityType {
  id?: string;
  name: string;
  color: string;
  icon: string;
}

export function ActivityTypesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const activityTypes = useActivityTypes();
  const { addActivityType, updateActivityType, deleteActivityType } = useAppStore();

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<EditingActivityType | null>(null);

  const handleAddNew = () => {
    setEditingActivity({
      name: '',
      color: COLOR_PALETTE[activityTypes.length % COLOR_PALETTE.length],
      icon: '📌',
    });
    setShowEditModal(true);
  };

  const handleEdit = (activity: ActivityType) => {
    setEditingActivity({
      id: activity.id,
      name: activity.name,
      color: activity.color,
      icon: activity.icon,
    });
    setShowEditModal(true);
  };

  const handleSave = () => {
    if (!editingActivity || !editingActivity.name.trim()) {
      Alert.alert('Error', 'Please enter a name for the activity type.');
      return;
    }

    if (editingActivity.id) {
      // Update existing
      updateActivityType(editingActivity.id, {
        name: editingActivity.name.trim(),
        color: editingActivity.color,
        icon: editingActivity.icon,
      });
    } else {
      // Create new
      addActivityType({
        name: editingActivity.name.trim(),
        color: editingActivity.color,
        icon: editingActivity.icon,
        isDefault: false,
        sortOrder: activityTypes.length,
      });
    }

    setShowEditModal(false);
    setEditingActivity(null);
  };

  const handleDelete = (activity: ActivityType) => {
    Alert.alert(
      'Delete Activity Type',
      `Are you sure you want to delete "${activity.name}"? This cannot be undone.\n\nNote: If this activity type is used by any goals, routines, or tracking entries, it cannot be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try {
              deleteActivityType(activity.id);
            } catch (error: any) {
              Alert.alert('Cannot Delete', error.message || 'This activity type is in use.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backButton, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Activity Types</Text>
        <TouchableOpacity onPress={handleAddNew}>
          <Text style={[styles.addButton, { color: colors.primary }]}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
          Customize activity types to categorize your time blocks and goals.
        </Text>

        {activityTypes.map((activity, index) => (
          <TouchableOpacity
            key={activity.id}
            style={[styles.activityItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => handleEdit(activity)}
          >
            <View style={[styles.iconContainer, { backgroundColor: activity.color + '20' }]}>
              <Text style={styles.activityIcon}>{activity.icon}</Text>
            </View>
            <View style={styles.activityInfo}>
              <Text style={[styles.activityName, { color: colors.text }]}>{activity.name}</Text>
              <View style={styles.activityMeta}>
                <View style={[styles.colorDot, { backgroundColor: activity.color }]} />
                {activity.isDefault && (
                  <Text style={[styles.defaultBadge, { color: colors.textMuted }]}>Default</Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(activity)}
            >
              <Text style={[styles.deleteText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <Text style={[styles.modalCancel, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingActivity?.id ? 'Edit Activity Type' : 'New Activity Type'}
            </Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={[styles.modalSave, { color: colors.primary }]}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Preview */}
            {editingActivity && (
              <View style={styles.previewContainer}>
                <View style={[styles.previewIconContainer, { backgroundColor: editingActivity.color + '20' }]}>
                  <Text style={styles.previewIcon}>{editingActivity.icon}</Text>
                </View>
                <Text style={[styles.previewName, { color: colors.text }]}>
                  {editingActivity.name || 'Activity Name'}
                </Text>
              </View>
            )}

            {/* Name Input */}
            <Text style={[styles.inputLabel, { color: colors.text }]}>Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="e.g., Reading, Meditation"
              value={editingActivity?.name || ''}
              onChangeText={(text) => setEditingActivity((prev) => prev ? { ...prev, name: text } : null)}
              placeholderTextColor={colors.textMuted}
            />

            {/* Icon Selector */}
            <Text style={[styles.inputLabel, { color: colors.text }]}>Icon</Text>
            <View style={styles.iconGrid}>
              {EMOJI_ICONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.iconOption,
                    { backgroundColor: colors.backgroundSecondary },
                    editingActivity?.icon === emoji && { backgroundColor: colors.primary + '20', borderColor: colors.primary, borderWidth: 2 },
                  ]}
                  onPress={() => setEditingActivity((prev) => prev ? { ...prev, icon: emoji } : null)}
                >
                  <Text style={styles.iconOptionText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Color Selector */}
            <Text style={[styles.inputLabel, { color: colors.text }]}>Color</Text>
            <View style={styles.colorGrid}>
              {COLOR_PALETTE.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    editingActivity?.color === color && { borderWidth: 3, borderColor: colors.text },
                  ]}
                  onPress={() => setEditingActivity((prev) => prev ? { ...prev, color } : null)}
                />
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  addButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  sectionHint: {
    fontSize: 14,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  activityIcon: {
    fontSize: 22,
  },
  activityInfo: {
    flex: 1,
  },
  activityName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  activityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.xs,
  },
  defaultBadge: {
    fontSize: 11,
  },
  deleteButton: {
    padding: spacing.sm,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalCancel: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalSave: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    padding: spacing.lg,
  },
  previewContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  previewIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  previewIcon: {
    fontSize: 36,
  },
  previewName: {
    fontSize: 20,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconOptionText: {
    fontSize: 22,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
});
