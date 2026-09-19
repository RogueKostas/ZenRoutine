import React, { createContext, useContext, useMemo, useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import {
  createDialogApi,
  createDialogQueue,
  dialogActions,
  type DialogAction,
  type DialogApi,
  type DialogEntry,
  type DialogResult,
} from './dialogQueue';

/*
 * The app's one dialog, replacing Alert.alert — which is a silent no-op on react-native-web (#39).
 *
 * Why an in-app RN Modal rather than window.confirm or a library: it works the same on web, iOS
 * and Android, it can show a three-way chooser (window.confirm cannot), it follows the app theme,
 * and it adds no dependency. On web, react-native-web's Modal closes on Escape via onRequestClose
 * and traps focus, which is exactly the keyboard behaviour a dialog needs.
 *
 * The Modal is mounted only while a dialog is open, and remounted per dialog. react-native-web
 * appends a Modal's portal to <body> when the Modal mounts, and later portals paint on top; an
 * always-mounted Modal here would sit *under* screens' own modals (BlockEditor, the stop-tracking
 * sheet) that are asked to confirm something.
 */

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue] = useState(createDialogQueue);
  const api = useMemo(() => createDialogApi(queue), [queue]);
  const entry = useSyncExternalStore(queue.subscribe, queue.current, queue.current);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {entry ? (
        <DialogView
          key={entry.id}
          entry={entry}
          onAction={(result) => queue.settle(entry.id, result)}
          onDismiss={() => queue.dismiss(entry.id)}
        />
      ) : null}
    </DialogContext.Provider>
  );
}

/** confirm / notify / choose. Must be used under DialogProvider (mounted once in App.tsx). */
export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) {
    throw new Error('useDialog must be used inside <DialogProvider>');
  }
  return api;
}

interface DialogViewProps {
  entry: DialogEntry;
  onAction: (result: DialogResult) => void;
  onDismiss: () => void;
}

function DialogView({ entry, onAction, onDismiss }: DialogViewProps) {
  const { colors } = useTheme();
  const { request } = entry;
  const actions = dialogActions(request);
  const isChoice = request.kind === 'choose';

  const renderAction = (action: DialogAction, index: number) => {
    const isOption = action.role === 'option';
    const isPrimary = action.role === 'default' || action.role === 'destructive';
    const fill =
      action.role === 'destructive' ? colors.error : action.role === 'default' ? colors.primary : undefined;
    return (
      <Pressable
        key={index}
        accessibilityRole="button"
        accessibilityState={isOption ? { selected: !!action.selected } : undefined}
        onPress={() => onAction(action.result)}
        style={[
          styles.button,
          isOption ? styles.optionButton : null,
          fill
            ? { backgroundColor: fill, borderColor: fill }
            : {
                borderColor: action.selected ? colors.primary : colors.border,
                backgroundColor: action.selected ? colors.primary + '15' : 'transparent',
              },
        ]}
      >
        <Text
          style={[
            styles.buttonText,
            {
              color: isPrimary
                ? action.role === 'destructive'
                  ? colors.onError
                  : colors.onPrimary
                : action.selected
                  ? colors.primary
                  : colors.text,
            },
          ]}
        >
          {action.label}
          {action.selected ? '  ✓' : ''}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        {/* The card comes first so the focus trap lands on its first button (Cancel), not the backdrop. */}
        <View
          accessibilityViewIsModal
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {request.title}
          </Text>
          {request.message ? (
            <Text style={[styles.message, { color: colors.textSecondary }]}>{request.message}</Text>
          ) : null}
          <View style={isChoice ? styles.optionList : styles.buttonRow}>
            {actions.map(renderAction)}
          </View>
        </View>
        <Pressable
          accessibilityLabel="Close dialog"
          focusable={false}
          onPress={onDismiss}
          style={[StyleSheet.absoluteFill, styles.backdrop, { backgroundColor: colors.overlay }]}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    zIndex: 0,
  },
  card: {
    zIndex: 1,
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 20,
  },
  optionList: {
    gap: 8,
    marginTop: 16,
  },
  button: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionButton: {
    alignItems: 'flex-start',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
