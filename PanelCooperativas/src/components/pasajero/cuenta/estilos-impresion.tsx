/**
 * Hoja de estilos de impresión del pase: solo se ve lo marcado con `data-imprimible`, sin la barra,
 * el pie ni la navegación. Va en línea porque debe alcanzar a toda la página (un módulo CSS no puede).
 */
const CSS = `
@media print {
  @page { margin: 14mm; }
  body * { visibility: hidden !important; }
  [data-imprimible], [data-imprimible] * { visibility: visible !important; }
  [data-imprimible] {
    position: absolute !important;
    inset: 0 0 auto 0 !important;
    max-width: 560px !important;
    margin: 0 auto !important;
    box-shadow: none !important;
    border: 1.5px solid #0f1b33 !important;
    border-radius: 16px !important;
    background: #fff !important;
    color: #000 !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  [data-no-imprimir] { display: none !important; }
}
`;

export function EstilosImpresion() {
  return <style>{CSS}</style>;
}
