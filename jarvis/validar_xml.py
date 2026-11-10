#!/usr/bin/env python3
"""Valida la estructura de los XML de Tasker generados por build.py.

Uso:  python3 jarvis/validar_xml.py
Comprueba: XML bien formado, raíz TaskerData con tv 6.2.x, ids únicos, que el
proyecto y los perfiles apunten a tareas existentes, que cada acción sea un
JavaScriptlet (código 129) con sus 4 argumentos, que el JavaScript de cada tarea
compile (con `node --check`, si node está instalado) y que estén los 4 <!-- MANUAL -->.

No reemplaza importar el archivo en Tasker: confirma la estructura, no que Tasker lo acepte.
"""
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

RAIZ = Path(__file__).resolve().parent / "tasker"
errores = []


def error(msg):
    errores.append(msg)
    print("ERROR:", msg)


def revisar(archivo: Path, es_proyecto: bool):
    texto = archivo.read_text(encoding="utf-8")
    try:
        raiz = ET.fromstring(texto)
    except ET.ParseError as e:
        return error(f"{archivo.name}: XML mal formado ({e})")
    if raiz.tag != "TaskerData" or not raiz.get("tv", "").startswith("6.2"):
        error(f"{archivo.name}: raíz debe ser TaskerData con tv 6.2.x")

    tareas = {t.findtext("id"): t for t in raiz.findall("Task")}
    if len(tareas) != len(raiz.findall("Task")):
        error(f"{archivo.name}: ids de tarea repetidos")
    perfiles = raiz.findall("Profile")

    for t in tareas.values():
        nombre = t.findtext("nme")
        if not nombre:
            error(f"{archivo.name}: tarea sin nombre")
        if t.get("sr") != f"task{t.findtext('id')}":
            error(f"{archivo.name}: {nombre}: atributo sr no coincide con id")
        for a in t.findall("Action"):
            if a.findtext("code") != "129":
                error(f"{archivo.name}: {nombre}: acción con código distinto de 129")
            args = {x.get("sr") for x in a}
            if not {"arg0", "arg1", "arg2", "arg3"} <= args:
                error(f"{archivo.name}: {nombre}: JavaScriptlet sin arg0..arg3")
            if node and es_proyecto:
                with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
                    f.write(a.find("Str[@sr='arg0']").text or "")
                r = subprocess.run([node, "--check", f.name], capture_output=True, text=True)
                if r.returncode:
                    error(f"{nombre}: JavaScript no compila\n{r.stderr}")
                Path(f.name).unlink()

    for p in perfiles:
        for mid in ("mid0", "mid1"):
            v = p.findtext(mid)
            if v and v not in tareas:
                error(f"{archivo.name}: perfil {p.findtext('nme')} apunta a tarea {v} inexistente")
        if p.find("App") is None and p.find("Time") is None:
            error(f"{archivo.name}: perfil {p.findtext('nme')} sin contexto")

    if es_proyecto:
        proj = raiz.find("Project")
        if proj is None:
            return error("JARVIS.prj.xml: falta <Project>")
        pids = set(proj.findtext("pids", "").split(","))
        tids = set(proj.findtext("tids", "").split(","))
        if pids != {p.findtext("id") for p in perfiles}:
            error("Project.pids no coincide con los perfiles")
        if tids != set(tareas):
            error("Project.tids no coincide con las tareas")
        n = texto.count("<!-- MANUAL")
        faltan = [c for c in ("AutoVoice", "AutoNotification", "AutoInput", "No molestar")
                  if not any(c in linea for linea in texto.splitlines() if "<!-- MANUAL" in linea)]
        if n != 4 or faltan:
            error(f"placeholders MANUAL: {n} encontrados, faltan {faltan}")
        print(f"JARVIS.prj.xml: {len(perfiles)} perfiles, {len(tareas)} tareas, {n} placeholders MANUAL")


node = shutil.which("node")
if not node:
    print("Aviso: node no está instalado; no se compila el JavaScript.")
revisar(RAIZ / "JARVIS.prj.xml", True)
for f in sorted((RAIZ / "perfiles").glob("*.xml")) + sorted((RAIZ / "tareas").glob("*.xml")):
    revisar(f, False)
print("OK: estructura válida" if not errores else f"{len(errores)} errores")
sys.exit(1 if errores else 0)
