import React from 'react';
import { View, StyleSheet } from 'react-native';
import { DebugPanel } from '../components/debug';
import type { RootStackScreenProps } from '../navigation/types';

export function DebugScreen({ navigation }: RootStackScreenProps<'Debug'>) {
  return (
    <View style={styles.container}>
      <DebugPanel />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
