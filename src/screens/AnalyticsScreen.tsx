import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useActiveRoutine, useActivityTypes, useTrackingEntries } from '../store';
import { getRoutineBreakdown, getTrackedBreakdown, MINUTES_IN_WEEK } from '../core/engine/analytics';
import { formatDuration } from '../core/utils/time';
import type { TabScreenProps } from '../navigation/types';

type ViewMode = 'planned' | 'tracked' | 'comparison';

export function AnalyticsScreen({ navigation }: TabScreenProps<'Analytics'>) {
  const [viewMode, setViewMode] = useState<ViewMode>('planned');
  const activeRoutine = useActiveRoutine();
  const activityTypes = useActivityTypes();
  const trackingEntries = useTrackingEntries();

  // Get start of current week (Sunday)
  const weekStart = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day;
    const start = new Date(now.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start.toISOString().split('T')[0];
  }, []);

  const plannedBreakdown = useMemo(() => {
    if (!activeRoutine) return [];
    return getRoutineBreakdown(activeRoutine, activityTypes);
  }, [activeRoutine, activityTypes]);

  const trackedBreakdown = useMemo(() => {
    return getTrackedBreakdown(trackingEntries, weekStart, activityTypes);
  }, [trackingEntries, weekStart, activityTypes]);

  const totalPlanned = plannedBreakdown.reduce((sum, b) => sum + b.plannedMinutes, 0);
  const totalTracked = trackedBreakdown.reduce((sum, b) => sum + b.actualMinutes, 0);

  const renderBreakdownItem = (
    item: { activityTypeName: string; color: string; plannedMinutes?: number; actualMinutes?: number },
    index: number,
    total: number
  ) => {
    const minutes = item.plannedMinutes ?? item.actualMinutes ?? 0;
    const percentage = total > 0 ? (minutes / total) * 100 : 0;
    const weekPercentage = (minutes / MINUTES_IN_WEEK) * 100;

    return (
      <View key={index} style={styles.breakdownItem}>
        <View style={styles.breakdownHeader}>
          <View style={[styles.colorDot, { backgroundColor: item.color }]} />
          <Text style={styles.breakdownName}>{item.activityTypeName}</Text>
          <Text style={styles.breakdownTime}>{formatDuration(minutes)}</Text>
        </View>
        <View style={styles.breakdownBarContainer}>
          <View
            style={[
              styles.breakdownBar,
              { width: `${Math.min(100, percentage)}%`, backgroundColor: item.color },
            ]}
          />
        </View>
        <View style={styles.breakdownStats}>
          <Text style={styles.breakdownPercent}>{percentage.toFixed(1)}% of total</Text>
          <Text style={styles.breakdownWeek}>{weekPercentage.toFixed(1)}% of week</Text>
        </View>
      </View>
    );
  };

  const renderComparison = () => {
    // Combine planned and tracked data
    const allActivities = new Map<string, {
      name: string;
      color: string;
      planned: number;
      tracked: number;
    }>();

    plannedBreakdown.forEach((item) => {
      allActivities.set(item.activityTypeId, {
        name: item.activityTypeName,
        color: item.color,
        planned: item.plannedMinutes,
        tracked: 0,
      });
    });

    trackedBreakdown.forEach((item) => {
      const existing = allActivities.get(item.activityTypeId);
      if (existing) {
        existing.tracked = item.actualMinutes;
      } else {
        allActivities.set(item.activityTypeId, {
          name: item.activityTypeName,
          color: item.color,
          planned: 0,
          tracked: item.actualMinutes,
        });
      }
    });

    const comparisonData = Array.from(allActivities.values())
      .sort((a, b) => (b.planned + b.tracked) - (a.planned + a.tracked));

    return (
      <View style={styles.comparisonContainer}>
        {comparisonData.map((item, index) => {
          const diff = item.tracked - item.planned;
          const diffPercent = item.planned > 0 ? (diff / item.planned) * 100 : 0;
          return (
            <View key={index} style={styles.comparisonItem}>
              <View style={styles.comparisonHeader}>
                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                <Text style={styles.comparisonName}>{item.name}</Text>
              </View>
              <View style={styles.comparisonBars}>
                <View style={styles.comparisonRow}>
                  <Text style={styles.comparisonLabel}>Planned</Text>
                  <View style={styles.comparisonBarWrapper}>
                    <View
                      style={[
                        styles.comparisonBar,
                        { width: `${Math.min(100, (item.planned / (totalPlanned || 1)) * 100)}%` },
                        { backgroundColor: item.color, opacity: 0.4 },
                      ]}
                    />
                  </View>
                  <Text style={styles.comparisonValue}>{formatDuration(item.planned)}</Text>
                </View>
                <View style={styles.comparisonRow}>
                  <Text style={styles.comparisonLabel}>Tracked</Text>
                  <View style={styles.comparisonBarWrapper}>
                    <View
                      style={[
                        styles.comparisonBar,
                        { width: `${Math.min(100, (item.tracked / (totalPlanned || 1)) * 100)}%` },
                        { backgroundColor: item.color },
                      ]}
                    />
                  </View>
                  <Text style={styles.comparisonValue}>{formatDuration(item.tracked)}</Text>
                </View>
              </View>
              {item.planned > 0 && (
                <Text
                  style={[
                    styles.comparisonDiff,
                    diff > 0 ? styles.diffPositive : diff < 0 ? styles.diffNegative : null,
                  ]}
                >
                  {diff > 0 ? '+' : ''}{formatDuration(Math.abs(diff))} ({diffPercent > 0 ? '+' : ''}{diffPercent.toFixed(0)}%)
                </Text>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics</Text>
      </View>

      {/* View Mode Selector */}
      <View style={styles.modeSelector}>
        {(['planned', 'tracked', 'comparison'] as ViewMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.modeButton, viewMode === mode && styles.modeButtonActive]}
            onPress={() => setViewMode(mode)}
          >
            <Text style={[styles.modeText, viewMode === mode && styles.modeTextActive]}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatDuration(totalPlanned)}</Text>
              <Text style={styles.summaryLabel}>Planned / week</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatDuration(totalTracked)}</Text>
              <Text style={styles.summaryLabel}>Tracked this week</Text>
            </View>
          </View>
          <View style={styles.summaryProgress}>
            <View style={styles.summaryProgressBar}>
              <View
                style={[
                  styles.summaryProgressFill,
                  { width: `${Math.min(100, totalPlanned > 0 ? (totalTracked / totalPlanned) * 100 : 0)}%` },
                ]}
              />
            </View>
            <Text style={styles.summaryProgressText}>
              {totalPlanned > 0 ? ((totalTracked / totalPlanned) * 100).toFixed(0) : 0}% of plan
            </Text>
          </View>
        </View>

        {/* Breakdown Content */}
        {viewMode === 'planned' && (
          <View style={styles.breakdownSection}>
            <Text style={styles.sectionTitle}>Planned Time Breakdown</Text>
            {plannedBreakdown.length > 0 ? (
              plannedBreakdown.map((item, index) =>
                renderBreakdownItem(
                  { ...item, plannedMinutes: item.plannedMinutes },
                  index,
                  totalPlanned
                )
              )
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No routine set up yet</Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => navigation.navigate('Routine')}
                >
                  <Text style={styles.emptyButtonText}>Set up routine</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {viewMode === 'tracked' && (
          <View style={styles.breakdownSection}>
            <Text style={styles.sectionTitle}>Tracked Time This Week</Text>
            {trackedBreakdown.length > 0 ? (
              trackedBreakdown.map((item, index) =>
                renderBreakdownItem(
                  { ...item, actualMinutes: item.actualMinutes },
                  index,
                  totalTracked
                )
              )
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No time tracked this week</Text>
                <Text style={styles.emptySubtext}>Start tracking to see your analytics</Text>
              </View>
            )}
          </View>
        )}

        {viewMode === 'comparison' && (
          <View style={styles.breakdownSection}>
            <Text style={styles.sectionTitle}>Planned vs Tracked</Text>
            {plannedBreakdown.length > 0 || trackedBreakdown.length > 0 ? (
              renderComparison()
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No data to compare</Text>
                <Text style={styles.emptySubtext}>Set up a routine and track some time</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  modeSelector: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  modeButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  modeTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  summaryCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  summaryProgress: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryProgressBar: {
    flex: 1,
    height: 8,
    backgroundColor: colors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginRight: 12,
  },
  summaryProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  summaryProgressText: {
    fontSize: 12,
    color: colors.textSecondary,
    width: 70,
    textAlign: 'right',
  },
  breakdownSection: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  breakdownItem: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  breakdownName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  breakdownTime: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  breakdownBarContainer: {
    height: 8,
    backgroundColor: colors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  breakdownBar: {
    height: '100%',
    borderRadius: 4,
  },
  breakdownStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownPercent: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  breakdownWeek: {
    fontSize: 12,
    color: colors.textMuted,
  },
  comparisonContainer: {},
  comparisonItem: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  comparisonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  comparisonName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  comparisonBars: {},
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  comparisonLabel: {
    width: 60,
    fontSize: 12,
    color: colors.textSecondary,
  },
  comparisonBarWrapper: {
    flex: 1,
    height: 12,
    backgroundColor: colors.borderLight,
    borderRadius: 6,
    overflow: 'hidden',
    marginRight: 12,
  },
  comparisonBar: {
    height: '100%',
    borderRadius: 6,
  },
  comparisonValue: {
    width: 50,
    fontSize: 12,
    color: colors.text,
    textAlign: 'right',
  },
  comparisonDiff: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  diffPositive: {
    color: colors.success,
  },
  diffNegative: {
    color: colors.warning,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
  },
  emptyButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
