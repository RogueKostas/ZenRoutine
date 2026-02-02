import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { useCurrentTracking, useActivityTypes, useAppStore } from '../../store';

interface TrackingControlsProps {
  onStopped?: () => void;
  showNotes?: boolean;
}

export function TrackingControls({ onStopped, showNotes = true }: TrackingControlsProps) {
  const activeTracking = useCurrentTracking();
  const activityTypes = useActivityTypes();
  const { stopTracking, updateTrackingEntry } = useAppStore();

  const [showStopModal, setShowStopModal] = useState(false);
  const [notes, setNotes] = useState('');

  const handleStop = useCallback(() => {
    if (!activeTracking) return;

    if (showNotes) {
      setShowStopModal(true);
    } else {
      stopTracking(activeTracking.id);
      onStopped?.();
    }
  }, [activeTracking, showNotes, stopTracking, onStopped]);

  const handleConfirmStop = useCallback(() => {
    if (!activeTracking) return;

    if (notes.trim()) {
      updateTrackingEntry(activeTracking.id, { notes: notes.trim() });
    }

    stopTracking(activeTracking.id);
    setShowStopModal(false);
    setNotes('');
    onStopped?.();
  }, [activeTracking, notes, updateTrackingEntry, stopTracking, onStopped]);

  const handleDiscard = useCallback(() => {
    if (!activeTracking) return;

    Alert.alert(
      'Discard tracking?',
      'This will delete this tracking session. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            const { deleteTrackingEntry } = useAppStore.getState();
            deleteTrackingEntry(activeTracking.id);
            setShowStopModal(false);
            onStopped?.();
          },
        },
      ]
    );
  }, [activeTracking, onStopped]);

  if (!activeTracking) return null;

  const activity = activityTypes.find((a) => a.id === activeTracking.activityTypeId);

  return (
    <>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.stopButton}
          onPress={handleStop}
          activeOpacity={0.8}
        >
          <View style={styles.stopIcon} />
          <Text style={styles.stopText}>Stop Tracking</Text>
        </TouchableOpacity>
      </View>

      {/* Stop Confirmation Modal with Notes */}
      <Modal
        visible={showStopModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStopModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Stop Tracking</Text>
              <TouchableOpacity onPress={() => setShowStopModal(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.activityPreview}>
              <Text style={styles.activityIcon}>{activity?.icon || '📌'}</Text>
              <Text style={styles.activityName}>{activity?.name || 'Activity'}</Text>
            </View>

            <View style={styles.notesSection}>
              <Text style={styles.notesLabel}>Add notes (optional)</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="What did you accomplish?"
                placeholderTextColor={colors.textSecondary}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.discardButton}
                onPress={handleDiscard}
              >
                <Text style={styles.discardText}>Discard</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleConfirmStop}
              >
                <Text style={styles.saveText}>Save & Stop</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// Inline controls for compact display
export function TrackingControlsInline({ onStopped }: { onStopped?: () => void }) {
  const activeTracking = useCurrentTracking();
  const { stopTracking } = useAppStore();

  const handleStop = useCallback(() => {
    if (!activeTracking) return;
    stopTracking(activeTracking.id);
    onStopped?.();
  }, [activeTracking, stopTracking, onStopped]);

  if (!activeTracking) return null;

  return (
    <View style={styles.inlineContainer}>
      <TouchableOpacity
        style={styles.inlineStopButton}
        onPress={handleStop}
      >
        <View style={styles.inlineStopIcon} />
      </TouchableOpacity>
    </View>
  );
}

// Bottom sheet style controls
export function TrackingControlsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const activeTracking = useCurrentTracking();
  const activityTypes = useActivityTypes();
  const { stopTracking, deleteTrackingEntry } = useAppStore();
  const [notes, setNotes] = useState('');

  const handleSave = useCallback(() => {
    if (!activeTracking) return;
    stopTracking(activeTracking.id);
    setNotes('');
    onClose();
  }, [activeTracking, stopTracking, onClose]);

  const handleDiscard = useCallback(() => {
    if (!activeTracking) return;

    Alert.alert(
      'Discard?',
      'Delete this tracking session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            deleteTrackingEntry(activeTracking.id);
            setNotes('');
            onClose();
          },
        },
      ]
    );
  }, [activeTracking, deleteTrackingEntry, onClose]);

  if (!activeTracking) return null;

  const activity = activityTypes.find((a) => a.id === activeTracking.activityTypeId);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.sheetOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.sheetContent}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIcon, { backgroundColor: activity?.color + '20' }]}>
              <Text style={styles.sheetIconText}>{activity?.icon}</Text>
            </View>
            <View style={styles.sheetInfo}>
              <Text style={styles.sheetTitle}>{activity?.name}</Text>
              <Text style={styles.sheetSubtitle}>Currently tracking</Text>
            </View>
          </View>

          <TextInput
            style={styles.sheetNotes}
            placeholder="Add notes..."
            placeholderTextColor={colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.sheetDiscard} onPress={handleDiscard}>
              <Text style={styles.sheetDiscardText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetSave} onPress={handleSave}>
              <View style={styles.sheetSaveIcon} />
              <Text style={styles.sheetSaveText}>Stop & Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Main controls
  container: {
    padding: spacing.md,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  stopIcon: {
    width: 14,
    height: 14,
    backgroundColor: '#fff',
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  stopText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalClose: {
    fontSize: 28,
    color: colors.textSecondary,
    lineHeight: 28,
  },
  activityPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
  },
  activityIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  activityName: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text,
  },
  notesSection: {
    padding: spacing.lg,
  },
  notesLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  notesInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    minHeight: 80,
  },
  modalActions: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.md,
  },
  discardButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  discardText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 2,
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  // Inline controls
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inlineStopButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineStopIcon: {
    width: 12,
    height: 12,
    backgroundColor: '#fff',
    borderRadius: 2,
  },

  // Sheet controls
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl + 20, // Safe area
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sheetIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  sheetIconText: {
    fontSize: 28,
  },
  sheetInfo: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  sheetNotes: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    minHeight: 60,
    marginBottom: spacing.lg,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sheetDiscard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  sheetDiscardText: {
    fontSize: 16,
    color: colors.error,
  },
  sheetSave: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  sheetSaveIcon: {
    width: 12,
    height: 12,
    backgroundColor: '#fff',
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  sheetSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
