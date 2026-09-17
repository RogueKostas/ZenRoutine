import { describe, expect, it } from 'vitest';
import { chipRowContentStyle, chipRowStyle } from '../../src/components/common/chipRow';

// No renderer here, so this checks the style contract that keeps chips chip-height on
// react-native-web (#43). The browser check is in the lane's click-through.
describe('chip row styles', () => {
  it('stops the row growing into the column', () => {
    expect(chipRowStyle.flexGrow).toBe(0);
    expect(chipRowStyle.flexShrink).toBe(0);
  });

  it('keeps chips at their own height instead of stretching them', () => {
    expect(chipRowContentStyle.flexDirection).toBe('row');
    expect(chipRowContentStyle.alignItems).toBeDefined();
    expect(chipRowContentStyle.alignItems).not.toBe('stretch');
  });

  it('keeps alignItems off the ScrollView style, where React Native refuses it', () => {
    expect(chipRowStyle).not.toHaveProperty('alignItems');
    expect(chipRowStyle).not.toHaveProperty('justifyContent');
  });
});
