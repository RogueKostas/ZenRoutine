import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Tab Navigator param list
export type TabParamList = {
  Home: undefined;
  Routine: undefined;
  Goals: undefined;
  Analytics: undefined;
  Settings: undefined;
};

// Root Stack param list (for modals and nested navigators)
export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  GoalDetail: { goalId: string };
  ActivityTypeEditor: { activityTypeId?: string };
  ActivityTypes: undefined;
  BlockEditor: { routineId: string; blockId?: string };
  Debug: undefined;
};

// Screen props types
export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

// Navigation hook types (for use with useNavigation)
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
