"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { 
  ArrowLeft, 
  Warning, 
  Check, 
  Hourglass, 
  ShieldCheck, 
  Package, 
  User, 
  Calendar,
  HandPointing,
  CheckSquare
} from "@phosphor-icons/react";
import { Incidencia } from "@/lib/types/admin-incidencias";
import { tomarCaso, resolverIncidencia, activarSeguro } from "@/app/admin/(panel)/incidencias/actions";
import { toast } from "sonner";

interface IncidenciaDetailProps {
  incidencia: Incidencia;
  currentUser: { id: string; nombre_completo: string };
}

export function IncidenciaDetail({ incidencia, currentUser }: IncidenciaDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resolucionText, setResolucionText] = useState("");
  const [showResolveForm, setShowResolveForm] = useState(false);

  // Status Badge Helper
  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "ABIERTA":
        return {
          className: "bg-red-500/15 text-red-500 border-red-500/20",
          label: "Abierta",
          icon: <Warning className="h-4 w-4 mr-1.5" />
        };
      case "EN_PROCESO":
        return {
          className: "bg-amber-500/15 text-amber-500 border-amber-500/20",
          label: "En Proceso",
          icon: <Hourglass className="h-4 w-4 mr-1.5" />
        };
      case "RESUELTA":
        return {
          className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
          label: "Resuelta",
          icon: <Check className="h-4 w-4 mr-1.5" />
        };
      default:
        return {
          className: "bg-slate-500/15 text-slate-400 border-slate-500/20",
          label: estado,
          icon: null
        };
    }
  };

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case "PERDIDA": return "Pérdida de Encomienda";
      case "DANADA": return "Encomienda Dañada";
      case "DEMORA": return "Demora en Envío";
      case "ALERTA_AMARILLA": return "Alerta Amarilla";
      case "REPORTE_USUARIO": return "Reporte de Usuario";
      default: return tipo;
    }
  };

  const handleTomarCaso = () => {
    startTransition(async () => {
      try {
        const res = await tomarCaso(incidencia.id);
        if (res.success) {
          toast.success("Te has asignado esta incidencia exitosamente.");
          router.refresh();
        } else {
          toast.error(res.error || "Ocurrió un error al tomar la incidencia.");
        }
      } catch (err: any) {
        toast.error("Error al procesar la solicitud.");
      }
    });
  };

  const handleResolverIncidencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolucionText.trim()) {
      toast.error("Por favor, describe la resolución de la incidencia.");
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("resolucion", resolucionText.trim());

        const res = await resolverIncidencia(incidencia.id, formData);
        if (res.success) {
          toast.success("La incidencia ha sido marcada como resuelta.");
          setShowResolveForm(false);
          setResolucionText("");
          router.refresh();
        } else {
          toast.error(res.error || "Ocurrió un error al resolver la incidencia.");
        }
      } catch (err: any) {
        toast.error("Error al procesar la solicitud.");
      }
    });
  };

  const handleActivarSeguro = () => {
    startTransition(async () => {
      try {
        const res = await activarSeguro(incidencia.id);
        if (res.success) {
          toast.success("Seguro activado y caso resuelto exitosamente.");
          router.refresh();
        } else {
          toast.error(res.error || "Ocurrió un error al activar el seguro.");
        }
      } catch (err: any) {
        toast.error("Error al procesar la solicitud.");
      }
    });
  };

  const statusInfo = getStatusBadge(incidencia.estado);
  const valorDeclarado = incidencia.encomienda?.valor_declarado ? Number(incidencia.encomienda.valor_declarado) : 0;
  // Spec: cobertura = 3× valor declarado
  const montoSeguro = valorDeclarado * 3;

  return (
    <div className="space-y-6">
      {/* Botón para volver */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/admin/incidencias")}
          className="border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 gap-1.5 text-xs h-9"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Incidencias
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Detalles Principales (Col 1 y 2) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader className="border-b border-slate-850 pb-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                    Incidencia #{incidencia.id}
                  </span>
                  <CardTitle className="text-xl font-semibold text-slate-100">
                    {getTipoLabel(incidencia.tipo)}
                  </CardTitle>
                </div>
                <div>
                  <Badge variant="outline" className={`text-xs py-1 px-3 border ${statusInfo.className}`}>
                    {statusInfo.icon}
                    {statusInfo.label}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              
              {/* Descripción */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-slate-400">Descripción del Suceso</span>
                <p className="text-sm text-slate-200 leading-relaxed bg-slate-900/40 border border-slate-800/80 rounded-lg p-4">
                  {incidencia.descripcion}
                </p>
              </div>

              {/* Resolución (si está resuelta) */}
              {incidencia.estado === "RESUELTA" && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-emerald-400/80 flex items-center gap-1.5">
                    <CheckSquare className="h-4 w-4 text-emerald-500" />
                    Detalles de la Resolución
                  </span>
                  <div className="text-sm text-emerald-300 bg-emerald-950/10 border border-emerald-900/30 rounded-lg p-4 font-normal leading-relaxed">
                    {incidencia.resolucion || "Caso resuelto sin detalles especificados."}
                  </div>
                </div>
              )}

              {/* Formulario de Resolución */}
              {showResolveForm && (
                <form onSubmit={handleResolverIncidencia} className="space-y-4 border-t border-slate-800 pt-6">
                  <div className="space-y-1.5">
                    <Label htmlFor="resolucion" className="text-xs text-slate-300">
                      Detalles de la Resolución
                    </Label>
                    <textarea
                      id="resolucion"
                      rows={4}
                      placeholder="Describe cómo se resolvió este caso..."
                      value={resolucionText}
                      onChange={(e) => setResolucionText(e.target.value)}
                      className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-ring"
                      disabled={isPending}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowResolveForm(false);
                        setResolucionText("");
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                      disabled={isPending}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs"
                      disabled={isPending}
                    >
                      Confirmar Resolución
                    </Button>
                  </div>
                </form>
              )}

            </CardContent>
            
            {/* Pie del Card con Acciones Rápidas */}
            {!showResolveForm && incidencia.estado !== "RESUELTA" && (
              <CardFooter className="border-t border-slate-850 pt-5 flex flex-wrap gap-3 justify-end bg-slate-900/20">
                {/* Botón Activar Seguro — usa AlertDialog para evitar window.confirm() */}
                {incidencia.tipo === "PERDIDA" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        className="bg-rose-600 hover:bg-rose-500 text-slate-950 font-bold text-xs gap-1.5"
                        disabled={isPending}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Activar Seguro (3× = ${montoSeguro.toFixed(2)})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-slate-950 border-slate-800">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">¿Activar Seguro?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                          Esto aprobará un reembolso de{" "}
                          <span className="font-bold text-rose-400">${montoSeguro.toFixed(2)}</span>{" "}
                          (3× el valor declarado de ${valorDeclarado.toFixed(2)}) y marcará la incidencia como resuelta.
                          Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800">
                          Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleActivarSeguro}
                          className="bg-rose-600 hover:bg-rose-500 text-slate-950 font-bold"
                        >
                          Confirmar Activación
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {/* Botón Tomar Caso */}
                {incidencia.estado === "ABIERTA" && (
                  <Button
                    onClick={handleTomarCaso}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs gap-1.5"
                    disabled={isPending}
                  >
                    <HandPointing className="h-4 w-4" />
                    Tomar Caso
                  </Button>
                )}

                {/* Botón Resolver Caso */}
                {incidencia.estado === "EN_PROCESO" && (
                  <Button
                    onClick={() => {
                      setShowResolveForm(true);
                      setResolucionText("");
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-950 font-bold text-xs gap-1.5"
                    disabled={isPending}
                  >
                    <CheckSquare className="h-4 w-4" />
                    Resolver Caso
                  </Button>
                )}
              </CardFooter>
            )}
          </Card>
        </div>

        {/* Metadatos y Encomienda (Col 3) */}
        <div className="space-y-6">
          
          {/* Tarjeta de Metadatos de Auditoría */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-200">Información del Caso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-slate-400 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-medium">Reportado por</span>
                  <span className="text-xs text-slate-200">
                    {incidencia.reportado_por_profile?.nombre_completo || "Sistema (Automático)"}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-slate-400 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-medium">Fecha Reportado</span>
                  <span className="text-xs text-slate-200">
                    {new Date(incidencia.created_at).toLocaleString("es-VE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true
                    })}
                  </span>
                </div>
              </div>

              {incidencia.estado !== "ABIERTA" && (
                <div className="flex items-start gap-3">
                  <User className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div className="flex flex-col">
                    <span className="text-[10px] text-amber-500 uppercase font-medium">
                      {incidencia.estado === "EN_PROCESO" ? "Asignado a" : "Resuelto por"}
                    </span>
                    <span className="text-xs text-slate-200 font-medium">
                      {incidencia.resuelta_por_profile?.nombre_completo || 
                       (incidencia.resuelta_por === currentUser.id ? currentUser.nombre_completo : "Administrador")}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tarjeta de Encomienda Vinculada */}
          {incidencia.encomienda && (
            <Card className="bg-slate-950/60 border-slate-800">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Package className="h-4 w-4 text-emerald-400" />
                  Encomienda Vinculada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-medium">Tracking ID</span>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {incidencia.encomienda.tracking_id}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-medium">Contenido Declarado</span>
                  <span className="text-xs text-slate-300 leading-relaxed">
                    {incidencia.encomienda.descripcion_contenido || "Sin descripción."}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-medium">Valor Declarado</span>
                  <span className="text-sm font-bold text-slate-100">
                    ${valorDeclarado.toFixed(2)} USD
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-medium">Estado del Envío</span>
                  <Badge variant="outline" className="text-[10px] py-0.5 border-slate-800 text-slate-400 w-fit">
                    {incidencia.encomienda.estado}
                  </Badge>
                </div>

              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
