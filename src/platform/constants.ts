import { Platform, Dimensions } from 'react-native';

export type PlatformType = 'phone' | 'tablet' | 'desktop';

export function detectPlatform(): PlatformType {
  if (Platform.OS === 'web') {
    const width = Dimensions.get('window').width;
    return width >= 1024 ? 'desktop' : width >= 768 ? 'tablet' : 'phone';
  }
  
  const { width, height } = Dimensions.get('window');
  const screenSize = Math.max(width, height);
  
  return screenSize >= 768 ? 'tablet' : 'phone';
}

export interface PlatformConfig {
  minTouchTarget: number;
  blockHandleSize: number;
  defaultZoomLevel: number;
  minZoomLevel: number;
  maxZoomLevel: number;
  dragThreshold: number;
  longPressDelay: number;
  showSidebar: boolean;
  timelineHeight: number;
}

export const PLATFORM_CONFIGS: Record<PlatformType, PlatformConfig> = {
  phone: {
    minTouchTarget: 44,
    blockHandleSize: 24,
    defaultZoomLevel: 1,
    minZoomLevel: 1,
    maxZoomLevel: 3,
    dragThreshold: 10,
    longPressDelay: 500,
    showSidebar: false,
    timelineHeight: 120,
  },
  tablet: {
    minTouchTarget: 32,
    blockHandleSize: 20,
    defaultZoomLevel: 3,
    minZoomLevel: 1,
    maxZoomLevel: 7,
    dragThreshold: 8,
    longPressDelay: 400,
    showSidebar: false,
    timelineHeight: 150,
  },
  desktop: {
    minTouchTarget: 24,
    blockHandleSize: 12,
    defaultZoomLevel: 7,
    minZoomLevel: 1,
    maxZoomLevel: 7,
    dragThreshold: 5,
    longPressDelay: 300,
    showSidebar: true,
    timelineHeight: 180,
  },
};

export function getPlatformConfig(): PlatformConfig {
  return PLATFORM_CONFIGS[detectPlatform()];
}
