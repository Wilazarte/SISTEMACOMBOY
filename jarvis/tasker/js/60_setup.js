/* Tarea: JARVIS Setup · ejecútala UNA vez tras importar (crea carpeta, archivos y valores por defecto). */
try { createDir(JV.DIR, true, false); } catch (e) { shell('mkdir -p "' + JV.DIR + '"', false, 10); }
if (!JV.leer(JV.LOG)) JV.escribir(JV.LOG, 'fecha,tipo,valor,detalle\n', false);
if (!JV.leer(JV.MEM)) JV.escribir(JV.MEM, [
  '# Memoria de JARVIS', '',
  '## Jefe', '- Nombre: ' + JV.dueno(), '- Marca: COMBOY (streetwear)', '',
  '## Metas', '- Meta diaria de ventas: (completar)', '- Meta del mes: (completar)', '',
  '## Productos y precios', '- (completar: producto, precio, costo, stock)', '',
  '## Patrones conocidos', '- (JARVIS agrega aquí lo que le pidas recordar)', ''
].join('\n'), false);
if (!JV.leer(JV.CONT)) JV.escribir(JV.CONT, 'nombre,numero\nejemplo,51999999999\n', false);
var defs = { JV_DUENO: 'Williams', JV_MODO: 'tasker', JV_META: '0', JV_MONEDA: 'S/', JV_LIMITE_DIST: '15',
  JV_HORAS_SIN_VENTA: '4', JV_HORA_INI: '9', JV_HORA_FIN: '22', JV_EXPULSAR: 'si', JV_VOZ_ID: JV.VOZ_ADAM,
  JV_PUERTO: '8765', JV_DIST_INI: '0' };
for (var k in defs) if (JV.g(k, '') === '') JV.set(k, defs[k]);
var faltan = [];
if (!JV.g('CLAVE_CLAUDE', '')) faltan.push('CLAVE_CLAUDE');
if (!JV.g('CLAVE_ELEVEN', '')) faltan.push('CLAVE_ELEVEN');
if (!JV.g('JV_PIN', '')) faltan.push('JV_PIN');
JV.hablar(faltan.length ? 'Jefe, instalación lista. Faltan las variables: ' + faltan.join(', ') + '.' : 'Jefe, JARVIS en línea. Listo para vender.');
