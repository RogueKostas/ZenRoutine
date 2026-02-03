import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
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
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  type?: 'navigation' | 'toggle' | 'action' | 'select';
  destructive?: boolean;
  rightText?: string;
}

function SettingItem({
  title,
  subtitle,
  onPress,
  value,
  onValueChange,
  type = 'navigation',
  destructive = false,
  rightText,
}: SettingItemProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.settingItem, { borderBottomColor: colors.border }]}
      onPress={onPress}
      disabled={type === 'toggle'}
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
      {type === 'toggle' && onValueChange && (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      )}
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
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const { colors, mode, setMode, isDark } = useTheme();
  const activityTypes = useActivityTypes();
  const { resetState, _addSampleData } = useAppStore();

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
    Alert.alert('Export Data', 'Data export will be available in a future update.');
  };

  const handleImportData = () => {
    Alert.alert('Import Data', 'Data import will be available in a future update.');
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
          onPress: () => {
            resetState();
            Alert.alert('Success', 'All data has been reset.');
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
                // @ts-ignore - ActivityTypes screen exists in RootStack
                navigation.navigate('ActivityTypes');
              }}
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Notifications</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SettingItem
              title="Enable Notifications"
              subtitle="Get reminders for scheduled blocks"
              type="toggle"
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
            />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingItem
              title="Sound"
              subtitle="Play sound with notifications"
              type="toggle"
              value={soundEnabled}
              onValueChange={setSoundEnabled}
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
              subtitle="Download your data as JSON"
              onPress={handleExportData}
            />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingItem
              title="Import Data"
              subtitle="Restore from a backup file"
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
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <SettingItem
              title="Open Source Licenses"
              onPress={() => Alert.alert('Licenses', 'License information will be added here.')}
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
                  // @ts-ignore - Debug screen exists in RootStack
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
});
