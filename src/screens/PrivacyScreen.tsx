import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import type { RootStackScreenProps } from '../navigation/types';

/**
 * Privacy, in plain words (docs/ITERATION-2-PLAN.md, D1). Written to be true of this build, and
 * honest about the one thing people tend to leave out: the person running the beta can technically
 * reach the database. If any of this stops being true, change the text in the same change.
 */
const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'What ZenRoutine keeps',
    body: [
      'Everything you enter: your goals, your weekly routine, the time you track, your notes on goals and your settings.',
      'If you have an account, also your email address and a way to check your password. Your password itself is never stored in a readable form.',
    ],
  },
  {
    title: 'Where it is kept',
    body: [
      'On this device, always. ZenRoutine works fully without an account, and then nothing leaves the device.',
      'If you sign in, a copy is also saved to your ZenRoutine account so your other devices can sync with it. Accounts are hosted by Supabase, in London.',
    ],
  },
  {
    title: 'Who can see it',
    body: [
      'Only you, through the app. Your account can read and change only its own data.',
      'To be straightforward about it: the person running the ZenRoutine beta can technically reach the database. They will not look at your data unless you ask them to help with a problem.',
      'Nothing is sold or shared. There are no ads and no analytics.',
    ],
  },
  {
    title: 'Emails',
    body: ['Only what an account needs: confirming your address, and signing in or resetting your password if you ask.'],
  },
  {
    title: 'Deleting it',
    body: [
      'Your account and its saved copy: Settings → Account → Delete my account. It happens straight away, on every device.',
      'The data on this device: Settings → Reset All Data.',
      'Before you delete anything, Settings → Export Data gives you a full copy to keep.',
    ],
  },
];

export function PrivacyScreen({ navigation }: RootStackScreenProps<'Privacy'>) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          Privacy
        </Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => navigation.goBack()} style={styles.close}>
          <Text style={[styles.closeText, { color: colors.primary }]}>Done</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          {SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
                {section.title}
              </Text>
              {section.body.map((paragraph) => (
                <Text key={paragraph} style={[styles.body, { color: colors.textSecondary }]}>
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
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
  title: { fontSize: 28, fontWeight: 'bold' },
  close: { paddingVertical: 8, paddingLeft: 16 },
  closeText: { fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 24 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
});
