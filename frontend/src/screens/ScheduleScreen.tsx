import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';

import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Shift } from '../types';
import { Colors, Typography, Spacing, BorderRadius, Shadows, SHIFT_CONFIG, STATUS_CONFIG } from '../utils/theme';

const SHIFT_ORDER = { DAY: 0, EVENING: 1, NIGHT: 2 };

export default function ScheduleScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [viewMonth, setViewMonth] = useState(new Date());

  const isManager = user?.role !== 'STAFF';

  // Fetch shifts for the visible month
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['shifts', format(viewMonth, 'yyyy-MM'), user?.id, isManager],
    queryFn: async () => {
      const params: Record<string, string> = {
        startDate: format(startOfMonth(viewMonth), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(viewMonth), 'yyyy-MM-dd'),
        isPublished: isManager ? 'false' : 'true',
      };
      // Staff only see their own shifts
      if (!isManager) params.userId = user!.id;

      const { data } = await api.get<{ data: Shift[] }>('/shifts', { params });
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Build calendar marked dates
  const markedDates: Record<string, { dots: Array<{ color: string }>; selected?: boolean; selectedColor?: string }> =
    React.useMemo(() => {
      const marks: typeof markedDates = {};
      (data || []).forEach(shift => {
        const dateKey = shift.date.split('T')[0];
        const config = SHIFT_CONFIG[shift.shiftType];
        if (!marks[dateKey]) marks[dateKey] = { dots: [] };
        if (!marks[dateKey].dots.find(d => d.color === config.color)) {
          marks[dateKey].dots.push({ color: config.color });
        }
      });
      if (selectedDate) {
        marks[selectedDate] = {
          ...(marks[selectedDate] || { dots: [] }),
          selected: true,
          selectedColor: Colors.primary,
        };
      }
      return marks;
    }, [data, selectedDate]);

  // Shifts for selected day
  const dayShifts = React.useMemo(() => {
    return (data || [])
      .filter(s => s.date.split('T')[0] === selectedDate)
      .sort((a, b) => SHIFT_ORDER[a.shiftType] - SHIFT_ORDER[b.shiftType]);
  }, [data, selectedDate]);

  const renderShiftCard = useCallback(({ item: shift }: { item: Shift }) => {
    const shiftConfig = SHIFT_CONFIG[shift.shiftType];
    const statusConfig = STATUS_CONFIG[shift.status];

    return (
      <TouchableOpacity
        style={styles.shiftCard}
        onPress={() => router.push(`/shift/${shift.id}`)}
        activeOpacity={0.85}
      >
        {/* Colored left accent bar */}
        <View style={[styles.shiftAccent, { backgroundColor: shiftConfig.color }]} />

        <View style={styles.shiftContent}>
          <View style={styles.shiftHeader}>
            <View style={[styles.shiftTypeBadge, { backgroundColor: shiftConfig.bgColor }]}>
              <Ionicons name={shiftConfig.icon as any} size={12} color={shiftConfig.color} />
              <Text style={[styles.shiftTypeText, { color: shiftConfig.color }]}>
                {shiftConfig.label}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>

          <Text style={styles.shiftTime}>{shiftConfig.time}</Text>
          <Text style={styles.shiftUnit}>{shift.unit.name}</Text>

          {shift.assignedTo && (
            <View style={styles.staffRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {shift.assignedTo.firstName[0]}{shift.assignedTo.lastName[0]}
                </Text>
              </View>
              <View>
                <Text style={styles.staffName}>
                  {shift.assignedTo.firstName} {shift.assignedTo.lastName}
                </Text>
                {shift.assignedTo.position && (
                  <Text style={styles.staffPosition}>{shift.assignedTo.position}</Text>
                )}
              </View>
            </View>
          )}

          {!shift.assignedToId && (
            <View style={styles.openShiftRow}>
              <Ionicons name="alert-circle-outline" size={14} color={Colors.warning} />
              <Text style={styles.openShiftText}>Needs coverage</Text>
            </View>
          )}

          {/* Clock-in indicator */}
          {shift.clockIn?.clockInAt && !shift.clockIn.clockOutAt && (
            <View style={styles.clockedInRow}>
              <View style={styles.clockedInDot} />
              <Text style={styles.clockedInText}>Currently clocked in</Text>
            </View>
          )}
        </View>

        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    );
  }, [router]);

  return (
    <View style={styles.container}>
      {/* Calendar */}
      <Calendar
        current={selectedDate}
        onDayPress={day => setSelectedDate(day.dateString)}
        onMonthChange={month => setViewMonth(new Date(month.year, month.month - 1, 1))}
        markingType="multi-dot"
        markedDates={markedDates}
        theme={{
          backgroundColor: Colors.surface,
          calendarBackground: Colors.surface,
          textSectionTitleColor: Colors.textMuted,
          selectedDayBackgroundColor: Colors.primary,
          selectedDayTextColor: Colors.textInverse,
          todayTextColor: Colors.primary,
          dayTextColor: Colors.textPrimary,
          dotColor: Colors.primary,
          arrowColor: Colors.primary,
          monthTextColor: Colors.textPrimary,
          textDayFontWeight: Typography.medium,
          textMonthFontWeight: Typography.bold,
          textDayHeaderFontSize: Typography.xs,
        }}
        style={styles.calendar}
      />

      {/* Shifts for selected day */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          {format(parseISO(selectedDate), 'EEEE, MMM d')}
        </Text>
        <Text style={styles.shiftCount}>
          {dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loader} color={Colors.primary} />
      ) : (
        <FlatList
          data={dayShifts}
          keyExtractor={item => item.id}
          renderItem={renderShiftCard}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No shifts scheduled</Text>
              <Text style={styles.emptyText}>
                {isManager
                  ? 'Generate a schedule for this month to see shifts here.'
                  : 'You have no shifts scheduled for this day.'}
              </Text>
            </View>
          }
        />
      )}

      {/* FAB for managers to add a shift */}
      {isManager && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/shift/create')}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={24} color={Colors.textInverse} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  calendar: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  listTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  shiftCount: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
  list: { padding: Spacing.base, gap: Spacing.md },
  loader: { flex: 1, marginTop: 60 },
  shiftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.md,
  },
  shiftAccent: {
    width: 4,
    alignSelf: 'stretch',
  },
  shiftContent: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  shiftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  shiftTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  shiftTypeText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: Typography.xs,
    fontWeight: Typography.medium,
  },
  shiftTime: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  shiftUnit: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: Colors.textInverse,
  },
  staffName: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.textPrimary,
  },
  staffPosition: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  openShiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
  },
  openShiftText: {
    fontSize: Typography.xs,
    color: Colors.warning,
    fontWeight: Typography.medium,
  },
  clockedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xs,
  },
  clockedInDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  clockedInText: {
    fontSize: Typography.xs,
    color: Colors.success,
    fontWeight: Typography.medium,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    color: Colors.textSecondary,
  },
  emptyText: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: Spacing.xxl,
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
});
