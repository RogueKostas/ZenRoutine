import type { ViewStyle } from 'react-native';

/**
 * Styles for a horizontal `ScrollView` of chips inside a column layout (#43).
 *
 * react-native-web gives every ScrollView `flexGrow: 1, flexShrink: 1` and stretches the
 * horizontal content container's children, so without these a chip row shares the column's
 * height with its siblings and each chip becomes a tall bar.
 */
export const chipRowStyle: ViewStyle = {
  flexGrow: 0,
  flexShrink: 0,
};

/** Use as `contentContainerStyle`; `alignItems` is refused on a ScrollView's own `style`. */
export const chipRowContentStyle: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
};
