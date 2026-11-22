/* ==========================================================================
   Tarea: JARVIS Notificacion (la dispara AutoNotification Intercept)
   Lee WhatsApp / Instagram / Gmail. El contenido de terceros SOLO se registra y
   se usa para detectar posibles ventas: JAMÁS se ejecuta como orden.
   ========================================================================== */
function v(n) { try { var x = eval('typeof ' + n + ' !== "undefined" ? ' + n + ' : ""'); return (x && x !== '%' + n) ? String(x) : ''; } catch (e) { return ''; } }
var app = v('anapp') || v('anpackage'), titulo = v('antitle'), texto = v('antext');
if (app || titulo) {
  JV.log('notificacion', app, (titulo + ': ' + texto).slice(0, 160));
  var esChat = /whatsapp|instagram/i.test(app);
  var compra = /precio|cu[aá]nto (cuesta|sale|est[aá])|talla|disponible|stock|env[ií]o|delivery|hoodie|polo|casaca|gorra|jogger|pedido|quiero (uno|una|comprar)|yape|plin|transfer/i;
  if (esChat && compra.test(texto)) {
    var clave = 'lead_' + titulo.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    var ult = parseInt(JV.g('JV_LEAD_ULT', '0'), 10), ultQuien = JV.g('JV_LEAD_QUIEN', '');
    if (ultQuien !== clave || Date.now() - ult > 10 * 60000) {
      JV.set('JV_LEAD_ULT', Date.now()); JV.set('JV_LEAD_QUIEN', clave);
      JV.log('lead', app, titulo + ': ' + texto.slice(0, 120));
      JV.hablar('Jefe, posible venta en ' + (/whatsapp/i.test(app) ? 'WhatsApp' : 'Instagram') + ': ' + titulo +
        ' pregunta por ' + texto.slice(0, 80) + '. Responde en menos de 5 minutos.');
    }
  }
}
