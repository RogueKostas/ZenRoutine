/**
 * ZenRoutine shell brand v1 (assets/brand/zenroutine-shell-v1/tokens.json). The kit's tokens are
 * the source of truth; `onError` and `overlay` are the two additions the app needs that the kit
 * does not name, and tests/theme/contrast.test.ts holds every text pair here to WCAG AA.
 *
 * Activity colours are NOT here: they are the user's data (src/core/engine/defaults.ts seeds new
 * installs), and the brand never recolours them. `activity` below is only the kit's suggested
 * palette, for any future picker; nothing reads it today.
 */
export const colors = {
  // The kit's suggested activity palette (not applied to anyone's data).
  activity: {
    work: '#B95142',
    sideProject: '#A76320',
    family: '#A35671',
    fitness: '#28735B',
    personalDev: '#8B741A',
    entertainment: '#397793',
    social: '#785A94',
    commute: '#61766C',
    food: '#8D6345',
    hygiene: '#277E7C',
    sleep: '#5F678C',
  },

  // UI colours: light theme (Evergreen accent on Paper).
  primary: '#216653',
  primaryDark: '#173F3A',
  secondary: '#4A7560',
  /** Text and icons on `primary`: never assume white. */
  onPrimary: '#F3EEDC',

  background: '#F3EEDC',
  backgroundSecondary: '#E8ECDF',
  surface: '#FFFCF4',

  text: '#173F3A',
  textSecondary: '#53685F',
  textMuted: '#566B60',

  /** Essential control boundaries (inputs, outlined buttons): 3:1 against the background. */
  border: '#728779',
  /** Decorative dividers only, never the sole boundary of a control. */
  borderLight: '#D6DECE',

  success: '#216653',
  warning: '#89621E',
  error: '#A54135',
  /** Text and icons on `error` (Stop buttons, destructive actions). */
  onError: '#FFFCF4',
  info: '#35677B',
  focus: '#216653',

  /** Behind modal dialogs. */
  overlay: 'rgba(19, 43, 39, 0.55)',
};

export const darkColors: typeof colors = {
  ...colors,
  // Dark theme: Mint accent on Night.
  primary: '#8AC8AA',
  primaryDark: '#A7D9BF',
  secondary: '#B4CBB4',
  onPrimary: '#132B27',

  background: '#132B27',
  backgroundSecondary: '#19332D',
  surface: '#1D3832',

  text: '#F3EEDC',
  textSecondary: '#B9CDC0',
  textMuted: '#9CB5A7',

  border: '#728E7E',
  borderLight: '#35564A',

  success: '#8AC8AA',
  warning: '#E5C57C',
  error: '#EAA99B',
  onError: '#132B27',
  info: '#9EC7D5',
  focus: '#B5DFC6',

  overlay: 'rgba(5, 15, 13, 0.7)',
};
