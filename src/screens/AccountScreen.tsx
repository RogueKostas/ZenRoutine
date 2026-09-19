import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAppStore } from '../store';
import { Button, Input, useDialog } from '../components/common';
import { cloudConfig } from '../config/cloud';
import { getCloudClient } from '../cloud/client';
import { useAccountStore } from '../cloud/accountStore';
import {
  resetPasswordWithCode,
  sendPasswordResetCode,
  sendSignInCode,
  signInWithPassword,
  signOut,
  signUp,
  deleteAccount,
  verifySignInCode,
  type AccountResult,
} from '../cloud/account';
import { resolveFirstSignIn } from '../cloud/firstSignIn';
import { flushSync, startSync, stopSync, storeApp, syncNow } from '../cloud/syncRuntime';
import { describeSyncStatus, useSyncStore } from '../cloud/syncEngine';
import { supabaseSnapshotApi } from '../cloud/remoteSnapshots';
import {
  clearSyncMeta,
  contentHash,
  getDeviceId,
  readSavedCopies,
  readSyncMeta,
  saveCopy,
  type SavedCopy,
} from '../cloud/localSync';
import { MIN_PASSWORD_LENGTH } from '../cloud/authErrors';
import type { RootStackScreenProps } from '../navigation/types';

/**
 * Settings → Account (docs/ITERATION-2-PLAN.md, Wave B): sign up, sign in, sign out, and the
 * saved copies kept whenever data is replaced. Signing in is always optional; everything else in
 * the app works the same signed out.
 */

type Step =
  | 'signIn'
  | 'signUp'
  | 'checkEmail' // sign-up sent a confirmation link
  | 'signInCode'
  | 'resetRequest'
  | 'resetCode';

