"use client";

import { QRCodeSVG } from "qrcode.react";

/** QR del pase de muestra de la portada (qrcode.react usa hooks: va en el cliente). */
export function QrPase({ valor }: { valor: string }) {
  return <QRCodeSVG value={valor} size={132} level="M" bgColor="#FFFFFF" fgColor="#0F1B33" marginSize={0} title="Código QR del pase de abordar" />;
}
