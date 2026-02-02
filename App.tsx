import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { RootNavigator } from './src/navigation';
import { useAppStore } from './src/store';
import { ThemeProvider, useTheme, colors, darkColors } from './src/theme';

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
  const initializeDefaults = useAppStore((state) => state.initializeDefaults);
  const { isDark, colors: themeColors } = useTheme();

  useEffect(() => {
    initializeDefaults();
  }, [initializeDefaults]);

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
});
