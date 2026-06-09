import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

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

            <Pressable onPress={this.handleReset} style={s.button}>
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
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  badge: {
    backgroundColor: '#FDF5D3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    marginBottom: 16,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D4A017',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Lora-Bold',
    fontWeight: 'bold',
    color: '#171717',
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    color: '#737373',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  debugContainer: {
    backgroundColor: '#F4F4F5',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  debugTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#71717A',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  debugText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#EF4444',
  },
  button: {
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E2B714',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B4A1A',
  },
});
