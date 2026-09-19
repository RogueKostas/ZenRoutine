import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { RootNavigator } from './src/navigation';
import {
  getHydrationSnapshot,
  getQuarantinedTrackingEntries,
  getRecoveredActivityTypes,
  getRepairedTrackingEntries,
  initializeAppStore,
  resetAppStoreAfterHydrationError,
  subscribeHydration,
  useAppStore,
  useHasCompletedOnboarding,
} from './src/store';
import { ThemeProvider, useTheme, colors, darkColors } from './src/theme';
import { OnboardingScreen } from './src/screens';
import {
  DialogProvider,
  QuarantineNotice,
  RecoveredActivityNotice,
  RepairNotice,
  useDialog,
  isHydrationNoticeVisible,
  ShellMark,
  type QuarantineReport,
  type RecoveredActivityReport,
  type RepairReport,
} from './src/components/common';
import { cloudConfig } from './src/config/cloud';
import { startAccount } from './src/cloud/accountStore';
import { consumeAuthRedirect } from './src/cloud/authRedirect';

// Custom navigation themes
const LightNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.error,
  },
};

const DarkNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: darkColors.primary,
    background: darkColors.background,
    card: darkColors.surface,
    text: darkColors.text,
    border: darkColors.border,
    notification: darkColors.error,
  },
};

function AppContent() {
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const hasCompletedOnboarding = useHasCompletedOnboarding();
  const { isDark, colors: themeColors } = useTheme();
  const dialog = useDialog();
  const hydration = useSyncExternalStore(
    subscribeHydration,
    getHydrationSnapshot,
    getHydrationSnapshot
  );
  const quarantined = useSyncExternalStore(
    subscribeHydration,
    getQuarantinedTrackingEntries,
    getQuarantinedTrackingEntries
  );
  // Which quarantine report the user has already dismissed — not merely *that* they dismissed one.
  // A bare boolean would silence every later quarantine event for the life of this component, so a
  // forced rehydrate that sets different records aside would write the side-car and say nothing.
  const [dismissedQuarantineReport, setDismissedQuarantineReport] =
    useState<QuarantineReport | null>(null);
  const repaired = useSyncExternalStore(
    subscribeHydration,
    getRepairedTrackingEntries,
    getRepairedTrackingEntries
  );
  // Dismissed separately from the quarantine report: they are different events with different
  // consequences, and silencing "we set records aside" must not also silence "we changed an end
  // time in your history".
  const [dismissedRepairReport, setDismissedRepairReport] = useState<RepairReport | null>(null);
  const recovered = useSyncExternalStore(
    subscribeHydration,
    getRecoveredActivityTypes,
    getRecoveredActivityTypes
  );
  // Its own dismissal again: "we recreated a missing activity type" is a third, separate event.
  const [dismissedRecoveredReport, setDismissedRecoveredReport] =
    useState<RecoveredActivityReport | null>(null);

  useEffect(() => {
    void initializeAppStore();
  }, []);

  // Accounts (Iteration 2): follow the session, and explain a confirmation link opened here.
  const isReady = hydration.status !== 'idle' && hydration.status !== 'loading' && hydration.status !== 'error';
  useEffect(() => {
    if (!isReady || !cloudConfig.accountsEnabled) return;
    startAccount();
    const notice = consumeAuthRedirect();
    if (notice) void dialog.notify(notice);
  }, [isReady]);

  if (hydration.status === 'idle' || hydration.status === 'loading') {
    return (
      <View
        accessibilityLabel="Loading your ZenRoutine data"
        accessibilityRole="progressbar"
        style={[styles.statusContainer, { backgroundColor: themeColors.background }]}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingMark}>
          <ShellMark width={72} decorative />
        </View>
        <ActivityIndicator color={themeColors.primary} size="large" />
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.statusTitle, { color: themeColors.text }]}
        >
          Loading your routine…
        </Text>
      </View>
    );
  }

  if (hydration.status === 'error') {
    const confirmReset = async () => {
      const confirmed = await dialog.confirm({
        title: 'Reset local data?',
        message:
          'This removes ZenRoutine data stored on this device. Use this only if retrying does not work.',
        confirmLabel: 'Reset data',
        destructive: true,
      });
      if (!confirmed) return;
      void resetAppStoreAfterHydrationError().catch(() => {
        void dialog.notify({
          title: 'Reset failed',
          message: 'ZenRoutine could not reset local data.',
        });
      });
    };

    return (
      <View style={[styles.statusContainer, { backgroundColor: themeColors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="header"
          style={[styles.statusTitle, { color: themeColors.text }]}
        >
          We couldn’t load your local data
        </Text>
        <Text style={[styles.statusMessage, { color: themeColors.textSecondary }]}>
          Your existing data has not been replaced. Try loading it again.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void initializeAppStore({ force: true })}
          style={[styles.primaryButton, { backgroundColor: themeColors.primary }]}
        >
          <Text style={[styles.primaryButtonText, { color: themeColors.onPrimary }]}>Try again</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={confirmReset} style={styles.secondaryButton}>
          <Text style={[styles.secondaryButtonText, { color: themeColors.error }]}>Reset local data</Text>
        </Pressable>
      </View>
    );
  }

  // Show onboarding for first-time users
  if (!hasCompletedOnboarding) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <OnboardingScreen onComplete={completeOnboarding} />
      </View>
    );
  }

  // Hydration succeeded but left records behind. Say so rather than letting history go missing
  // quietly — the raw records are kept on device under QUARANTINE_STORAGE_KEY.
  const showQuarantineNotice = isHydrationNoticeVisible(quarantined, dismissedQuarantineReport);
  // Hydration succeeded but rewrote something. A legacy blob with two timers left running can only
  // keep one, so the others were ended at the last moment there was evidence for. That is a change
  // to data the user authored, and it is not allowed to be silent (issue #4); the originals are
  // kept alongside the quarantined records under QUARANTINE_STORAGE_KEY.
  const showRepairNotice = isHydrationNoticeVisible(repaired, dismissedRepairReport);
  // Hydration succeeded only because it put back an activity type that goals or routine blocks
  // still named (#34). The placeholder is visible in the Activity Types list, but a type the user
  // never made appearing there unannounced would be a silent change, so it is announced.
  const showRecoveredNotice = isHydrationNoticeVisible(recovered, dismissedRecoveredReport);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {showQuarantineNotice ? (
        <QuarantineNotice
          count={quarantined.length}
          colors={themeColors}
          onDismiss={() => setDismissedQuarantineReport(quarantined)}
        />
      ) : null}
      {showRepairNotice ? (
        <RepairNotice
          count={repaired.length}
          colors={themeColors}
          onDismiss={() => setDismissedRepairReport(repaired)}
        />
      ) : null}
      {showRecoveredNotice ? (
        <RecoveredActivityNotice
          report={recovered}
          colors={themeColors}
          onDismiss={() => setDismissedRecoveredReport(recovered)}
        />
      ) : null}
      <NavigationContainer theme={isDark ? DarkNavigationTheme : LightNavigationTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <RootNavigator />
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ThemeProvider initialMode="system">
          <DialogProvider>
            <AppContent />
          </DialogProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingMark: {
    marginBottom: 24,
  },
  container: {
    flex: 1,
  },
  statusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  statusMessage: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 420,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
