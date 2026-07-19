import React, { useState, useMemo } from 'react';
import { Modal, StyleSheet, View, Text, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Radius, Spacing } from '@/src/theme';
import { PressableScale } from './PressableScale';
import { SafeAreaView } from 'react-native-safe-area-context';

interface CalendarModalProps {
  visible: boolean;
  onClose: () => void;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  activeDates?: string[];
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function CalendarModal({
  visible,
  onClose,
  value,
  onChange,
  minimumDate = new Date(),
  activeDates,
}: CalendarModalProps) {
  const minDate = useMemo(() => {
    const d = new Date(minimumDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [minimumDate]);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date(value);
    d.setDate(1);
    return d;
  });

  const [selectedDate, setSelectedDate] = useState(() => new Date(value));

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const daysGrid = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const grid = [];
    for (let i = 0; i < firstDayIndex; i++) {
      grid.push(null);
    }
    for (let day = 1; day <= totalDays; day++) {
      grid.push(new Date(year, month, day));
    }
    return grid;
  }, [year, month]);

  const handlePrevMonth = () => {
    setCurrentMonth(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  const handleSelectDay = (date: Date) => {
    setSelectedDate(date);
  };

  const handleConfirm = () => {
    onChange(selectedDate);
    onClose();
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (date: Date) => {
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  const isDisabled = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < minDate.getTime()) return true;

    if (activeDates) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      return !activeDates.includes(dateKey);
    }

    return false;
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.modalCard}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerTitle}>Seleccionar Fecha</Text>
            <PressableScale
              onPress={onClose}
              style={s.closeBtn}
              accessibilityLabel="Cerrar calendario"
              accessibilityRole="button"
            >
              <MaterialIcons name="close" size={24} color={Colors.foreground} />
            </PressableScale>
          </View>

          {/* Content Wrapper inside a brand style container */}
          <View style={s.cardBody}>
            <View style={s.calendarCard}>
              {/* Month Navigator */}
              <View style={s.monthRow}>
                <PressableScale
                  onPress={handlePrevMonth}
                  style={s.navBtn}
                  accessibilityLabel="Mes anterior"
                  accessibilityRole="button"
                >
                  <MaterialIcons name="chevron-left" size={24} color={Colors.foreground} />
                </PressableScale>
                <Text style={s.monthText}>{`${MONTHS[month]} ${year}`}</Text>
                <PressableScale
                  onPress={handleNextMonth}
                  style={s.navBtn}
                  accessibilityLabel="Mes siguiente"
                  accessibilityRole="button"
                >
                  <MaterialIcons name="chevron-right" size={24} color={Colors.foreground} />
                </PressableScale>
              </View>

              {/* Weekdays */}
              <View style={s.weekdaysRow}>
                {WEEKDAYS.map((day, idx) => (
                  <Text key={idx} style={s.weekdayText}>{day}</Text>
                ))}
              </View>

              {/* Days Grid */}
              <View style={s.grid}>
                {daysGrid.map((date, idx) => {
                  if (!date) {
                    return <View key={`empty-${idx}`} style={s.dayCell} />;
                  }

                  const active = isSelected(date);
                  const disabled = isDisabled(date);
                  const today = isToday(date);

                  return (
                    <Pressable
                      key={`day-${date.getTime()}`}
                      onPress={() => !disabled && handleSelectDay(date)}
                      disabled={disabled}
                      style={s.dayCell}
                      accessibilityLabel={`Día ${date.getDate()} de ${MONTHS[month]}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled, selected: active }}
                    >
                      <View style={[
                        s.dayButton,
                        active && s.dayActive,
                        today && !active && s.dayToday
                      ]}>
                        <Text style={[
                          s.dayText,
                          active && s.dayTextActive,
                          disabled && s.dayTextDisabled
                        ]}>
                          {date.getDate()}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* CTA Confirm Button */}
          <View style={s.footer}>
            <PressableScale
              onPress={handleConfirm}
              style={s.confirmBtn}
              accessibilityLabel="Confirmar selección de fecha"
              accessibilityRole="button"
            >
              <Text style={s.confirmText}>Confirmar Fecha</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.background,
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    paddingVertical: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: Typography.sizes.xl,
    color: Colors.foreground,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  calendarCard: {
    backgroundColor: Colors.surface, // #F0EFEB
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  monthText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: 16,
    color: Colors.foreground,
    textTransform: 'capitalize',
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.semibold,
    color: Colors.mutedForeground,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xs,
  },
  dayButton: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayActive: {
    backgroundColor: Colors.accent, // #4A7FF8
  },
  dayToday: {
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  dayText: {
    fontFamily: Typography.family,
    fontWeight: Typography.weights.medium,
    fontSize: 14,
    color: Colors.foreground,
  },
  dayTextActive: {
    color: Colors.white,
    fontWeight: Typography.weights.bold,
  },
  dayTextDisabled: {
    color: Colors.mutedForeground + '60',
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  confirmBtn: {
    backgroundColor: Colors.accent,
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    color: Colors.white,
    fontFamily: Typography.family,
    fontWeight: Typography.weights.bold,
    fontSize: Typography.sizes.base,
  },
});
