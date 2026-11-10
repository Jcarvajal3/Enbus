// generar-guia-pdf
// Genera la guía en PDF de una encomienda (con el PIN de retiro) para imprimir en taquilla.
// Solo el personal de la cooperativa de la encomienda (o el equipo de EnBus) puede generarla.
// Se guarda en fotos-encomiendas/guias/<cooperativa_id>/<tracking>.pdf (se sobrescribe: una guía
// por encomienda) y se devuelve un enlace firmado de 1 hora. El QR se dibuja aquí mismo: no se
// manda el código de seguimiento a servicios externos ni se depende de ellos.
import '@supabase/functions-js/edge-runtime.d.ts';
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'npm:pdf-lib@1.17.1';
import qrcode from 'npm:qrcode-generator@2.0.4';
import { ErrorEntrada, errorInterno, esUuid, fallar, filtrarMetodo, leerJson, responder } from '../_shared/http.ts';
import { clienteAdmin, clienteUsuario, usuarioDelToken } from '../_shared/supabase.ts';

const ROLES_STAFF = new Set(['taquillero', 'admin_cooperativa']);

// Glosario: modalidad de pago de la encomienda.
const MODALIDAD: Record<string, string> = {
  ORIGEN: 'Paga al enviar',
  DESTINO: 'Paga al retirar',
};

// Ciudades con tildes (mismos nombres que formatCiudad de shared/ve.ts; aquí no se puede importar).
const NOMBRES_CIUDAD: Record<string, string> = {
  merida: 'Mérida', maturin: 'Maturín', cumana: 'Cumaná', carupano: 'Carúpano', bocono: 'Boconó',
  tariba: 'Táriba', socopo: 'Socopó', cua: 'Cúa', lecheria: 'Lechería', 'ciudad bolivar': 'Ciudad Bolívar',
  'san felix': 'San Félix', 'el vigia': 'El Vigía', 'la asuncion': 'La Asunción', 'la guaira': 'La Guaira',
  'puerto la cruz': 'Puerto La Cruz', 'valle de la pascua': 'Valle de la Pascua', 'punta de mata': 'Punta de Mata',
  'san fernando': 'San Fernando de Apure', 'san juan': 'San Juan de los Morros',
  // Ciudades con terminal (matriz nacional, 20261110000001).
  maiquetia: 'Maiquetía', naiguata: 'Naiguatá', 'las tejerias': 'Las Tejerías', choroni: 'Choroní',
  moron: 'Morón', 'el baul': 'El Baúl', camaguan: 'Camaguán', adicora: 'Adícora', quibor: 'Quíbor',
  mucuchies: 'Mucuchíes', 'rio chico': 'Río Chico', cupira: 'Cúpira', 'san jose de guanipa': 'San José de Guanipa',
  'san jose de guaribe': 'San José de Guaribe', 'puerto piritu': 'Puerto Píritu', piritu: 'Píritu', turen: 'Turén',
  boconoito: 'Boconoíto', 'rio caribe': 'Río Caribe', guiria: 'Güiria', 'caicara de maturin': 'Caicara de Maturín',
  'san antonio de maturin': 'San Antonio de Maturín', 'santa elena de uairen': 'Santa Elena de Uairén',
  'santa barbara de barinas': 'Santa Bárbara de Barinas', 'san carlos de rio negro': 'San Carlos de Río Negro',
  'san cristobal': 'San Cristóbal', 'san antonio del tachira': 'San Antonio del Táchira', 'la fria': 'La Fría',
  colon: 'Colón', 'el pinal': 'El Piñal', urena: 'Ureña', bramon: 'Bramón', isnotu: 'Isnotú', pampan: 'Pampán',
  paraguachon: 'Paraguachón',
};

/** "puerto_la_cruz" -> "Puerto La Cruz", "merida" -> "Mérida". */
function formatCiudad(v: string | null | undefined): string {
  const base = (v ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!base) return '—';
  const clave = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return NOMBRES_CIUDAD[clave] ?? base.replace(/(^|\s)(\S)/g, (_m, esp: string, l: string) => esp + l.toUpperCase());
}

