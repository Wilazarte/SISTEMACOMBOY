/* ==========================================================================
   Tarea: JARVIS Vigia (detector de patrones, corre cada 2 minutos)
   1) >= %JV_LIMITE_DIST (15) min seguidos en TikTok/Instagram -> audio y te saca.
   2) >= %JV_HORAS_SIN_VENTA (4) h sin registrar venta en horario laboral -> alerta.
   ========================================================================== */
var ahora = Date.now(), h = new Date().getHours();
function azar(l) { return l[Math.floor(Math.random() * l.length)]; }
if (JV.g('JV_DIA', '') !== JV.hoy()) { JV.set('JV_DIA', JV.hoy()); JV.set('JV_DIST_HOY', 0); }

/* ---- 1. Distracción ---- */
var ini = parseInt(JV.g('JV_DIST_INI', '0'), 10);
if (ini > 0) {
  var min = Math.floor((ahora - ini) / 60000);
  var limite = parseInt(JV.g('JV_LIMITE_DIST', '15'), 10);
  var ult = parseInt(JV.g('JV_DIST_ALERTA', '0'), 10);
  if (min >= limite && ahora - ult >= 5 * 60000) {
    var app = JV.g('JV_DIST_APP', 'redes');
    var r = JV.resumenHoy();
    var frase = azar([
      'Jefe, patrón de distracción detectado: ' + min + ' minutos en ' + app + '. Cierra y haz una sola cosa: responde al último cliente.',
      'Jefe, ' + min + ' minutos de scroll. Eso no vende hoodies. Dos minutos para publicar una historia de COMBOY y vuelves si quieres.',
      'Jefe, llevas ' + min + ' minutos en ' + app + ' y ' + r.ventas + ' ventas hoy. El que publica cobra, el que mira paga. Volvamos a enfoque.'
    ]);
    JV.log('alerta_distraccion', min, app);
    JV.set('JV_DIST_ALERTA', ahora);
    if (JV.g('JV_EXPULSAR', 'si') === 'si') { try { goHome(0); } catch (e) {} }
    JV.hablar(frase);
  }
}

/* ---- 2. Ventas ---- */
var hIni = parseInt(JV.g('JV_HORA_INI', '9'), 10), hFin = parseInt(JV.g('JV_HORA_FIN', '22'), 10);
var ultVenta = parseInt(JV.g('JV_ULTIMA_VENTA', '0'), 10);
if (!ultVenta) { JV.set('JV_ULTIMA_VENTA', ahora); ultVenta = ahora; }
var horasSin = (ahora - ultVenta) / 3600000;
var limiteH = parseFloat(JV.g('JV_HORAS_SIN_VENTA', '4'));
var ultAlertaV = parseInt(JV.g('JV_VENTA_ALERTA', '0'), 10);
if (h >= hIni && h < hFin && horasSin >= limiteH && ahora - ultAlertaV >= 3600000) {
  var rv = JV.resumenHoy(), meta = parseFloat(JV.g('JV_META', '0')), mon = JV.g('JV_MONEDA', 'S/');
  var falta = meta > 0 ? ' Te faltan ' + Math.max(0, Math.round(meta - rv.monto)) + ' ' + mon + ' para la meta.' : '';
  var frase2 = azar([
    'Jefe, ' + Math.floor(horasSin) + ' horas sin registrar ventas.' + falta + ' Escríbele ahora a tres clientes que preguntaron y no compraron.',
    'Jefe, ' + Math.floor(horasSin) + ' horas en cero.' + falta + ' Sube una historia con precio y stock limitado, y responde todo en 5 minutos.',
    'Jefe, el día se va sin caja.' + falta + ' Si vendiste y no lo registraste, dime "registra venta". Si no, ofrece un combo a tu último comprador.'
  ]);
  JV.log('alerta_ventas', Math.floor(horasSin), falta);
  JV.set('JV_VENTA_ALERTA', ahora);
  JV.hablar(frase2);
}
