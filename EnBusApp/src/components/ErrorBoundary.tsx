import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '@/src/theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error inside ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={s.container}>
          <View style={s.card}>
            <View style={s.badge}>
              <Text style={s.badgeText}>⚠️ ERROR DE APLICACIÓN</Text>
            </View>
            <Text style={s.title}>Algo salió mal</Text>
            <Text style={s.message}>
              Ocurrió un error inesperado al renderizar esta pantalla. Por favor, intenta de nuevo o regresa al inicio.
            </Text>

            {__DEV__ && this.state.error && (
              <View style={s.debugContainer}>
                <Text style={s.debugTitle}>Detalles técnicos (Desarrollo):</Text>
                <Text style={s.debugText}>{this.state.error.toString()}</Text>
              </View>
            )}

            <Pressable
              onPress={this.handleReset}
              style={s.button}
              accessibilityLabel="Reintentar"
              accessibilityRole="button"
            >
              <Text style={s.buttonText}>Reintentar</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing['2xl'],
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing['2xl'],
    width: '100%',
    alignItems: 'center',
    ...Shadows.card,
  },
  badge: {
    backgroundColor: Colors.warningLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    marginBottom: Spacing.lg,
  },
  badgeText: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.warning,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes['2xl'],
    fontWeight: Typography.weights.bold,
    color: Colors.foreground,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  message: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.regular,
    color: Colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing['2xl'],
  },
  debugContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    width: '100%',
    marginBottom: Spacing['2xl'],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  debugTitle: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.mutedForeground,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  debugText: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.xs,
    color: Colors.destructive,
  },
  button: {
    height: Spacing['5xl'],
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['3xl'],
  },
  buttonText: {
    fontFamily: Typography.family,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
    color: Colors.primaryForeground,
  },
});
