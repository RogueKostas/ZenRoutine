import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { TabNavigator } from './TabNavigator';
import { DebugScreen, ActivityTypesScreen, CurrentActivityScreen, AccountScreen } from '../screens';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen
        name="Tabs"
        component={TabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ActivityTypes"
        component={ActivityTypesScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="CurrentActivity"
        component={CurrentActivityScreen}
        options={{ headerShown: false, title: 'Current Activity' }}
      />
      <Stack.Screen
        name="Account"
        component={AccountScreen}
        options={{ headerShown: false, presentation: 'modal', title: 'Account' }}
      />
      <Stack.Screen
        name="Debug"
        component={DebugScreen}
        options={{
          title: 'Debug Panel',
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
}
