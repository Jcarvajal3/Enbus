// Fotos del sitio: lugares reales de Venezuela de Wikimedia Commons. Muestran el mundo
// del viaje (carreteras, terminales); ninguna es de una cooperativa de EnBus.
// Las de licencia CC BY-SA exigen el crédito y el enlace a la licencia: van en el pie.

import llanosApure from "./fotos/llanos-apure.jpg";
import terminalMerida from "./fotos/terminal-merida.jpg";
import carreteraLaraZulia from "./fotos/carretera-lara-zulia.jpg";
import terminalCarmenArismendi from "./fotos/terminal-carmen-arismendi.jpg";
import trasandinaMerida from "./fotos/trasandina-merida.jpg";
import monagas from "./fotos/monagas.jpg";

export const FOTOS = {
  llanosApure,
  terminalMerida,
  carreteraLaraZulia,
  terminalCarmenArismendi,
  trasandinaMerida,
  monagas,
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
  {
    titulo: "Esperando subir al autobús",
    autor: "José Alfaro",
    licencia: "CC BY-SA 4.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    pagina: "https://commons.wikimedia.org/wiki/File:Esperando_subir_al_autob%C3%BAs.jpg",
  },
  {
    titulo: "Desde el autobús, carretera Lara-Zulia",
    autor: "Jujovar2010",
    licencia: "CC BY-SA 3.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    pagina: "https://commons.wikimedia.org/wiki/File:Desde_el_autob%C3%BAs,_carretera_Lara-Zulia.JPG",
  },
  {
    titulo: "Terminal de Pasajero Carmen Arismendi",
    autor: "Guaiquerí",
    licencia: "CC0",
    licenciaUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    pagina: "https://commons.wikimedia.org/w/index.php?curid=153958183",
  },
  {
    titulo: "Carretera trasandina, Mérida, Venezuela 02",
    autor: "George Miquilena",
    licencia: "CC BY-SA 3.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    pagina: "https://commons.wikimedia.org/w/index.php?curid=21062805",
  },
  {
    titulo: "Monagas desde la bajada de Santa Bárbara",
    autor: "Cesar Pérez",
    licencia: "CC BY-SA 4.0",
    licenciaUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    pagina: "https://commons.wikimedia.org/wiki/File:Monagas_desde_la_bajada_de_Santa_Barabara.jpg",
  },
];