/** 1234.5 -> "1.234,50" (formato venezolano). */
function formatNumeroVE(n: number, decimales = 2): string {
  const [entero, dec] = Math.abs(n).toFixed(decimales).split('.');
  const texto = `${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec ? `,${dec}` : ''}`;
  return n < 0 ? `-${texto}` : texto;
}

/** Los marcadores 'PENDIENTE-…' no son teléfonos. */
function esTelefono(v: string | null | undefined): v is string {
  return !!v && !/^PENDIENTE/i.test(v) && /\d{7,}/.test(v.replace(/\D/g, ''));
}

/** La fuente estándar de pdf-lib solo codifica WinAnsi: se reemplaza lo demás y se recorta. */
function textoPdf(v: unknown, max: number): string {
  const limpio = String(v ?? '')
    .replace(/\s+/g, ' ')
    .replace(/→/g, '-')
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, '?');
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

/** Dibuja el QR del código de seguimiento como cuadros (sin imagen externa). */
function dibujarQr(page: PDFPage, contenido: string, x: number, y: number, lado: number) {
  const qr = qrcode(0, 'M');
  qr.addData(contenido);
  qr.make();
  const n = qr.getModuleCount();
  const margen = 2;
  const celda = lado / (n + margen * 2);
  page.drawRectangle({ x, y, width: lado, height: lado, color: rgb(1, 1, 1) });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      page.drawRectangle({
        x: x + (c + margen) * celda,
        y: y + lado - (r + margen + 1) * celda,
        width: celda,
        height: celda,
        color: rgb(0, 0, 0),
      });
    }
  }
}

