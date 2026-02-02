import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import { colors as lightColors, darkColors } from './colors';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ThemeColors = typeof lightColors;

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  initialMode?: ThemeMode;
}

export function ThemeProvider({ children, initialMode = 'system' }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  // Determine if we should use dark mode
  const isDark = useMemo(() => {
    if (mode === 'system') {
      return systemColorScheme === 'dark';
    }
    return mode === 'dark';
  }, [mode, systemColorScheme]);

  // Get the appropriate color palette
  const colors = useMemo(() => {
    return isDark ? darkColors : lightColors;
  }, [isDark]);

  // Toggle between light and dark (not system)
  const toggleTheme = useCallback(() => {
    setMode((current) => {
      if (current === 'system') {
        return systemColorScheme === 'dark' ? 'light' : 'dark';
      }
      return current === 'dark' ? 'light' : 'dark';
    });
  }, [systemColorScheme]);

  // Listen for system theme changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      // This will trigger a re-render if mode is 'system'
    });

    return () => subscription.remove();
  }, []);

  const value = useMemo(
    () => ({
      mode,
      isDark,
      colors,
      setMode,
      toggleTheme,
    }),
    [mode, isDark, colors, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Hook for just getting colors (most common use case)
export function useColors(): ThemeColors {
  const { colors } = useTheme();
  return colors;
}

// Hook for checking dark mode
export function useIsDark(): boolean {
  const { isDark } = useTheme();
  return isDark;
}