export function AccountScreen({ navigation }: RootStackScreenProps<'Account'>) {
  const { colors } = useTheme();
  const dialog = useDialog();
  const account = useAccountStore();
  const client = getCloudClient();

  const [step, setStep] = useState<Step>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copies, setCopies] = useState<SavedCopy[]>([]);

  const refreshCopies = useCallback(() => {
    void readSavedCopies().then(setCopies);
  }, []);
  useEffect(refreshCopies, [refreshCopies, account.status]);

  const go = (next: Step) => {
    setError(null);
    setCode('');
    setStep(next);
  };

  const run = async <T,>(action: () => Promise<AccountResult<T>>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return null;
      }
      return result.value ?? (true as T);
    } finally {
      setBusy(false);
    }
  };

  /** Runs the first-sign-in transfer. Anything but success leaves the device signed out. */
  const afterSignIn = async () => {
    if (!client) return;
    const { data } = await client.auth.getUser();
    if (!data.user) return;
    setBusy(true);
    const result = await resolveFirstSignIn({
      userId: data.user.id,
      deviceId: await getDeviceId(),
      api: supabaseSnapshotApi(client, data.user.id),
      app: storeApp,
      ask: (request) => dialog.choose(request),
    });
    setBusy(false);
    refreshCopies();
    setPassword('');
    setCode('');

    if (result.kind === 'cancelled' || result.kind === 'error') {
      await signOut(client);
      if (result.kind === 'error') void dialog.notify({ title: "Couldn't finish signing in", message: result.message });
      return;
    }
    const messages = {
      uploaded: 'Your data is now saved to your account.',
      downloaded: "Your account's data is now on this device.",
      inSync: 'This device and your account already match.',
    } as const;
    void dialog.notify({ title: 'Signed in', message: messages[result.kind] });
    // From here on sync is automatic; start it now rather than at the next trigger.
    void syncNow();
  };

  if (!client) {
    return (
      <Shell title="Account" onClose={() => navigation.goBack()}>
        <Text style={[styles.body, { color: colors.textSecondary }]}>Accounts aren't available in this version.</Text>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Signed in

  if (account.status === 'signedIn') {
    const handleSignOut = async () => {
      // Send anything unsynced first, so "remove from this device" is offered whenever it is safe.
      setBusy(true);
      await flushSync();
      setBusy(false);
      const meta = await readSyncMeta();
      const synced =
        meta !== null && meta.userId === account.userId && meta.syncedHash === contentHash(useAppStore.getState());
      const choice = await dialog.choose({
        title: 'Sign out of this device?',
        message: synced
          ? 'Your data is saved to your account. Keep a copy on this device too, or remove it?'
          : "This device has changes that haven't reached your account yet (it may be offline), so they stay on this device.",
        options: synced
          ? [
              { label: 'Keep a copy on this device', value: 'keep' },
              { label: 'Remove from this device', value: 'remove' },
            ]
          : [{ label: 'Sign out and keep my data here', value: 'keep' }],
      });
      if (!choice) return;
      setBusy(true);
      if (choice === 'remove') {
        await saveCopy(useAppStore.getState().exportData(), 'This device, when you signed out and removed it').catch(() => undefined);
        await useAppStore.getState().resetState();
      }
      stopSync();
      const result = await signOut(client);
      await clearSyncMeta();
      setBusy(false);
      refreshCopies();
      if (!result.ok) void dialog.notify({ title: 'Sign out', message: result.message });
    };

    const handleDeleteAccount = async () => {
      const choice = await dialog.choose({
        title: 'Delete your ZenRoutine account?',
        message:
          `Your account (${account.email}) and the copy of your data saved with it are deleted straight away, ` +
          'on every device. This cannot be undone.\n\nWhat should happen to the data on this device?',
        options: [
          { label: 'Delete my account, keep my data on this device', value: 'keep' },
          { label: "Delete my account and this device's data", value: 'remove' },
        ],
        cancelLabel: 'Cancel',
      });
      if (!choice) return;
      setBusy(true);
      // Stop sync first, so no push can land between the deletion and the sign-out.
      stopSync();
      const result = await deleteAccount(client);
      if (!result.ok) {
        setBusy(false);
        if (account.userId) void startSync({ userId: account.userId, client, ask: (request) => dialog.choose(request) });
        void dialog.notify({ title: "Couldn't delete your account", message: `${result.message} Nothing was deleted.` });
        return;
      }
      await clearSyncMeta();
      if (choice === 'remove') await useAppStore.getState().resetState();
      setBusy(false);
      refreshCopies();
      void dialog.notify({
        title: 'Your account is deleted',
        message:
          choice === 'remove'
            ? 'Your account and all its data are gone, from the server and from this device.'
            : 'Your account and its server copy are gone. Your data is still on this device, and ZenRoutine keeps working without an account.',
      });
    };

    return (
      <Shell title="Account" onClose={() => navigation.goBack()}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Signed in as</Text>
          <Text accessibilityRole="header" style={[styles.email, { color: colors.text }]}>
            {account.email}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Your changes sync automatically with your other signed-in devices.
          </Text>
          <SyncStatusLine />
        </View>
        <Button title="Sign out" variant="outline" onPress={handleSignOut} loading={busy} fullWidth />
        <SavedCopies copies={copies} onChanged={refreshCopies} />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Delete my account"
          onPress={() => void handleDeleteAccount()}
          disabled={busy}
          style={styles.deleteLink}
        >
          <Text style={[styles.linkText, { color: colors.error }]}>Delete my account</Text>
        </TouchableOpacity>
      </Shell>
    );
  }

  if (account.status === 'starting') {
    return (
      <Shell title="Account" onClose={() => navigation.goBack()}>
        <ActivityIndicator color={colors.primary} />
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Signed out

  const emailField = (
    <Input
      label="Email"
      value={email}
      onChangeText={setEmail}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="email-address"
      autoComplete="email"
      textContentType="emailAddress"
      accessibilityLabel="Email"
      editable={!busy}
    />
  );
  const codeField = (
    <Input
      label="6-digit code"
      value={code}
      onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      accessibilityLabel="6-digit code"
      editable={!busy}
    />
  );
  const errorLine = error ? (
    <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.error }]}>
      {error}
    </Text>
  ) : null;
  const link = (label: string, onPress: () => void) => (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} disabled={busy} style={styles.link}>
      <Text style={[styles.linkText, { color: colors.primary }]}>{label}</Text>
    </TouchableOpacity>
  );

  let body: React.ReactNode;
  switch (step) {
    case 'signIn':
      body = (
        <>
          {emailField}
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            accessibilityLabel="Password"
            editable={!busy}
            onSubmitEditing={() => void submitSignIn()}
          />
          {errorLine}
          <Button title="Sign in" onPress={() => void submitSignIn()} loading={busy} fullWidth />
          {cloudConfig.emailCodesEnabled && link('Email me a sign-in code instead', () => go('signInCode'))}
          {cloudConfig.emailCodesEnabled && link('Forgot your password?', () => go('resetRequest'))}
          {link('New here? Create an account', () => go('signUp'))}
        </>
      );
      break;
    case 'signUp':
      body = (
        <>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            ZenRoutine is invite-only during the beta. Use the email you were invited with.
          </Text>
          {emailField}
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            accessibilityLabel="New password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
            editable={!busy}
          />
          {errorLine}
          <Button
            title="Create account"
            onPress={async () => {
              const created = await run(() => signUp(client, email, password));
              if (!created) return;
              if (created.needsConfirmation) go('checkEmail');
              else void afterSignIn();
            }}
            loading={busy}
            fullWidth
          />
          {link('Already have an account? Sign in', () => go('signIn'))}
        </>
      );
      break;
    case 'checkEmail':
      body = (
        <>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
            Check your email
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            We sent a confirmation link to {email.trim()}. Tap it to confirm your account. On an iPhone or iPad it may open
            in Safari; that's fine. Then come back here and sign in with your password.
          </Text>
          <Button title="I've confirmed. Sign in" onPress={() => go('signIn')} fullWidth />
        </>
      );
      break;
    case 'signInCode':
      body = (
        <>
          {emailField}
          {codeField}
          {errorLine}
          <Button
            title={code ? 'Sign in' : 'Email me a code'}
            onPress={async () => {
              if (!code) {
                if (await run(() => sendSignInCode(client, email))) setError(null);
                return;
              }
              if (await run(() => verifySignInCode(client, email, code))) void afterSignIn();
            }}
            loading={busy}
            fullWidth
          />
          {link('Use my password instead', () => go('signIn'))}
        </>
      );
      break;
    case 'resetRequest':
      body = (
        <>
          <Text style={[styles.body, { color: colors.textSecondary }]}>We'll email you a code to set a new password.</Text>
          {emailField}
          {errorLine}
          <Button
            title="Email me a code"
            onPress={async () => {
              if (await run(() => sendPasswordResetCode(client, email))) go('resetCode');
            }}
            loading={busy}
            fullWidth
          />
          {link('Back to sign in', () => go('signIn'))}
        </>
      );
      break;
    case 'resetCode':
      body = (
        <>
          <Text style={[styles.body, { color: colors.textSecondary }]}>Enter the code we sent to {email.trim()} and a new password.</Text>
          {codeField}
          <Input
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            accessibilityLabel="New password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
            editable={!busy}
          />
          {errorLine}
          <Button
            title="Set new password and sign in"
            onPress={async () => {
              if (await run(() => resetPasswordWithCode(client, email, code, password))) void afterSignIn();
            }}
            loading={busy}
            fullWidth
          />
          {link('Back to sign in', () => go('signIn'))}
        </>
      );
      break;
  }

  async function submitSignIn() {
    if (await run(() => signInWithPassword(client!, email, password))) void afterSignIn();
  }

  return (
    <Shell title={step === 'signUp' ? 'Create an account' : 'Sign in'} onClose={() => navigation.goBack()}>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        An account keeps your data safe and in sync across your devices. ZenRoutine works the same without one.
      </Text>
      {body}
      <SavedCopies copies={copies} onChanged={refreshCopies} />
    </Shell>
  );
}

