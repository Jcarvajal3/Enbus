// Campos de formulario del panel: los mismos formatos y comportamiento que la app
// (shared/ve.ts, shared/dinero.ts, shared/bancos.ts). Ver Specs/03_Web_Panel_Cooperativas/Flujos_Taquilla_y_Formatos.md §3.

export { Campo, type CampoProps } from "./campo";
export { TelefonoField, type TelefonoFieldProps } from "./telefono-field";
export { CedulaField, type CedulaFieldProps } from "./cedula-field";
export { RifField, type RifFieldProps } from "./rif-field";
export { MontoField, type MontoFieldProps } from "./monto-field";
export { FechaField, type FechaFieldProps } from "./fecha-field";
export { HoraField, hora12, type HoraFieldProps } from "./hora-field";
export { CiudadField, CIUDAD_VACIA, type CiudadFieldProps, type ValorCiudad } from "./ciudad-field";
export { BancoField, type BancoFieldProps } from "./banco-field";
export type { PropsCampoComun } from "./campo-base";
