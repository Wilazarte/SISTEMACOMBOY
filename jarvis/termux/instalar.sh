#!/data/data/com.termux/files/usr/bin/bash
# JARVIS · instalación en Termux (instala Termux desde F-Droid, no desde Play Store)
set -e
pkg update -y
pkg install -y python termux-api
termux-setup-storage   # acepta el permiso de almacenamiento cuando aparezca
mkdir -p ~/jarvis ~/.termux/boot ~/storage/shared/COMBOY
cp "$(dirname "$0")/jarvis_server.py" ~/jarvis/
if [ ! -f ~/.jarvis.env ]; then
  TOKEN=$(python -c "import secrets; print(secrets.token_hex(16))")
  cat > ~/.jarvis.env <<ENV
CLAVE_CLAUDE=
CLAVE_ELEVEN=
JARVIS_TOKEN=$TOKEN
JV_DUENO=Williams
JV_META=0
JV_MONEDA=S/
ENV
  chmod 600 ~/.jarvis.env
  echo "Token generado. Copia este valor a la variable %JV_TOKEN de Tasker: $TOKEN"
fi
cat > ~/.termux/boot/jarvis.sh <<'BOOT'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
cd ~/jarvis && python jarvis_server.py >> ~/jarvis/server.log 2>&1
BOOT
chmod +x ~/.termux/boot/jarvis.sh
echo "Listo. Edita ~/.jarvis.env (nano ~/.jarvis.env) y arranca con: bash ~/.termux/boot/jarvis.sh"