/** "Synced just now", "Offline…", or the question waiting for you, with the action that fits. */
function SyncStatusLine() {
  const { colors } = useTheme();
  const status = useSyncStore();
  const line = describeSyncStatus(status, new Date());
  const action = status.phase === 'conflict' ? 'Choose a version' : status.phase === 'offline' || status.phase === 'error' ? 'Try again' : null;
  return (
    <View style={styles.statusRow}>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.statusText, { color: status.phase === 'error' || status.phase === 'conflict' ? colors.error : colors.textSecondary }]}
      >
        {line}
      </Text>
      {action ? (
        <TouchableOpacity accessibilityRole="button" onPress={() => void syncNow()} style={styles.link}>
          <Text style={[styles.linkText, { color: colors.primary }]}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
          <Text style={[styles.closeText, { color: colors.primary }]}>Done</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Every version replaced by signing in or out is kept here, restorable in one tap. */
function SavedCopies({ copies, onChanged }: { copies: SavedCopy[]; onChanged: () => void }) {
  const { colors } = useTheme();
  const dialog = useDialog();
  if (copies.length === 0) return null;

  const restore = async (copy: SavedCopy) => {
    const confirmed = await dialog.confirm({
      title: 'Restore this saved copy?',
      message: `${copy.reason}. What's on this device now will be kept as another saved copy first.`,
      confirmLabel: 'Restore',
    });
    if (!confirmed) return;
    try {
      await saveCopy(useAppStore.getState().exportData(), 'This device, before restoring a saved copy');
    } catch {
      void dialog.notify({ title: "Couldn't restore", message: "The current data couldn't be kept first, so nothing was changed." });
      return;
    }
    const result = await useAppStore.getState().importData(copy.backup);
    onChanged();
    void dialog.notify(
      result.ok
        ? { title: 'Restored', message: 'The saved copy is back on this device.' }
        : { title: "Couldn't restore", message: result.error }
    );
  };

  return (
    <View style={styles.copies}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Saved copies on this device</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {copies.map((copy, index) => (
          <TouchableOpacity
            key={copy.id}
            accessibilityRole="button"
            accessibilityLabel={`Restore saved copy: ${copy.reason}`}
            onPress={() => void restore(copy)}
            style={[styles.copyRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
          >
            <Text style={[styles.copyReason, { color: colors.text }]}>{copy.reason}</Text>
            <Text style={[styles.copyWhen, { color: colors.textSecondary }]}>
              {new Date(copy.savedAt).toLocaleString()} · Tap to restore
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { fontSize: 28, fontWeight: 'bold', flexShrink: 1 },
  close: { paddingVertical: 8, paddingLeft: 16 },
  closeText: { fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  column: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16 },
  body: { fontSize: 15, lineHeight: 21 },
  heading: { fontSize: 20, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  email: { fontSize: 18, fontWeight: '600', marginTop: 4, marginBottom: 8 },
  card: { borderRadius: 12, borderWidth: 1, padding: 16, overflow: 'hidden' },
  error: { fontSize: 14, lineHeight: 20 },
  link: { paddingVertical: 6, alignSelf: 'center' },
  linkText: { fontSize: 15, fontWeight: '600' },
  copies: { marginTop: 16, gap: 8 },
  statusRow: { marginTop: 12, gap: 4, alignItems: 'flex-start' },
  deleteLink: { marginTop: 24, paddingVertical: 8, alignSelf: 'center' },
  statusText: { fontSize: 14, lineHeight: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  copyRow: { paddingVertical: 10 },
  copyReason: { fontSize: 15 },
  copyWhen: { fontSize: 13, marginTop: 2 },
});
