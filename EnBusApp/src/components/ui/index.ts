/**
 * EnBus UI kit.
 *
 * Screens import from here and nowhere else for presentation. If a screen needs
 * a raw `View` + `StyleSheet` block to express something, that's a signal the
 * primitive is missing — add it here rather than styling in place.
 *
 *   import { Screen, ScreenHeader, Card, Text, Button } from '@/src/components/ui';
 */

import type { ReactElement, Ref } from 'react';
import type { TextInput } from 'react-native';
import { Field as FieldBase, type FieldProps } from './Field';

export { Text, TextLink, fontStyle, textStyles } from './Text';
export type { TextProps, TextColorToken } from './Text';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { IconButton } from './IconButton';
export type { IconButtonProps, IconButtonVariant } from './IconButton';

export { Atmosfera } from './Atmosfera';
export { Aviso } from './Aviso';
export type { AvisoTono } from './Aviso';
export type { AtmosferaVariante } from './Atmosfera';

export { Card, IconTile, SectionLabel, Divider, Perforacion, InfoRow } from './Card';
export type { CardProps, CardTone, CardPadding, IconTileTone } from './Card';

export { Badge, StatusBadge, CountPill, Chip } from './Badge';
export type { BadgeProps } from './Badge';

export { SegmentedControl } from './SegmentedControl';
export type { SegmentOption, SegmentedControlProps } from './SegmentedControl';

export { ScreenHeader, StepIndicator } from './ScreenHeader';
export type { ScreenHeaderProps, ScreenHeaderVariant } from './ScreenHeader';

export {
  Screen,
  Gutter,
  EvitarTeclado,
  FloatingBar,
  EmptyState,
  ErrorState,
  StaleBanner,
  scrollContent,
} from './Screen';

export { EntityCard } from './EntityCard';
export type { EntityCardProps } from './EntityCard';

export { RouteSummary } from './RouteSummary';
export type { RouteSummaryProps } from './RouteSummary';

export { BottomSheet } from './BottomSheet';
export type { BottomSheetProps } from './BottomSheet';

export { ConfirmSheet, ConfirmProvider, useConfirm } from './ConfirmSheet';
export type { ConfirmOptions } from './ConfirmSheet';

export { SelectField, FieldMessage } from './Field';
export type { FieldProps, FieldTone } from './Field';

/**
 * `Field` acepta `ref` al `TextInput` (para encadenar "Siguiente" con
 * `returnKeyType` y `onSubmitEditing`). React 19 pasa `ref` como una prop más
 * y `Field` la reenvía al `TextInput` con `...rest`; aquí solo se tipa.
 */
export const Field = FieldBase as unknown as (
  props: FieldProps & { ref?: Ref<TextInput> }
) => ReactElement;

export { CifraMonto, Monto } from './Monto';
export type { MontoProps, MontoSize } from './Monto';
