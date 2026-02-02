import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, StyleProp } from 'react-native';
import { duration, easing, fadeIn, scaleIn, slideInFromBottom } from '../../theme/animations';

interface FadeInViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  duration?: number;
}

export function FadeInView({ children, style, delay = 0, duration: dur }: FadeInViewProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn(opacity, { delay, duration: dur }).start();
  }, [opacity, delay, dur]);

  return (
    <Animated.View style={[style, { opacity }]}>
      {children}
    </Animated.View>
  );
}

interface ScaleInViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  fromScale?: number;
}

export function ScaleInView({ children, style, delay = 0, fromScale = 0.9 }: ScaleInViewProps) {
  const scale = useRef(new Animated.Value(fromScale)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        scaleIn(scale, { fromScale }),
        fadeIn(opacity, { duration: duration.fast }),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [scale, opacity, delay, fromScale]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}

interface SlideInViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  from?: 'bottom' | 'right' | 'left' | 'top';
  distance?: number;
}

export function SlideInView({
  children,
  style,
  delay = 0,
  from = 'bottom',
  distance = 50,
}: SlideInViewProps) {
  const translateY = useRef(new Animated.Value(from === 'bottom' ? distance : from === 'top' ? -distance : 0)).current;
  const translateX = useRef(new Animated.Value(from === 'right' ? distance : from === 'left' ? -distance : 0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.spring(from === 'bottom' || from === 'top' ? translateY : translateX, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        fadeIn(opacity, { duration: duration.fast }),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [translateY, translateX, opacity, delay, from]);

  const transform = from === 'bottom' || from === 'top'
    ? [{ translateY }]
    : [{ translateX }];

  return (
    <Animated.View style={[style, { opacity, transform }]}>
      {children}
    </Animated.View>
  );
}

interface StaggeredListProps {
  children: React.ReactNode[];
  stagger?: number;
  style?: StyleProp<ViewStyle>;
}

export function StaggeredList({ children, stagger = 50, style }: StaggeredListProps) {
  return (
    <>
      {React.Children.map(children, (child, index) => (
        <FadeInView delay={index * stagger} style={style}>
          {child}
        </FadeInView>
      ))}
    </>
  );
}

interface PressableScaleProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  activeScale?: number;
}

export function PressableScale({
  children,
  style,
  onPress,
  activeScale = 0.97,
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: activeScale,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Animated.View
        // Using touchable behavior through gesture handlers
        onTouchStart={handlePressIn}
        onTouchEnd={() => {
          handlePressOut();
          onPress?.();
        }}
        onTouchCancel={handlePressOut}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

// Animated progress bar
interface AnimatedProgressProps {
  progress: number; // 0-100
  color?: string;
  backgroundColor?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedProgress({
  progress,
  color = '#6366F1',
  backgroundColor = '#E5E7EB',
  height = 6,
  style,
}: AnimatedProgressProps) {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: progress,
      duration: duration.slow,
      easing: easing.standard,
      useNativeDriver: false,
    }).start();
  }, [progress, animatedWidth]);

  return (
    <Animated.View
      style={[
        {
          height,
          backgroundColor,
          borderRadius: height / 2,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          height: '100%',
          backgroundColor: color,
          borderRadius: height / 2,
          width: animatedWidth.interpolate({
            inputRange: [0, 100],
            outputRange: ['0%', '100%'],
          }),
        }}
      />
    </Animated.View>
  );
}
