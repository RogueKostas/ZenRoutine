import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme';
import {
  HomeScreen,
  RoutineScreen,
  GoalsScreen,
  AnalyticsScreen,
  SettingsScreen,
} from '../screens';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

interface TabIconProps {
  icon: string;
  label: string;
  focused: boolean;
  activeColor: string;
  inactiveColor: string;
}

function TabIcon({ icon, label, focused, activeColor, inactiveColor }: TabIconProps) {
  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabIcon, focused ? styles.tabIconFocused : undefined]}>{icon}</Text>
      <Text style={[
        styles.tabLabel,
        { color: focused ? activeColor : inactiveColor },
        focused ? styles.tabLabelFocused : undefined,
      ]}>{label}</Text>
    </View>
  );
}

export function TabNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 8,
          paddingBottom: 8,
          height: 70,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🏠" label="Home" focused={focused} activeColor={colors.primary} inactiveColor={colors.textMuted} />
          ),
        }}
      />
      <Tab.Screen
        name="Routine"
        component={RoutineScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="📅" label="Routine" focused={focused} activeColor={colors.primary} inactiveColor={colors.textMuted} />
          ),
        }}
      />
      <Tab.Screen
        name="Goals"
        component={GoalsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🎯" label="Goals" focused={focused} activeColor={colors.primary} inactiveColor={colors.textMuted} />
          ),
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="📊" label="Analytics" focused={focused} activeColor={colors.primary} inactiveColor={colors.textMuted} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="⚙️" label="Settings" focused={focused} activeColor={colors.primary} inactiveColor={colors.textMuted} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  tabIconFocused: {
    fontSize: 24,  // Slightly larger when focused (transforms on Text can cause iOS issues)
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  tabLabelFocused: {
    fontWeight: '600',
  },
});