Deno.serve(async (req) => {
  const metodo = filtrarMetodo(req);
  if (metodo) return metodo;

  try {
    const usuario = await usuarioDelToken(req);
    if (!usuario) return fallar(401, 'EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');

    const body = await leerJson(req, 2048);
    if (!esUuid(body.encomienda_id)) return fallar(400, 'EB_DATOS_INVALIDOS', 'Falta la encomienda.');
    const encomiendaId = body.encomienda_id;

    const admin = clienteAdmin();
    const { data: perfil, error: perfilError } = await admin
      .from('profiles').select('role, cooperativa_id').eq('id', usuario.id).maybeSingle();
    if (perfilError) throw new Error(`profiles: ${perfilError.message}`);
    const esSuperAdmin = perfil?.role === 'super_admin';
    if (!perfil || (!esSuperAdmin && !(ROLES_STAFF.has(perfil.role) && perfil.cooperativa_id))) {
      return fallar(403, 'EB_SIN_PERMISO', 'Solo el personal de la cooperativa puede generar la guía.');
    }

    // Se lee con el JWT del empleado (RLS) y además se exige que sea de su cooperativa.
    const { data: enc, error: encError } = await clienteUsuario(usuario.token)
      .from('encomiendas')
      .select(`
        tracking_id,
        cooperativa_id,
        peso_kg,
        costo_calculado,
        modalidad_pago,
        origen_registro,
        remitente_nombre,
        remitente_cedula,
        remitente_telefono,
        receiver_nombre,
        receiver_cedula_rif,
        receiver_telefono,
        ciudad_origen,
        ciudad_destino,
        descripcion_contenido,
        pin_retiro,
        sender:profiles!sender_id (nombre_completo, cedula_rif, telefono),
        cooperativas (nombre)
      `)
      .eq('id', encomiendaId)
      .maybeSingle();
    if (encError) throw new Error(`encomiendas: ${encError.message}`);
    if (!enc || !enc.cooperativa_id || (!esSuperAdmin && enc.cooperativa_id !== perfil.cooperativa_id)) {
      return fallar(404, 'EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
    }
    if (!/^[A-Za-z0-9-]{1,40}$/.test(enc.tracking_id ?? '')) throw new Error('tracking_id inesperado');

    // Remitente real: en las altas de taquilla sender_id es el empleado que la recibió.
    const senderData = Array.isArray(enc.sender) ? enc.sender[0] : enc.sender;
    const cooperativa = Array.isArray(enc.cooperativas) ? enc.cooperativas[0] : enc.cooperativas;
    const esTaquilla = enc.origen_registro === 'TAQUILLA';
    const remitente = {
      nombre: (esTaquilla ? enc.remitente_nombre : senderData?.nombre_completo) || 'Cliente de taquilla',
      cedula: (esTaquilla ? enc.remitente_cedula : senderData?.cedula_rif) || '',
      telefono: (esTaquilla ? enc.remitente_telefono : senderData?.telefono) || '',
    };

    // Generación de PDF usando pdf-lib (fuente estándar: solo WinAnsi, sin "→").
    const pdfDoc = await PDFDocument.create();
    const fuente = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const negrita = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const page = pdfDoc.addPage([400, 560]);
    const gris = rgb(0.35, 0.35, 0.35);
    const linea = (texto: string, y: number, size = 10, bold = false, color = rgb(0, 0, 0)) => {
      const font = bold ? negrita : fuente;
      let t = textoPdf(texto, 90);
      while (t.length > 2 && font.widthOfTextAtSize(t, size) > 340) t = `${t.slice(0, -2)}…`;   // ancho útil
      page.drawText(t, { x: 30, y, size, font, color });
    };

    linea('EnBus · Guía de encomienda', 525, 12, true, gris);
    linea('Código de seguimiento', 500, 9, false, gris);
    linea(enc.tracking_id, 474, 24, true);
    linea(`Cooperativa: ${cooperativa?.nombre || '—'}`, 450, 11);
    linea(`Ruta: ${formatCiudad(enc.ciudad_origen)} - ${formatCiudad(enc.ciudad_destino)}`, 434, 11);
    linea(`Peso: ${formatNumeroVE(Number(enc.peso_kg) || 0)} kg · Costo: USD ${formatNumeroVE(Number(enc.costo_calculado) || 0)}`, 418, 11);
    linea(`Pago: ${MODALIDAD[enc.modalidad_pago as string] ?? '—'}`, 402, 11);
    if (enc.descripcion_contenido) linea(`Contenido: ${enc.descripcion_contenido}`, 386, 10, false, gris);

    linea('Remitente', 360, 10, true);
    linea(`${remitente.nombre}${remitente.cedula ? ` · CI/RIF ${remitente.cedula}` : ''}`, 346, 10);
    if (esTelefono(remitente.telefono)) linea(`Tel. ${remitente.telefono}`, 332, 10, false, gris);

    linea('Destinatario', 308, 10, true);
    linea(`${enc.receiver_nombre}${enc.receiver_cedula_rif ? ` · CI/RIF ${enc.receiver_cedula_rif}` : ''}`, 294, 10);
    if (esTelefono(enc.receiver_telefono)) linea(`Tel. ${enc.receiver_telefono}`, 280, 10, false, gris);

    if (enc.pin_retiro) {
      linea(`PIN de retiro: ${String(enc.pin_retiro).trim()} — dáselo solo a quien recibe`, 254, 11, true);
    }

    dibujarQr(page, enc.tracking_id, 30, 100, 120);

    const pdfContent = new Uint8Array(await pdfDoc.save());

    // La guía lleva el PIN de retiro: se guarda con el service role (el acceso ya se comprobó arriba)
    // en guias/<cooperativa_id>/, que solo puede leer el personal de esa cooperativa (migración
    // 20260721000004). Ruta fija por encomienda: reimprimir no acumula archivos.
    const rutaGuia = `guias/${enc.cooperativa_id}/${enc.tracking_id}_guia.pdf`;
    const { error: uploadError } = await admin.storage
      .from('fotos-encomiendas')
      .upload(rutaGuia, pdfContent, { contentType: 'application/pdf', upsert: true, cacheControl: '60' });
    if (uploadError) throw new Error(`Error subiendo PDF: ${uploadError.message}`);

    // createSignedUrl porque fotos-encomiendas es privado (1 hora de validez).
    const { data: signedData, error: signedError } = await admin.storage
      .from('fotos-encomiendas')
      .createSignedUrl(rutaGuia, 3600);
    if (signedError || !signedData?.signedUrl) {
      throw new Error(`Error generando URL firmada: ${signedError?.message ?? 'sin URL'}`);
    }

    return responder(200, { pdf_url: signedData.signedUrl });
  } catch (e) {
    if (e instanceof ErrorEntrada) return e.respuesta();
    return errorInterno('generar-guia-pdf', e);
  }
});
