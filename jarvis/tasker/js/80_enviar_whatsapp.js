/* Tarea: JARVIS Enviar WhatsApp · %par1 = número con código de país · %par2 = mensaje
   Abre el chat con el mensaje escrito. El envío automático lo hace la acción de
   AutoInput que agregas debajo (README, paso 7). Sin ella, tú tocas "Enviar". */
var num = (typeof par1 !== 'undefined') ? String(par1).replace(/\D/g, '') : '';
var msg = (typeof par2 !== 'undefined' && par2 !== '%par2') ? String(par2) : '';
if (num) {
  browseURL('https://wa.me/' + num + '?text=' + encodeURIComponent(msg));
  JV.log('whatsapp', num, msg.slice(0, 120));
}
