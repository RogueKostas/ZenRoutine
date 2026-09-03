import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Share,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAppStore, useActivityTypes } from '../store';
import type { TabScreenProps } from '../navigation/types';
import type { ThemeMode } from '../theme';

interface SettingItemProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  type?: 'navigation' | 'action' | 'select';
  destructive?: boolean;
  rightText?: string;
}

function SettingItem({
  title,
  subtitle,
  onPress,
  type = 'navigation',
  destructive = false,
  rightText,
}: SettingItemProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.settingItem, { borderBottomColor: colors.border }]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
    >
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: destructive ? colors.error : colors.text }]}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {type === 'navigation' && (
        <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
      )}
      {type === 'select' && rightText && (
        <View style={styles.selectRight}>
          <Text style={[styles.selectText, { color: colors.textSecondary }]}>{rightText}</Text>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export function SettingsScreen({ navigation }: TabScreenProps<'Settings'>) {
  const [backupMode, setBackupMode] = useState<'export' | 'import' | null>(null);
  const [backupText, setBackupText] = useState('');
  const [backupError, setBackupError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const { colors, mode, setMode, isDark } = useTheme();
  const activityTypes = useActivityTypes();
  const { resetState, exportData, importData, _addSampleData } = useAppStore();

  const handleThemeChange = () => {
    Alert.alert(
      'Theme',
      'Choose your preferred theme',
      THEME_OPTIONS.map((option) => ({
        text: option.label + (mode === option.value ? ' ✓' : ''),
        onPress: () => setMode(option.value),
      }))
    );
  };

  const getThemeLabel = () => {
    return THEME_OPTIONS.find((o) => o.value === mode)?.label || 'System';
  };

  const handleExportData = () => {
    setBackupText(exportData());
    setBackupError(null);
    setBackupMode('export');
  };

  const handleImportData = () => {
    setBackupText('');
    setBackupError(null);
    setBackupMode('import');
  };

  const closeBackup = () => {
    if (isImporting) return;
    setBackupMode(null);
    setBackupText('');
    setBackupError(null);
  };

  const handleShareBackup = async () => {
    try {
      await Share.share({
        title: 'ZenRoutine backup',
        message: backupText,
      });
    } catch {
      setBackupError('Sharing is unavailable here. Select and copy the backup text instead.');
    }
  };

  const handleConfirmImport = async () => {
    if (!backupText.trim()) {
      setBackupError('Paste a ZenRoutine backup before importing.');
      return;
    }
    setIsImporting(true);
    setBackupError(null);
    const result = await importData(backupText);
    setIsImporting(false);
    if (!result.ok) {
      setBackupError(result.error);
      return;
    }
    setBackupMode(null);
    setBackupText('');
    setBackupError(null);
    Alert.alert('Import complete', 'Your ZenRoutine backup has been restored.');
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Data',
      'This will permanently delete all your goals, routines, and tracking history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetState();
              Alert.alert('Success', 'All data has been reset.');
            } catch {
              Alert.alert(
                'Reset failed',
                'Your existing data was left unchanged. Please try again.'
              );
            }
          },
        },
      ]
    );
  };

  const handleLoadSampleData = () => {
    Alert.alert(
      'Load Sample Data',
      'This will add sample goals, routines, and tracking entries to help you explore the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load',
          onPress: () => {
            _addSampleData();
            Alert.alert('Success', 'Sample data has been loaded.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Activity Types Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Activity Types</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SettingItem
              title="Manage Activity Types"
              subtitle={`${activityTypes.length} types configured`}
              onPress={() => {
                navigation.navigate('ActivityTypes');
              }}
            />
          </View>
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Appearance</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SettingItem
              title="Theme"
              subtitle={isDark ? 'Currently using dark mode' : 'Currently using light mode'}
              type="select"
              rightText={getThemeLabel()}
              onPress={handleThemeChange}
            />
          </View>
        </View>

        {/* Data Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Data</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SettingItem
              title="Export Data"
              subtitle="Share or copy a portable JSON backup"
              onPress={handleExportData}
            />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingItem
              title="Import Data"
              subtitle="Paste and validate a ZenRoutine backup"
              onPress={handleImportData}
            />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingItem
              title="Load Sample Data"
              subtitle="Add example goals and routines"
              onPress={handleLoadSampleData}
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Danger Zone</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SettingItem
              title="Reset All Data"
              subtitle="Delete all goals, routines, and history"
              onPress={handleResetData}
              destructive
            />
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>About</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SettingItem
              title="Version"
              subtitle="1.0.0"
              type="action"
            />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingItem
              title="Privacy Policy"
              onPress={() => Alert.alert('Privacy', 'Your data stays on your device.')}
            />
          </View>
        </View>

        {/* Debug Section (Development Only) */}
        {__DEV__ && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Developer</Text>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SettingItem
                title="Debug Panel"
                subtitle="Access development tools"
                onPress={() => {
                  navigation.navigate('Debug');
                }}
              />
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>ZenRoutine</Text>
          <Text style={[styles.footerSubtext, { color: colors.textMuted }]}>
            Track your time, achieve your goals
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={backupMode !== null}
        transparent
        animationType="fade"
        onRequestClose={closeBackup}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
            accessibilityViewIsModal
          >
            <Text accessibilityRole="header" style={[styles.modalTitle, { color: colors.text }]}>
              {backupMode === 'export' ? 'Export backup' : 'Import backup'}
            </Text>
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              {backupMode === 'export'
                ? 'Keep this JSON somewhere private. It contains your routines, goals, and tracking history.'
                : 'Paste a complete ZenRoutine JSON backup. It will be checked before your current data is replaced.'}
            </Text>
            <TextInput
              autoFocus={backupMode === 'import'}
              accessibilityLabel={backupMode === 'export' ? 'ZenRoutine backup JSON' : 'Paste backup JSON'}
              multiline
              selectTextOnFocus={backupMode === 'export'}
              editable={backupMode === 'import'}
              value={backupText}
              onChangeText={setBackupText}
              placeholder={backupMode === 'import' ? 'Paste backup JSON here' : undefined}
              placeholderTextColor={colors.textMuted}
              style={[
                styles.backupInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
            />
            {backupError && (
              <Text
                accessibilityLiveRegion="assertive"
                style={[styles.backupError, { color: colors.error }]}
              >
                {backupError}
              </Text>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Cancel backup"
                style={[styles.modalButton, { borderColor: colors.border }]}
                onPress={closeBackup}
                disabled={isImporting}
              >
                <Text style={[styles.modalButtonText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={backupMode === 'export' ? 'Share backup' : 'Import backup'}
                accessibilityState={{ busy: isImporting, disabled: isImporting }}
                style={[styles.modalButton, styles.primaryModalButton, { backgroundColor: colors.primary }]}
                onPress={backupMode === 'export' ? handleShareBackup : handleConfirmImport}
                disabled={isImporting}
              >
                {isImporting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.modalButtonText, styles.primaryModalButtonText]}>
                    {backupMode === 'export' ? 'Share' : 'Import'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginHorizontal: 20,
  },
  card: {
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
  },
  settingSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    marginLeft: 8,
  },
  selectRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectText: {
    fontSize: 15,
  },
  separator: {
    height: 1,
    marginLeft: 16,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footerSubtext: {
    fontSize: 13,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '85%',
    alignSelf: 'center',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  backupInput: {
    minHeight: 180,
    maxHeight: 360,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  backupError: {
    marginTop: 10,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    minWidth: 96,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryModalButton: {
    borderWidth: 0,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryModalButtonText: {
    color: '#fff',
  },
});
