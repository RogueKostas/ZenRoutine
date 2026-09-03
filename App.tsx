import React, { useEffect, useSyncExternalStore } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { RootNavigator } from './src/navigation';
import {
  getHydrationSnapshot,
  initializeAppStore,
  resetAppStoreAfterHydrationError,
  subscribeHydration,
  useAppStore,
  useHasCompletedOnboarding,
} from './src/store';
import { ThemeProvider, useTheme, colors, darkColors } from './src/theme';
import { OnboardingScreen } from './src/screens';

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
  const hydration = useSyncExternalStore(
    subscribeHydration,
    getHydrationSnapshot,
    getHydrationSnapshot
  );

  useEffect(() => {
    void initializeAppStore();
  }, []);

  if (hydration.status === 'idle' || hydration.status === 'loading') {
    return (
      <View
        accessibilityLabel="Loading your ZenRoutine data"
        accessibilityRole="progressbar"
        style={[styles.statusContainer, { backgroundColor: themeColors.background }]}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
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
    const confirmReset = () => {
      Alert.alert(
        'Reset local data?',
        'This removes ZenRoutine data stored on this device. Use this only if retrying does not work.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset data',
            style: 'destructive',
            onPress: () => {
              void resetAppStoreAfterHydrationError().catch(() => {
                Alert.alert('Reset failed', 'ZenRoutine could not reset local data.');
              });
            },
          },
        ]
      );
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
          <Text style={styles.primaryButtonText}>Try again</Text>
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

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
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
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
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
    color: '#FFFFFF',
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
