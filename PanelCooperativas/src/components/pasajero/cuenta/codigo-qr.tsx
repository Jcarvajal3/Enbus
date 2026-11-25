"use client";

import { QRCodeSVG } from "qrcode.react";

/** QR de un pase o una encomienda: siempre oscuro sobre blanco para que el lector lo lea de noche. */
export function CodigoQr({ valor, titulo, tamano = 220 }: { valor: string; titulo: string; tamano?: number }) {
  return (
    <QRCodeSVG
      value={valor}
      size={tamano}
      level="M"
      bgColor="#FFFFFF"
      fgColor="#0F1B33"
      marginSize={2}
      title={titulo}
      style={{ width: "100%", maxWidth: tamano, height: "auto" }}
    />
  );
}
