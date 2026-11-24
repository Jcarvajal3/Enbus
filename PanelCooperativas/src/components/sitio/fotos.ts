// Fotos del sitio: lugares reales de Venezuela de Wikimedia Commons. Muestran el mundo
// del viaje; ninguna es de una cooperativa de EnBus.
// Las de licencia CC BY-SA exigen el crédito y el enlace a la licencia: van en el pie.
// Si añades una foto, añade también su crédito aquí.

import llanosApure from "./fotos/llanos-apure.jpg";

export const FOTOS = {
  llanosApure,
};

export interface CreditoFoto {
  titulo: string;
  autor: string;
  licencia: string;
  licenciaUrl: string;
  pagina: string;
}

export const CREDITOS_FOTOS: CreditoFoto[] = [
  {
    titulo: "Llanos y cielo de Apure",
    autor: "Arnaldo Noguera Sifontes",
    licencia: "CC BY-SA 4.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    pagina: "https://commons.wikimedia.org/wiki/File:Llanos_y_cielo_de_Apure.jpg",
  },
];
