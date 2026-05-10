const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tydpnvajwfzcsxsowctp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5ZHBudmFqd2Z6Y3N4c293Y3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODk4MTIsImV4cCI6MjA5MDY2NTgxMn0.VeuLT_p8ew2fCZoYG7aldelLPTr-Z5sJoYWolleLcSo';

// El token de sesión filtrado en el URL
const userToken = 'eyJhbGciOiJFUzI1NiIsImtpZCI6IjI2YWM5ZGM2LWRiMmItNDUwYi04NjBkLTRhM2M1MGQ0ZmEzNCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3R5ZHBudmFqd2Z6Y3N4c293Y3RwLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJjOWYxZWEzYy00NTFhLTQzOTItYmJmYS00MjIwMDk5OTFhZDUiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc2MTQzNDg5LCJpYXQiOjE3NzYxMzk4ODksImVtYWlsIjoiamF2aWVyQHF1YXJ0b3JlbnQuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImphdmllckBxdWFydG9yZW50LmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6ImM5ZjFlYTNjLTQ1MWEtNDM5Mi1iYmZhLTQyMjAwOTk5MWFkNSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6Im90cCIsInRpbWVzdGFtcCI6MTc3NjEzOTg4OX1dLCJzZXNzaW9uX2lkIjoiZTQwYjA4ZWQtNjA3Zi00ZTc5LWI5ODEtOTViZjNhODdiZjc3IiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.g3-XJEq3n3msvWK6tToxOwEevEVqDsVowdp8XRi7S2PDjhsY7U-vIW3waLztFaFssLqws9zCx6c22jWv1uH9aw';
const userId = 'c9f1ea3c-451a-4392-bbfa-422009991ad5';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
  global: {
    headers: { Authorization: `Bearer ${userToken}` }
  }
});

async function seed() {
  console.log("Comenzando inyección de datos Dummy para el usuario:", userId);

  // 1. Obtener o insertar cooperativa
  let cooperativaId;
  const { data: coops } = await supabase.from('cooperativas').select('id').limit(1);
  if (!coops || coops.length === 0) {
    console.log('Insertando cooperativa dummy...');
    const { data: newCoop, error } = await supabase.from('cooperativas').insert({
      nombre: 'Expresos Panamericana',
      rif: 'J-12345678-0',
      comision_porcentaje: 5.0
    }).select('id').single();
    if (error) console.error("Error coop:", error);
    if (newCoop) cooperativaId = newCoop.id;
  } else {
    cooperativaId = coops[0].id;
  }

  // 2. Obtener o insertar ruta
  let rutaId;
  if (cooperativaId) {
    const { data: rutas } = await supabase.from('rutas').select('id').limit(1);
    if (!rutas || rutas.length === 0) {
      console.log('Insertando ruta dummy...');
      const { data: newRuta, error } = await supabase.from('rutas').insert({
        cooperativa_id: cooperativaId,
        estado_origen: 'Distrito Capital', ciudad_origen: 'Caracas',
        estado_destino: 'Carabobo', ciudad_destino: 'Valencia',
        duracion_estimada_min: 120, precio_pasaje: 35.0
      }).select('id').single();
      if (error) console.error("Error ruta:", error);
      if (newRuta) rutaId = newRuta.id;
    } else {
      rutaId = rutas[0].id;
    }
  }

  // 3. Obtener o insertar viaje
  let viajeId;
  if (rutaId) {
    const { data: viajes } = await supabase.from('viajes').select('id').limit(1);
    if (!viajes || viajes.length === 0) {
      console.log('Insertando viaje dummy...');
      const { data: newViaje, error } = await supabase.from('viajes').insert({
        ruta_id: rutaId,
        cooperativa_id: cooperativaId,
        numero_unidad: '012', nombre_chofer: 'Carlos',
        fecha_hora_salida: new Date(Date.now() + 86400000).toISOString(),
        fecha_hora_llegada_est: new Date(Date.now() + 86400000 + 7200000).toISOString(),
        asientos_totales: 40, asientos_disponibles: 38
      }).select('id').single();
      if (error) console.error("Error viaje:", error);
      if (newViaje) viajeId = newViaje.id;
    } else {
      viajeId = viajes[0].id;
    }
  }

  // Insertar Encomiendas Dummy
  console.log("Insertando Encomiendas...");
  const encomiendasDummy = [
    {
      tracking_id: 'EB-2404-XYZ12',
      sender_id: userId,
      receiver_nombre: 'Maria Perez',
      receiver_telefono: '+584140001122',
      receiver_cedula_rif: 'V-12345678',
      estado_origen: 'Distrito Capital',
      ciudad_origen: 'Caracas',
      estado_destino: 'Carabobo',
      ciudad_destino: 'Valencia',
      cooperativa_id: cooperativaId || null,
      estado: 'EN_TRANSITO',
      peso_kg: 5,
      costo_calculado: 1500.5,
      modalidad_pago: 'DESTINO',
      descripcion_contenido: 'Documentos urgentes',
    }
  ];

  const { error: errEnc } = await supabase.from('encomiendas').insert(encomiendasDummy);
  if (errEnc) console.error("Error insertando encomiendas:", errEnc.message);
  else console.log("✅ Encomiendas insertadas.");

  // Insertar Boletos Dummy
  if (viajeId) {
    console.log("Insertando Boletos...");
    const boletosDummy = [
      {
        codigo_boleto: 'BOL-98765A',
        comprador_id: userId,
        viaje_id: viajeId,
        cooperativa_id: cooperativaId,
        asiento: '12',
        precio: 35.0,
        estado: 'PAGADO',
      }
    ];

    const { error: errBol } = await supabase.from('boletos').insert(boletosDummy);
    if (errBol) console.error("Error insertando boletos:", errBol.message);
    else console.log("✅ Boletos insertados.");
  } else {
    console.error("No se insertarán boletos por falta de un viaje válido");
  }
}

seed();
