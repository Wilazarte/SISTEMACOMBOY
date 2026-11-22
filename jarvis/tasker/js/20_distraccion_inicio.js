/* Tarea: JARVIS Distraccion Inicio (entrada del perfil de apps de redes). */
var app = '';
if (typeof app_name !== 'undefined' && app_name && app_name !== '%app_name') app = String(app_name);
if (!app) app = JV.g('WIN', 'Redes');
if (JV.g('JV_DIST_INI', '0') === '0') JV.set('JV_DIST_INI', Date.now());
JV.set('JV_DIST_APP', app);
JV.log('app_abierta', app, '');
