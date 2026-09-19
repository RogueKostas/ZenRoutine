import React, { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { chipRowContentStyle, chipRowStyle } from '../common/chipRow';
import { DayRibbon } from '../ribbon/DayRibbon';
import { useNow } from '../ribbon/useNow';
import {
  useActiveRoutine,
  useActivityTypes,
  useGoals,
  useTrackingEntries,
  useWeekStartsOn,
} from '../../store';
import {
  CALENDAR_ZOOMS,
  FORECAST_GRANULARITIES,
  buildDaySlices,
  buildForecastEntriesByDate,
  buildMonthCells,
  buildWeekDays,
  calendarToday,
  calendarTitle,
  createForecastMemo,
  cursorMonth,
  dayRibbonWindow,
  formatSliceLine,
  formatSliceTime,
  monthCellDisplay,
  openCalendarDay,
  resolveTypeFilter,
  slicesToRibbonBlocks,
  stepCalendar,
  summarizeUnscheduled,
  zoomCalendar,
  type CalendarCursor,
  type CalendarEntry,
  type CalendarFilter,
  type CalendarSlice,
  type ForecastGranularity,
  type MonthCell,
} from '../../core/engine/forecastCalendar';
import { getDayName, orderedWeekDays, parseLocalDateKey, toLocalDateKey } from '../../core/utils/time';

export const FORECAST_CALENDAR_TITLE = 'Forecast';
export const FORECAST_CALENDAR_SUBTITLE =
  'When each goal is forecast to finish, from your routine and the order of your goals';

const UNKNOWN_TYPE_COLOR = '#9E9E9E';
const TICK = '✓';

/**
 * The forecast calendar (#52, DESIGN-2019 §4.5 p69): month grid of forecast completions, with
 * week and day zoom, a type filter and a milestone granularity. Rendered by the Analytics tab's
 * Calendar segment. All data comes from the pure builders in `core/engine/forecastCalendar`.
 */
export function ForecastCalendar() {
  const { colors } = useTheme();
  const goals = useGoals();
  const activityTypes = useActivityTypes();
  const routine = useActiveRoutine();
  const trackingEntries = useTrackingEntries();
  const weekStartsOn = useWeekStartsOn();
  const now = useNow(60_000);
  const today = toLocalDateKey(now);

  const [cursor, setCursor] = useState<CalendarCursor>(() => ({ zoom: 'month', date: today }));
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<ForecastGranularity>('completions');
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  const [memo] = useState(() => createForecastMemo());
  // Recomputed only when the routine, goals or tracking change, or the hour turns.
  const { result: forecast, from: forecastFrom } = memo(routine, goals, trackingEntries, now);

  const filter: CalendarFilter = useMemo(
    () => ({ typeId: resolveTypeFilter(typeFilter, activityTypes), granularity }),
    [typeFilter, activityTypes, granularity]
  );

  const typeColor = useMemo(() => {
    const map = new Map(activityTypes.map((type) => [type.id, type.color]));
    return (id: string | undefined) => (id && map.get(id)) || UNKNOWN_TYPE_COLOR;
  }, [activityTypes]);

  // Only types that some goal uses are worth filtering by.
  const filterTypes = useMemo(
    () => activityTypes.filter((type) => goals.some((goal) => goal.activityTypeId === type.id)),
    [activityTypes, goals]
  );

  const entriesByDate = useMemo(
    () => buildForecastEntriesByDate(forecast, goals, filter),
    [forecast, goals, filter]
  );

  const unscheduled = useMemo(
    () =>
      summarizeUnscheduled(forecast.unscheduled, goals, routine, {
        typeId: filter.typeId,
        activityTypes,
      }),
    [forecast, goals, routine, filter.typeId, activityTypes]
  );

  const title = calendarTitle(cursor, weekStartsOn);
  const stepLabel = cursor.zoom === 'month' ? 'month' : cursor.zoom === 'week' ? 'week' : 'day';

  const onGridLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== gridWidth) setGridWidth(next);
  };

  const renderMarker = (entry: CalendarEntry) =>
    entry.kind === 'milestone' ? (
      <Text style={[styles.badge, { color: colors.success }]}>{entry.badge}</Text>
    ) : (
      <Text style={[styles.tick, { color: colors.success }]}>{TICK}</Text>
    );

  const describeEntry = (entry: CalendarEntry) =>
    entry.kind === 'milestone' ? `${entry.goalName} reaches ${entry.badge}` : `${entry.goalName} completes`;

  const renderMonth = () => {
    const { year, month } = cursorMonth(cursor);
    const cells = buildMonthCells(year, month, weekStartsOn, entriesByDate, today);
    const cellWidth = gridWidth > 0 ? gridWidth / 7 : 0;
    const wide = cellWidth >= 96;
    const rows = Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));

    const renderCell = (cell: MonthCell) => {
      const display = monthCellDisplay(cell.entries, cellWidth);
      const date = parseLocalDateKey(cell.date);
      const label = `${getDayName(date.getDay())} ${date.getDate()}${cell.isToday ? ', today' : ''}${
        cell.entries.length > 0 ? `: ${cell.entries.map(describeEntry).join(', ')}` : ''
      }`;
      return (
        <Pressable
          key={cell.date}
          onPress={() => setCursor(openCalendarDay(cell.date))}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={[
            styles.monthCell,
            { borderColor: colors.border, minHeight: wide ? 92 : 58 },
            cell.isToday && { borderColor: colors.primary, borderWidth: 2 },
          ]}
        >
          <View style={[styles.monthCellInner, !cell.inMonth && { opacity: 0.4 }]}>
            <Text
              style={[
                styles.dayNumber,
                { color: cell.isToday ? colors.primary : colors.textSecondary },
                cell.isToday && styles.dayNumberToday,
              ]}
            >
              {cell.dayOfMonth}
            </Text>
            {display.mode === 'names' ? (
              <>
                {display.shown.map((entry) => (
                  <View key={entry.key} style={styles.entryRow}>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.entryName, { color: colors.text }]}>
                      {entry.goalName}
                    </Text>
                    <View style={[styles.dot, { backgroundColor: typeColor(entry.activityTypeId) }]} />
                    {renderMarker(entry)}
                  </View>
                ))}
                {display.more > 0 && (
                  <Text style={[styles.more, { color: colors.textSecondary }]}>+{display.more} more</Text>
                )}
              </>
            ) : (
              display.count > 0 && (
                <View style={styles.dotRow}>
                  {display.shown.map((entry) =>
                    entry.kind === 'milestone' ? (
                      <View
                        key={entry.key}
                        style={[styles.dot, styles.hollowDot, { borderColor: typeColor(entry.activityTypeId) }]}
                      />
                    ) : (
                      <View key={entry.key} style={[styles.dot, { backgroundColor: typeColor(entry.activityTypeId) }]} />
                    )
                  )}
                  {display.count > display.shown.length && (
                    <Text style={[styles.count, { color: colors.textSecondary }]}>
                      +{display.count - display.shown.length}
                    </Text>
                  )}
                </View>
              )
            )}
          </View>
        </Pressable>
      );
    };

    return (
      <View>
        <View style={styles.weekdayRow}>
          {orderedWeekDays(weekStartsOn).map((day) => (
            <Text key={day} style={[styles.weekdayLabel, { color: colors.textSecondary }]}>
              {getDayName(day, !wide)}
            </Text>
          ))}
        </View>
        <View onLayout={onGridLayout}>
          {rows.map((row) => (
            <View key={row[0].date} style={styles.gridRow}>
              {row.map(renderCell)}
            </View>
          ))}
        </View>
        {!wide && gridWidth > 0 && (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {granularity === 'milestones'
              ? 'A filled dot is a completion, a ring is a milestone. Tap a day to see its goals.'
              : 'Each dot is a goal forecast to finish. Tap a day to see its goals.'}
          </Text>
        )}
      </View>
    );
  };

  const sliceColors = (slice: CalendarSlice) => {
    const color = typeColor(slice.activityTypeId);
    return slice.goalId === null
      ? { borderLeftColor: color, backgroundColor: colors.backgroundSecondary }
      : { borderLeftColor: color, backgroundColor: `${color}22` };
  };

  const renderWeek = () => {
    const days = buildWeekDays(cursor.date, weekStartsOn, forecast, goals, filter, entriesByDate, today);
    return (
      <View style={styles.weekRow}>
        {days.map((day) => {
          const date = parseLocalDateKey(day.date);
          return (
            <Pressable
              key={day.date}
              onPress={() => setCursor(openCalendarDay(day.date))}
              accessibilityRole="button"
              accessibilityLabel={`Open ${getDayName(date.getDay())} ${date.getDate()}, ${day.slices.length} ${
                day.slices.length === 1 ? 'slice' : 'slices'
              }`}
              style={[
                styles.weekColumn,
                { borderColor: colors.border },
                day.isToday && { borderColor: colors.primary, borderWidth: 2 },
              ]}
            >
              <Text style={[styles.weekDayName, { color: day.isToday ? colors.primary : colors.textSecondary }]}>
                {getDayName(date.getDay(), true)}
              </Text>
              <Text style={[styles.weekDayNumber, { color: day.isToday ? colors.primary : colors.text }]}>
                {date.getDate()}
              </Text>
              {day.slices.length === 0 && (
                <Text style={[styles.weekEmpty, { color: colors.textMuted }]}>–</Text>
              )}
              {day.slices.map((slice) => (
                <View key={slice.key} style={[styles.weekSlice, sliceColors(slice)]}>
                  <Text numberOfLines={2} style={[styles.weekSliceName, { color: colors.text }]}>
                    {slice.label}
                    {slice.completes ? ` ${TICK}` : ''}
                  </Text>
                  <Text numberOfLines={2} style={[styles.weekSliceTime, { color: colors.textSecondary }]}>
                    {slice.timeRange}
                  </Text>
                  {slice.milestones.length > 0 && (
                    <Text style={[styles.weekSliceTime, { color: colors.success, fontWeight: '700' }]}>
                      {slice.milestones.map((m) => `${Math.round(m * 100)}%`).join(' ')}
                    </Text>
                  )}
                </View>
              ))}
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderDay = () => {
    const slices = buildDaySlices(forecast, goals, cursor.date, filter, {
      routine,
      from: forecastFrom,
      activityTypes,
    });
    const entries = entriesByDate.get(cursor.date) ?? [];
    const labels = new Map(slices.map((slice) => [slice.key, slice.label]));
    const ribbonBlocks = slicesToRibbonBlocks(slices);
    const isToday = cursor.date === today;
    const typeName = activityTypes.find((type) => type.id === filter.typeId)?.name;

    return (
      <View>
        {slices.length > 0 && (
          <DayRibbon
            blocks={ribbonBlocks}
            activityTypes={activityTypes}
            window={dayRibbonWindow(slices)}
            now={isToday ? now : null}
            labels="custom"
            labelFor={(block) => labels.get(block.id)}
            style={styles.ribbon}
            accessibilityLabel={`Forecast for ${title}: ${slices.map(formatSliceLine).join('; ')}`}
          />
        )}

        {entries.length > 0 && (
          <View style={styles.daySection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Forecast to finish</Text>
            {entries.map((entry) => (
              <View key={entry.key} style={styles.dayEntryRow}>
                <View style={[styles.dot, { backgroundColor: typeColor(entry.activityTypeId) }]} />
                <Text style={[styles.dayEntryText, { color: colors.text }]}>
                  {entry.goalName}
                  <Text style={{ color: colors.textSecondary }}> at {formatSliceTime(entry.minutes)}</Text>
                </Text>
                {renderMarker(entry)}
              </View>
            ))}
          </View>
        )}

        <View style={styles.daySection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Which goal fills each block</Text>
          {slices.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {cursor.date < today
                ? 'This day is in the past. Forecasts start from now.'
                : typeName
                  ? `No ${typeName} time forecast on this day.`
                  : 'No routine time forecast on this day.'}
            </Text>
          ) : (
            slices.map((slice) => (
              <View key={slice.key} style={[styles.dayListRow, sliceColors(slice)]}>
                <Text
                  style={[
                    styles.dayListText,
                    { color: slice.goalId === null ? colors.textSecondary : colors.text },
                    slice.completes && styles.dayListDone,
                  ]}
                >
                  {formatSliceLine(slice)}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
    );
  };

  const renderEmpty = () => {
    if (!routine) {
      return 'There is no active routine yet. The forecast pours routine time into your goals.';
    }
    if (goals.length === 0) {
      return 'Add goals to see when each is forecast to finish.';
    }
    return null;
  };
  const emptyMessage = renderEmpty();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            {FORECAST_CALENDAR_TITLE}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{FORECAST_CALENDAR_SUBTITLE}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setCursor(calendarToday(cursor, today))}
          style={styles.todayTouchTarget}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
        >
          <Text style={[styles.todayButton, { color: colors.primary }]}>Today</Text>
        </TouchableOpacity>
      </View>

      {/* Zoom: Month | Week | Day */}
      <View style={[styles.segment, { borderColor: colors.primary }]} accessibilityRole="tablist">
        {CALENDAR_ZOOMS.map(({ key, label }) => {
          const selected = cursor.zoom === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.segmentButton, selected && { backgroundColor: colors.primary }]}
              onPress={() => setCursor(zoomCalendar(cursor, key, today))}
              accessibilityRole="tab"
              accessibilityLabel={`${label} view`}
              accessibilityState={{ selected }}
            >
              <Text style={[styles.segmentText, { color: selected ? colors.onPrimary : colors.primary }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.nav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => setCursor(stepCalendar(cursor, -1))}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel={`Previous ${stepLabel}`}
        >
          <Text style={[styles.navButtonText, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <TouchableOpacity
          onPress={() => setCursor(stepCalendar(cursor, 1))}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel={`Next ${stepLabel}`}
        >
          <Text style={[styles.navButtonText, { color: colors.primary }]}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Filter by type (p69) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={chipRowStyle}
          contentContainerStyle={[chipRowContentStyle, styles.chipRow]}
        >
          {[{ id: null as string | null, name: 'All types', color: undefined as string | undefined }, ...filterTypes].map(
            (type) => {
              const selected = filter.typeId === type.id;
              return (
                <TouchableOpacity
                  key={type.id ?? 'all'}
                  onPress={() => setTypeFilter(type.id)}
                  accessibilityRole="button"
                  accessibilityLabel={type.id ? `Show ${type.name} goals only` : 'Show all goals'}
                  accessibilityState={{ selected }}
                  style={[
                    styles.chip,
                    { borderColor: selected ? colors.primary : colors.border },
                    selected && { backgroundColor: colors.primary },
                  ]}
                >
                  {type.color && <View style={[styles.dot, { backgroundColor: type.color, marginLeft: 0 }]} />}
                  <Text style={[styles.chipText, { color: selected ? colors.onPrimary : colors.text }]}>{type.name}</Text>
                </TouchableOpacity>
              );
            }
          )}
        </ScrollView>

        {/* Granularity (p69): completions only, or with % milestones */}
        <View style={[styles.granularity, { backgroundColor: colors.backgroundSecondary }]} accessibilityRole="radiogroup">
          {FORECAST_GRANULARITIES.map(({ key, label }) => {
            const selected = granularity === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setGranularity(key)}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ selected, checked: selected }}
                style={[styles.granularityButton, selected && { backgroundColor: colors.surface }]}
              >
                <Text
                  style={[
                    styles.granularityText,
                    { color: selected ? colors.text : colors.textSecondary },
                    selected && { fontWeight: '600' },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {emptyMessage && (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{emptyMessage}</Text>
        )}

        <View style={styles.body}>
          {cursor.zoom === 'month' && renderMonth()}
          {cursor.zoom === 'week' && renderWeek()}
          {cursor.zoom === 'day' && renderDay()}
        </View>

        {/* Goals the calendar cannot place */}
        {unscheduled.total > 0 && (
          <View style={[styles.unscheduled, { borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setShowUnscheduled((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showUnscheduled }}
              accessibilityLabel={`${unscheduled.headline}. ${showUnscheduled ? 'Hide' : 'Show'} which`}
              style={styles.unscheduledHeader}
            >
              <Text style={[styles.unscheduledText, { color: colors.textSecondary }]}>
                {showUnscheduled ? '▾' : '▸'} {unscheduled.headline}
              </Text>
            </TouchableOpacity>
            {showUnscheduled &&
              unscheduled.items.map((item) => (
                <Text key={item.goalId} style={[styles.unscheduledItem, { color: colors.text }]}>
                  {item.goalName}
                  <Text style={{ color: colors.textSecondary }}> — {item.text}</Text>
                </Text>
              ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    // p69 is a landscape month; wide enough for names at 1920px, not a 1900px-wide grid.
    maxWidth: 1100,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: {
    flex: 1,
    marginRight: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  todayTouchTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  todayButton: {
    fontSize: 16,
    fontWeight: '500',
  },
  segment: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  segmentButton: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
  },
  navButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonText: {
    fontSize: 28,
    fontWeight: '300',
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  chipRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    marginLeft: 4,
  },
  granularity: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: 8,
    padding: 3,
  },
  granularityButton: {
    flex: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  granularityText: {
    fontSize: 13,
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  gridRow: {
    flexDirection: 'row',
  },
  monthCell: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
  },
  monthCellInner: {
    flex: 1,
  },
  dayNumber: {
    fontSize: 11,
    textAlign: 'right',
  },
  dayNumberToday: {
    fontWeight: '700',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  entryName: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginLeft: 3,
  },
  hollowDot: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  tick: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 2,
  },
  badge: {
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 2,
  },
  more: {
    fontSize: 10,
    marginTop: 1,
  },
  dotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 4,
    gap: 2,
  },
  count: {
    fontSize: 10,
    marginLeft: 2,
  },
  hint: {
    fontSize: 11,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  weekColumn: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 160,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 2,
  },
  weekDayName: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  weekDayNumber: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  weekEmpty: {
    textAlign: 'center',
  },
  weekSlice: {
    borderLeftWidth: 3,
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 2,
    marginBottom: 3,
  },
  weekSliceName: {
    fontSize: 11,
    fontWeight: '500',
  },
  weekSliceTime: {
    fontSize: 9,
  },
  ribbon: {
    marginTop: spacing.sm,
  },
  daySection: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  dayEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  dayEntryText: {
    flex: 1,
    fontSize: 14,
    marginLeft: spacing.xs,
  },
  dayListRow: {
    borderLeftWidth: 4,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginBottom: 4,
  },
  dayListText: {
    fontSize: 14,
  },
  dayListDone: {
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  unscheduled: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    paddingTop: spacing.xs,
  },
  unscheduledHeader: {
    minHeight: 36,
    justifyContent: 'center',
  },
  unscheduledText: {
    fontSize: 13,
  },
  unscheduledItem: {
    fontSize: 13,
    marginLeft: spacing.md,
    marginBottom: 2,
  },
});
