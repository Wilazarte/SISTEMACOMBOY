/* Tarea: JARVIS Registrar  ·  %par1 = venta|animo|enfoque  ·  %par2 = "valor|detalle"
   Úsala desde widgets/atajos: p.ej. par1=venta par2=120|hoodie negro talla M */
var tipo = (typeof par1 !== 'undefined' && par1 !== '%par1') ? String(par1) : '';
var datos = (typeof par2 !== 'undefined' && par2 !== '%par2') ? String(par2).split('|') : [''];
if (/^(venta|animo|enfoque)$/.test(tipo)) {
  JV.log(tipo, datos[0], datos.slice(1).join('|'));
  var r = JV.resumenHoy();
  flash(tipo === 'venta' ? 'Venta registrada. Hoy: ' + r.ventas + ' por ' + r.monto + ' ' + JV.g('JV_MONEDA', 'S/') : 'Registrado: ' + tipo);
} else {
  flash('JARVIS Registrar: par1 debe ser venta, animo o enfoque');
}
