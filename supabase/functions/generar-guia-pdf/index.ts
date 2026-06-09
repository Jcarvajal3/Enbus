import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { PDFDocument, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
        peso_kg,
        costo_calculado,
        receiver_nombre,
        receiver_cedula_rif,
        sender:profiles!sender_id (nombre_completo, cedula_rif),
        cooperativas (nombre)
      `)
      .eq('id', encomienda_id)
      .single();

    if (encError || !enc) throw new Error("No tienes acceso a esta encomienda");

    // Generación de PDF usando pdf-lib
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([400, 500]);
    page.drawText('Guía EnBus / Panas Cargo', { x: 50, y: 450, size: 18 });
    page.drawText(`Tracking ID: ${enc.tracking_id}`, { x: 50, y: 420, size: 14 });
    page.drawText(`Cooperativa: ${enc.cooperativas?.nombre || 'N/A'}`, { x: 50, y: 400, size: 12 });
    page.drawText(`Peso: ${enc.peso_kg || 0} kg - Costo: $${enc.costo_calculado || 0}`, { x: 50, y: 380, size: 12 });
    
    // Remitente
    const senderData = Array.isArray(enc.sender) ? enc.sender[0] : enc.sender;
    page.drawText(`Remitente: ${senderData?.nombre_completo || 'N/A'} (CI/J: ${senderData?.cedula_rif || 'N/A'})`, { x: 50, y: 350, size: 10 });
    
    // Destinatario
    page.drawText(`Destinatario: ${enc.receiver_nombre} (CI/J: ${enc.receiver_cedula_rif})`, { x: 50, y: 330, size: 10 });

    try {
        // Generar QR y embedirlo
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${enc.tracking_id}`;
        const qrImageBytes = await fetch(qrUrl).then((res) => res.arrayBuffer());
        const qrImage = await pdfDoc.embedPng(qrImageBytes);
        const qrDims = qrImage.scale(0.8);
        page.drawImage(qrImage, {
            x: 50,
            y: 180,
            width: qrDims.width,
            height: qrDims.height,
        });
    } catch (e) {
        console.error("Error embedding QR:", e);
    }
    
    const pdfBytes = await pdfDoc.save();
    const pdfContent = new Uint8Array(pdfBytes);
    
    // Almacena en Supabase Storage usando Service Role (o taquillero role funciona porque bucket tiene RLS permitiendo taquillero insert)
    const fileName = `${enc.tracking_id}_guia_${Date.now()}.pdf`;
    
    // En el bucket que creamos no hay una politica explicita para PDFs o se guardan en fotos-encomiendas por ahora o un bucket guias
    // Subirlo al bucket 'logos-cooperativas' o crear otro, asumiendo un bucket 'fotos-encomiendas'
    const { data: uploadData, error: uploadError } = await supabaseAuth
      .storage
      .from('fotos-encomiendas')
      .upload(`guias/${fileName}`, pdfContent, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) throw new Error("Error subiendo PDF: " + uploadError.message);

    // M-11: createSignedUrl porque fotos-encomiendas es privado
    const { data: signedData, error: signedError } = await supabaseAuth.storage
      .from('fotos-encomiendas')
      .createSignedUrl(`guias/${fileName}`, 3600); // 1 hora de validez
      
    if (signedError) throw new Error("Error generando URL firmada: " + signedError.message);

    return new Response(JSON.stringify({ pdf_url: signedData?.signedUrl || "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
