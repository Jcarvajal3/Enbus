import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { CaretLeft, CaretRight, X } from 'phosphor-react-native';
import { Button, IconButton, Text } from '@/src/components/ui';
import { Colors, Layout, Opacity, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

interface CalendarModalProps {
  visible: boolean;
  onClose: () => void;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  /** `YYYY-MM-DD` keys that have departures. Days outside the list are disabled. */
  activeDates?: string[];
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

export function CalendarModal({
  visible,
  onClose,
  value,
  onChange,
  minimumDate,
  activeDates,
}: CalendarModalProps) {
  // Defensive: callers have passed an undefined `value` before, which produced
  // an Invalid Date and a grid full of NaN.
  const safeValue = useMemo(
    () => (value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date()),
    [value]
  );

  const minDate = useMemo(() => {
    const d = minimumDate ? new Date(minimumDate) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [minimumDate]);

  const [selected, setSelected] = useState(() => new Date(safeValue));
  const [cursor, setCursor] = useState(() => {
    const d = new Date(safeValue);
    d.setDate(1);
    return d;
  });

  // Re-sync when the sheet is reopened with a different value.
  useEffect(() => {
    if (!visible) return;
    setSelected(new Date(safeValue));
    const first = new Date(safeValue);
    first.setDate(1);
    setCursor(first);
  }, [visible, safeValue]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const grid = useMemo(() => {
    const leading = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= days; day += 1) cells.push(new Date(year, month, day));
    return cells;
  }, [year, month]);

  const isDisabled = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < minDate.getTime()) return true;
    if (activeDates) return !activeDates.includes(dateKey(date));
    return false;
  };

  const shiftMonth = (delta: number) => {
    setCursor((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  };

  const availableThisMonth = useMemo(() => {
    if (!activeDates) return null;
    return activeDates.filter((key) => key.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
      .length;
  }, [activeDates, year, month]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Cerrar calendario"
          accessibilityRole="button"
        />

        <View style={s.card}>
          <View style={s.header}>
            <Text variant="heading">Seleccionar fecha</Text>
            <IconButton icon={X} label="Cerrar calendario" onPress={onClose} size="md" />
          </View>

          <View style={s.calendar}>
            <View style={s.monthRow}>
              <IconButton
                icon={CaretLeft}
                label="Mes anterior"
                onPress={() => shiftMonth(-1)}
                size="md"
                variant="inverse"
              />
              <Text variant="subheading" align="center">
                {`${MONTHS[month]} ${year}`}
              </Text>
              <IconButton
                icon={CaretRight}
                label="Mes siguiente"
                onPress={() => shiftMonth(1)}
                size="md"
                variant="inverse"
              />
            </View>

            <View style={s.weekdays}>
              {WEEKDAYS.map((day) => (
                <Text key={day} variant="caption" color="muted" align="center" style={s.weekday}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={s.grid}>
              {grid.map((date, index) => {
                if (!date) return <View key={`pad-${index}`} style={s.cell} />;

                const active = sameDay(date, selected);
                const disabled = isDisabled(date);
                const today = sameDay(date, new Date());

                return (
                  <Pressable
                    key={dateKey(date)}
                    onPress={() => !disabled && setSelected(date)}
                    disabled={disabled}
                    style={s.cell}
                    accessibilityRole="button"
                    accessibilityLabel={`${date.getDate()} de ${MONTHS[month]}${
                      disabled ? ', sin viajes' : ''
                    }`}
                    accessibilityState={{ disabled, selected: active }}
                  >
                    <View
                      style={[
                        s.day,
                        active && s.dayActive,
                        today && !active && s.dayToday,
                        disabled && s.dayDisabled,
                      ]}
                    >
                      <Text
                        variant="label"
                        weight={active ? 'bold' : 'medium'}
                        color={active ? 'inverse' : disabled ? 'muted' : 'foreground'}
                        compact
                      >
                        {String(date.getDate())}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {availableThisMonth === 0 && (
              <Text variant="caption" color="muted" align="center" style={s.hint}>
                No hay salidas este mes. Prueba el mes siguiente.
              </Text>
            )}
          </View>

          <View style={s.footer}>
            <Button
              variant="accent"
              fullWidth
              disabled={isDisabled(selected)}
              onPress={() => {
                onChange(selected);
                onClose();
              }}
            >
              Confirmar fecha
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: Layout.modalMaxWidth,
    backgroundColor: Colors.background,
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    ...Shadows.overlay,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  calendar: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  weekdays: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  weekday: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xs / 2,
  },
  day: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayActive: {
    backgroundColor: Colors.accent,
  },
  dayToday: {
    borderWidth: Sizes.hairline,
    borderColor: Colors.accent,
  },
  dayDisabled: {
    opacity: Opacity.disabled,
  },
  hint: {
    marginTop: Spacing.md,
  },
  footer: {
    padding: Spacing.xl,
  },
});
