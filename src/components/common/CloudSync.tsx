import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { useDialog } from './Dialog';
import { cloudConfig } from '../../config/cloud';
import { getCloudClient } from '../../cloud/client';
import { useAccountStore } from '../../cloud/accountStore';
import { startSync, stopSync } from '../../cloud/syncRuntime';
import { useSyncStore } from '../../cloud/syncEngine';

/** How long a catch-up may hold the screen before the app carries on (offline or slow network). */
export const CATCH_UP_HOLD_MS = 3000;
/** Quick catch-ups finish before this, so the overlay never flashes. */
const OVERLAY_DELAY_MS = 300;

/**
 * Runs sync while you're signed in, and holds the screen briefly while the app catches up with
 * your account, so you edit the latest version rather than creating a conflict. Renders nothing
 * otherwise.
 */
export function CloudSync() {
  const account = useAccountStore();
  const dialog = useDialog();
  const catchingUp = useSyncStore((s) => s.catchingUp);
  const { colors } = useTheme();
  const [holding, setHolding] = useState(false);

  useEffect(() => {
    const client = getCloudClient();
    if (!cloudConfig.accountsEnabled || !client || account.status !== 'signedIn' || !account.userId) {
      stopSync();
      return;
    }
    void startSync({ userId: account.userId, client, ask: (request) => dialog.choose(request) });
    // Not stopped on unmount of this effect run alone: only a sign-out or another user stops it.
  }, [account.status, account.userId, dialog]);

  useEffect(() => {
    if (!catchingUp) {
      setHolding(false);
      return;
    }
    const show = setTimeout(() => setHolding(true), OVERLAY_DELAY_MS);
    const release = setTimeout(() => setHolding(false), CATCH_UP_HOLD_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(release);
    };
  }, [catchingUp]);

  if (!holding) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.overlay }]} accessibilityViewIsModal>
      <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ActivityIndicator color={colors.primary} />
        <Text accessibilityLiveRegion="polite" style={[styles.text, { color: colors.text }]}>
          Syncing…
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
  },
  text: { fontSize: 16, fontWeight: '600' },
});
