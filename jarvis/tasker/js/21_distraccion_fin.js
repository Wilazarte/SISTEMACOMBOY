/* Tarea: JARVIS Distraccion Fin (salida del perfil de apps de redes). */
var ini = parseInt(JV.g('JV_DIST_INI', '0'), 10);
if (ini > 0) {
  var min = Math.round((Date.now() - ini) / 6000) / 10;
  if (JV.g('JV_DIA', '') !== JV.hoy()) { JV.set('JV_DIA', JV.hoy()); JV.set('JV_DIST_HOY', 0); }
  JV.set('JV_DIST_HOY', Math.round((parseFloat(JV.g('JV_DIST_HOY', '0')) + min) * 10) / 10);
  JV.log('distraccion', min, JV.g('JV_DIST_APP', ''));
}
JV.set('JV_DIST_INI', 0);
JV.set('JV_DIST_ALERTA', 0);
