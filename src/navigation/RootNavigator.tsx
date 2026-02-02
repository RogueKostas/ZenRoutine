import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { TabNavigator } from './TabNavigator';
import { DebugScreen } from '../screens';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
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
        name="Debug"
        component={DebugScreen}
        options={{
          title: 'Debug Panel',
          presentation: 'modal',
        }}
      />
      {/* Placeholder screens for future implementation */}
      {/*
      <Stack.Screen
        name="GoalDetail"
        component={GoalDetailScreen}
        options={({ route }) => ({
          title: 'Goal Details',
        })}
      />
      <Stack.Screen
        name="ActivityTypeEditor"
        component={ActivityTypeEditorScreen}
        options={({ route }) => ({
          title: route.params?.activityTypeId ? 'Edit Activity' : 'New Activity',
          presentation: 'modal',
        })}
      />
      <Stack.Screen
        name="BlockEditor"
        component={BlockEditorScreen}
        options={({ route }) => ({
          title: route.params?.blockId ? 'Edit Block' : 'New Block',
          presentation: 'modal',
        })}
      />
      */}
    </Stack.Navigator>
  );
}
