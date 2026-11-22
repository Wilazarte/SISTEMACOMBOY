/* Tarea: JARVIS No Molestar · %par1 = on|off
   Tasker no tiene función JavaScript para No Molestar. Esta tarea trae, DEBAJO de este
   JavaScriptlet, el lugar para 2 acciones nativas que agregas en 30 s (ver README, paso 6).
   Este script solo deja la variable lista para las condiciones If. */
JV.set('JV_DND', (typeof par1 !== 'undefined' && par1 === 'on') ? 'on' : 'off');
