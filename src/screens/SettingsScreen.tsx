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
import { colors } from '../theme/colors';
import { useAppStore, useActivityTypes } from '../store';
import type { TabScreenProps } from '../navigation/types';

interface SettingItemProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  type?: 'navigation' | 'toggle' | 'action';
  destructive?: boolean;
}

function SettingItem({
  title,
  subtitle,
  onPress,
  value,
  onValueChange,
  type = 'navigation',
  destructive = false,
}: SettingItemProps) {
  return (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      disabled={type === 'toggle'}
    >
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, destructive && styles.destructiveText]}>
          {title}
        </Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
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
        <Text style={styles.chevron}>›</Text>
      )}
    </TouchableOpacity>
  );
}

export function SettingsScreen({ navigation }: TabScreenProps<'Settings'>) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const activityTypes = useActivityTypes();
  const { resetState, _addSampleData } = useAppStore();

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Activity Types Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Types</Text>
          <View style={styles.card}>
            <SettingItem
              title="Manage Activity Types"
              subtitle={`${activityTypes.length} types configured`}
              onPress={() => {
                // TODO: Navigate to activity types manager
                Alert.alert('Coming Soon', 'Activity type management will be available in a future update.');
              }}
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.card}>
            <SettingItem
              title="Enable Notifications"
              subtitle="Get reminders for scheduled blocks"
              type="toggle"
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
            />
            <View style={styles.separator} />
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
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.card}>
            <SettingItem
              title="Dark Mode"
              subtitle="Use dark color scheme"
              type="toggle"
              value={darkMode}
              onValueChange={(value) => {
                setDarkMode(value);
                Alert.alert('Coming Soon', 'Dark mode will be available in a future update.');
              }}
            />
          </View>
        </View>

        {/* Data Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          <View style={styles.card}>
            <SettingItem
              title="Export Data"
              subtitle="Download your data as JSON"
              onPress={handleExportData}
            />
            <View style={styles.separator} />
            <SettingItem
              title="Import Data"
              subtitle="Restore from a backup file"
              onPress={handleImportData}
            />
            <View style={styles.separator} />
            <SettingItem
              title="Load Sample Data"
              subtitle="Add example goals and routines"
              onPress={handleLoadSampleData}
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <View style={styles.card}>
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
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <SettingItem
              title="Version"
              subtitle="1.0.0"
              type="action"
            />
            <View style={styles.separator} />
            <SettingItem
              title="Privacy Policy"
              onPress={() => Alert.alert('Privacy', 'Your data stays on your device.')}
            />
            <View style={styles.separator} />
            <SettingItem
              title="Open Source Licenses"
              onPress={() => Alert.alert('Licenses', 'License information will be added here.')}
            />
          </View>
        </View>

        {/* Debug Section (Development Only) */}
        {__DEV__ && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Developer</Text>
            <View style={styles.card}>
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
          <Text style={styles.footerText}>ZenRoutine</Text>
          <Text style={styles.footerSubtext}>Track your time, achieve your goals</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
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
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginHorizontal: 20,
  },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
  },
  settingSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  destructiveText: {
    color: colors.error,
  },
  chevron: {
    fontSize: 20,
    color: colors.textMuted,
    marginLeft: 8,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 16,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  footerSubtext: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
});
