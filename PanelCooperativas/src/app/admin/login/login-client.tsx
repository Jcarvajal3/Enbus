"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Shield, WarningCircle, GoogleLogo } from "@phosphor-icons/react";

export default function AdminLoginClient() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user) {
        setError("Credenciales inválidas");
        setLoading(false);
        return;
      }

      // Obtener el perfil para verificar que sea super_admin
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setError("Error al verificar los permisos del perfil");
        setLoading(false);
        return;
      }

      if (profile.role !== "super_admin") {
        await supabase.auth.signOut();
        setError("Acceso denegado: No tiene permisos de administrador");
        setLoading(false);
        return;
      }

      router.push("/admin/dashboard");
      router.refresh();
    } catch {
      setError("Ocurrió un error inesperado. Intente de nuevo.");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/admin/auth/callback`,
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch {
      setError("Ocurrió un error al iniciar sesión con Google.");
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Panel Izquierdo Decorativo (Oculto en mobile) */}
      <div className="hidden w-3/5 flex-col justify-between bg-slate-950 p-12 text-white lg:flex border-r border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-orange-600">
            <Shield weight="fill" className="size-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">EnBus</span>
        </div>
        
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl font-bold leading-tight">
            Panel de <br />
            <span className="text-orange-500">Administración</span>
          </h1>
          <p className="text-xl text-slate-400">
            Supervisión global, tarifas, comisiones y control de cooperativas.
          </p>
        </div>
        
        <p className="text-sm text-slate-500">
          &copy; {new Date().getFullYear()} EnBus. Todos los derechos reservados.
        </p>
      </div>

      {/* Panel Derecho con Formulario */}
      <div className="flex w-full items-center justify-center p-6 lg:w-2/5 bg-slate-900 lg:bg-slate-950">
        <Card className="w-full max-w-sm border-slate-800 bg-slate-900/50 backdrop-blur-xl">
          <CardHeader>
            <div className="mb-4 flex justify-center lg:hidden">
              <div className="flex size-12 items-center justify-center rounded-lg bg-orange-600">
                <Shield weight="fill" className="size-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl text-white">Iniciar Sesión</CardTitle>
            <CardDescription className="text-slate-400">Acceso al Panel Super Admin EnBus</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-6">
              {error && (
                <Alert variant="destructive" className="border-red-900/50 bg-red-950/20 text-red-200">
                  <WarningCircle className="size-4" data-icon="inline-start" />
                  <AlertTitle>Error de acceso</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="email" className="text-slate-300">Correo Electrónico</FieldLabel>
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="admin@enbus.com" 
                      required 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading || googleLoading}
                      className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 focus-visible:ring-orange-500"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="password" className="text-slate-300">Contraseña</FieldLabel>
                    <Input 
                      id="password" 
                      type="password" 
                      required 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading || googleLoading}
                      className="border-slate-800 bg-slate-950 text-white focus-visible:ring-orange-500"
                    />
                  </Field>
                </FieldGroup>
                
                <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white" disabled={loading || googleLoading}>
                  {loading ? <Spinner data-icon="inline-start" className="mr-2" /> : null}
                  Entrar al Panel
                </Button>
              </form>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink mx-4 text-slate-500 text-xs uppercase">o continuar con</span>
                <div className="flex-grow border-t border-slate-800"></div>
              </div>

              <Button 
                variant="outline" 
                onClick={handleGoogleSignIn} 
                disabled={loading || googleLoading}
                className="w-full border-slate-800 bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
              >
                {googleLoading ? <Spinner data-icon="inline-start" className="mr-2" /> : <GoogleLogo className="mr-2 size-5" />}
                Google Workspace
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
