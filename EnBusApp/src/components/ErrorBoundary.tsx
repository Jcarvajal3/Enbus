import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { WarningCircle } from 'phosphor-react-native';
import { Button, Card, Text } from '@/src/components/ui';
import { Colors, Radius, Sizes, Spacing } from '@/src/theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

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
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <View style={s.container}>
        <Card padding="lg" style={s.card}>
          <View style={s.icon}>
            <WarningCircle weight="fill" color={Colors.warning} size={Sizes.icon['2xl']} />
          </View>

          <Text variant="heading" size="2xl" align="center">
            Algo salió mal
          </Text>
          <Text variant="secondary" color="muted" align="center" style={s.message}>
            Ocurrió un error inesperado al mostrar esta pantalla. Intenta de nuevo; si persiste,
            vuelve al inicio.
          </Text>

          {__DEV__ && this.state.error && (
            <View style={s.debug}>
              <Text variant="overline" color="muted" uppercase>
                Detalles técnicos (desarrollo)
              </Text>
              <ScrollView style={s.debugScroll}>
                <Text variant="caption" color="danger">
                  {this.state.error.toString()}
                </Text>
              </ScrollView>
            </View>
          )}

          <Button variant="primary" fullWidth onPress={this.handleReset}>
            Reintentar
          </Button>
        </Card>
      </View>
    );
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
    width: '100%',
  },
  icon: {
    width: Sizes.iconBox.xl,
    height: Sizes.iconBox.xl,
    borderRadius: Radius.full,
    backgroundColor: Colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  message: {
    marginTop: Spacing.sm,
    marginBottom: Spacing['2xl'],
  },
  debug: {
    width: '100%',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: Sizes.hairline,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing['2xl'],
  },
  debugScroll: {
    maxHeight: 120,
  },
});
