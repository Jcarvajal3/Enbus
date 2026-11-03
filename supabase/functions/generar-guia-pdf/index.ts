import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization" }), { status: 401, headers: corsHeaders });
    }

    const { encomienda_id } = await req.json();

    if (!encomienda_id) {
      return new Response(JSON.stringify({ error: "encomienda_id requerido" }), { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    // Auth validation with standard client
    const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !user) {
      throw new Error("Usuario no autenticado: " + (userError?.message || "token inválido o nulo"));
    }

    // M-10: Traer toda la data necesaria para el PDF
    const { data: enc, error: encError } = await supabaseAuth
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
      .eq('id', encomienda_id)
      .single();

    if (encError || !enc) throw new Error("No tienes acceso a esta encomienda");

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
    const linea = (texto: string, y: number, size = 10, bold = false, color = rgb(0, 0, 0)) =>
      page.drawText(textoPdf(texto, 60), { x: 30, y, size, font: bold ? negrita : fuente, color });

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

    try {
        // Generar QR y embedirlo
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(enc.tracking_id)}`;
        const qrImageBytes = await fetch(qrUrl).then((res) => res.arrayBuffer());
        const qrImage = await pdfDoc.embedPng(qrImageBytes);
        const qrDims = qrImage.scale(0.8);
        page.drawImage(qrImage, {
            x: 30,
            y: 100,
            width: qrDims.width,
            height: qrDims.height,
        });
    } catch (e) {
        console.error("Error embedding QR:", e);
    }
    
    const pdfBytes = await pdfDoc.save();
    const pdfContent = new Uint8Array(pdfBytes);
    
    // La guía lleva el PIN de retiro: se guarda en guias/<cooperativa_id>/ con el service role
    // (el acceso del usuario ya se comprobó arriba con su JWT). Solo el personal de esa cooperativa
    // puede leer la carpeta (migración 20260721000004); el enlace firmado dura 1 hora.
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const rutaGuia = `guias/${enc.cooperativa_id ?? 'sin-cooperativa'}/${enc.tracking_id}_guia_${Date.now()}.pdf`;

    const { error: uploadError } = await supabaseAdmin
      .storage
      .from('fotos-encomiendas')
      .upload(rutaGuia, pdfContent, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) throw new Error("Error subiendo PDF: " + uploadError.message);

    // M-11: createSignedUrl porque fotos-encomiendas es privado
    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from('fotos-encomiendas')
      .createSignedUrl(rutaGuia, 3600); // 1 hora de validez
      
    if (signedError) throw new Error("Error generando URL firmada: " + signedError.message);

    return new Response(JSON.stringify({ pdf_url: signedData?.signedUrl || "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
