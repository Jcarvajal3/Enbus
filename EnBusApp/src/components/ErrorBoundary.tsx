import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ErrorState, Text } from '@/src/components/ui';
import { Colors, Layout, Radius, Spacing } from '@/src/theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Pantalla de error cuando algo se rompe al dibujar: el mismo `ErrorState` de
 * toda la app (`WarningCircle` + "Reintentar"), sobre el fondo de pantalla.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Solo para el registro de desarrollo; el usuario ya ve la pantalla de error.
    console.error('Uncaught error inside ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <View style={s.container}>
        <ErrorState
          title="Algo salió mal"
          description="No pudimos mostrar esta pantalla. Intenta de nuevo."
          onRetry={this.handleReset}
        />

        {__DEV__ && this.state.error && (
          <View style={s.debug}>
            <Text variant="caption" weight="semibold" color="muted">
              Detalles técnicos (desarrollo)
            </Text>
            <ScrollView style={s.debugScroll}>
              <Text variant="caption" color="dangerText">
                {this.state.error.toString()}
              </Text>
            </ScrollView>
          </View>
        )}
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPadding,
  },
  debug: {
    gap: Spacing.xs,
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  debugScroll: {
    maxHeight: 120,
  },
});
