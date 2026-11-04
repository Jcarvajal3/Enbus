/**
 * CalendarModal — selector de fecha (APP-18), en la hoja inferior común
 * (`BottomSheet`, AU-25/AU-33), como los demás selectores.
 *
 * Por defecto un toque en un día lo elige y cierra (`seleccionRapida`). Arriba,
 * atajos "Hoy", "Mañana" y los siguientes días con salida; un punto bajo cada
 * día con salida (`activeDates`); no se puede ir a meses anteriores al de
 * `minimumDate` ni posteriores al de `maximumDate`. Con
 * `seleccionRapida={false}` se elige y luego se toca "Confirmar fecha".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CaretLeft, CaretRight } from 'phosphor-react-native';
import { BottomSheet, Button, Chip, IconButton, Text } from '@/src/components/ui';
import { Colors, Layout, Opacity, Radius, Shadows, Sizes, Spacing } from '@/src/theme';

interface CalendarModalProps {
  visible: boolean;
  onClose: () => void;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  /** Last selectable day (inclusive). Used to block future dates, e.g. a payment date. */
  maximumDate?: Date;
  /** `YYYY-MM-DD` keys that have departures. Days outside the list are disabled. */
  activeDates?: string[];
  /** Título de la hoja. Por defecto "Fecha". */
  title?: string;
  /**
   * `true` (por defecto): tocar un día (o un atajo) lo elige y cierra, sin
   * "Confirmar fecha". `false`: se elige y se confirma con el botón.
   */
  seleccionRapida?: boolean;
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEKDAYS_SHORT = ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'];
const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** "Hoy", "Mañana" y los siguientes días con salida: como mucho 6 atajos. */
const MAX_ATAJOS = 6;
/** Hasta dónde se buscan días con salida para los atajos. */
const DIAS_BUSQUEDA_ATAJOS = 90;

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Meses desde el año 0, para comparar meses sin mirar el día. */
function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

function firstOfMonth(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

/** "sábado 5 de octubre" */
function longDay(date: Date): string {
  return `${WEEKDAYS_LONG[date.getDay()]} ${date.getDate()} de ${MONTHS[date.getMonth()].toLowerCase()}`;
}

export function CalendarModal({
  visible,
  onClose,
  value,
  onChange,
  minimumDate,
  maximumDate,
  activeDates,
  title = 'Fecha',
  seleccionRapida = true,
}: CalendarModalProps) {
  // Defensive: callers have passed an undefined `value` before, which produced
  // an Invalid Date and a grid full of NaN.
  const safeValue = useMemo(
    () => (value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date()),
    [value]
  );

  const minDate = useMemo(
    () => startOfDay(minimumDate ? new Date(minimumDate) : new Date()),
    [minimumDate]
  );

  const maxDate = useMemo(
    () => (maximumDate ? startOfDay(new Date(maximumDate)) : null),
    [maximumDate]
  );

  const activeSet = useMemo(() => (activeDates ? new Set(activeDates) : null), [activeDates]);

  const [selected, setSelected] = useState(() => new Date(safeValue));
  const [cursor, setCursor] = useState(() => firstOfMonth(safeValue));

  // Re-sync when the sheet is reopened with a different value, never showing a
  // month before `minimumDate`'s.
  useEffect(() => {
    if (!visible) return;
    setSelected(new Date(safeValue));
    setCursor(firstOfMonth(monthIndex(safeValue) < monthIndex(minDate) ? minDate : safeValue));
  }, [visible, safeValue, minDate]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const grid = useMemo(() => {
    const leading = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= days; day += 1) cells.push(new Date(year, month, day));
    return cells;
  }, [year, month]);

  const isDisabled = useMemo(
    () => (date: Date) => {
      const d = startOfDay(date);
      if (d.getTime() < minDate.getTime()) return true;
      if (maxDate && d.getTime() > maxDate.getTime()) return true;
      if (activeSet) return !activeSet.has(dateKey(d));
      return false;
    },
    [minDate, maxDate, activeSet]
  );

  const canGoBack = monthIndex(cursor) > monthIndex(minDate);
  const canGoForward = !maxDate || monthIndex(cursor) < monthIndex(maxDate);

  const shiftMonth = (delta: number) => {
    if ((delta < 0 && !canGoBack) || (delta > 0 && !canGoForward)) return;
    setCursor((prev) => {
      const d = new Date(prev);
      d.setDate(1);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  };

  const choose = (date: Date) => {
    if (isDisabled(date)) return;
    if (seleccionRapida) {
      onChange(date);
      onClose();
      return;
    }
    setSelected(date);
    setCursor(firstOfMonth(date));
  };

  // "Hoy" y "Mañana" (si se pueden elegir) y, con `activeDates`, los siguientes
  // días con salida ("sáb. 5").
  const shortcuts = useMemo(() => {
    const today = startOfDay(new Date());
    const out: { date: Date; label: string; a11y: string }[] = [];
    for (let i = 0; i < DIAS_BUSQUEDA_ATAJOS && out.length < MAX_ATAJOS; i += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      if (maxDate && d.getTime() > maxDate.getTime()) break;
      if (i > 1 && !activeSet) break;
      if (isDisabled(d)) continue;
      if (i === 0) out.push({ date: d, label: 'Hoy', a11y: `Hoy, ${longDay(d)}` });
      else if (i === 1) out.push({ date: d, label: 'Mañana', a11y: `Mañana, ${longDay(d)}` });
      else out.push({ date: d, label: `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}`, a11y: longDay(d) });
    }
    return out;
  }, [activeSet, maxDate, isDisabled]);

  const availableThisMonth = useMemo(() => {
    if (!activeDates) return null;
    return activeDates.filter((key) => key.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
      .length;
  }, [activeDates, year, month]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        seleccionRapida ? undefined : (
          <Button
            fullWidth
            disabled={isDisabled(selected)}
            onPress={() => {
              onChange(selected);
              onClose();
            }}
          >
            Confirmar fecha
          </Button>
        )
      }
    >
      <ScrollView contentContainerStyle={s.contenido} showsVerticalScrollIndicator={false}>
        {shortcuts.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // Sale del margen de la hoja para llegar al borde, y deja el mismo margen al final.
            style={s.shortcutsScroll}
            contentContainerStyle={s.shortcuts}
            accessibilityLabel="Fechas rápidas"
          >
            {shortcuts.map((sc) => (
              <Chip
                key={dateKey(sc.date)}
                label={sc.label}
                selected={sameDay(sc.date, selected)}
                onPress={() => choose(sc.date)}
                accessibilityLabel={sc.a11y}
              />
            ))}
          </ScrollView>
        )}

        <View style={s.calendar}>
          <View style={s.monthRow}>
            <IconButton
              icon={CaretLeft}
              label="Mes anterior"
              onPress={() => shiftMonth(-1)}
              disabled={!canGoBack}
              size="md"
              variant="surface"
            />
            <Text variant="heading" align="center">
              {`${MONTHS[month]} ${year}`}
            </Text>
            <IconButton
              icon={CaretRight}
              label="Mes siguiente"
              onPress={() => shiftMonth(1)}
              disabled={!canGoForward}
              size="md"
              variant="surface"
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
              const conSalida = !!activeSet && !disabled;

              const a11y = [
                longDay(date),
                today ? 'hoy' : '',
                conSalida ? 'con salidas' : '',
                disabled ? (activeDates ? 'sin viajes' : 'no disponible') : '',
              ]
                .filter(Boolean)
                .join(', ');

              return (
                <Pressable
                  key={dateKey(date)}
                  onPress={() => choose(date)}
                  disabled={disabled}
                  style={s.cell}
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
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
                      weight={active ? 'bold' : conSalida ? 'semibold' : 'medium'}
                      color={active ? 'inverse' : disabled ? 'muted' : 'foreground'}
                      compact
                    >
                      {String(date.getDate())}
                    </Text>
                    {conSalida ? <View style={[s.dot, active && s.dotActive]} /> : null}
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
      </ScrollView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  contenido: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing['2xl'],
  },
  shortcutsScroll: {
    marginHorizontal: -Layout.screenPadding,
    marginBottom: Spacing.xl,
  },
  shortcuts: {
    gap: Spacing.sm,
    paddingHorizontal: Layout.screenPadding,
  },
  calendar: {},
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
    padding: Sizes.hairline,
  },
  day: {
    width: '100%',
    height: '100%',
    maxWidth: Sizes.touchTarget,
    maxHeight: Sizes.touchTarget,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayActive: {
    backgroundColor: Colors.accentStrong,
    ...Shadows.sky,
  },
  dayToday: {
    borderWidth: Sizes.borderStrong,
    borderColor: Colors.accent,
  },
  dayDisabled: {
    opacity: Opacity.disabled,
  },
  /** Punto bajo los días con salida: el sol marca dónde hay viaje. */
  dot: {
    position: 'absolute',
    bottom: Spacing.xs,
    width: Sizes.dot - Sizes.hairline,
    height: Sizes.dot - Sizes.hairline,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryDeep,
  },
  dotActive: {
    backgroundColor: Colors.primary,
  },
  hint: {
    marginTop: Spacing.md,
  },
});
