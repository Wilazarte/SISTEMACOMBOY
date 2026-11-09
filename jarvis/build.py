#!/usr/bin/env python3
"""Genera los XML importables de Tasker para JARVIS a partir de tasker/js/*.js.

Uso:  python3 jarvis/build.py
Salida: jarvis/tasker/JARVIS.prj.xml  (proyecto completo)
        jarvis/tasker/perfiles/*.prf.xml  (cada perfil con sus tareas)
        jarvis/tasker/tareas/*.tsk.xml    (cada tarea suelta)
"""
from pathlib import Path
from xml.sax.saxutils import escape

RAIZ = Path(__file__).resolve().parent
JS = RAIZ / "tasker" / "js"
SALIDA = RAIZ / "tasker"
TV = "6.3.13"
FECHA = "1762646400000"  # 2025-11-09, solo metadato

LIB = (JS / "00_lib.js").read_text(encoding="utf-8")

# id, nombre, archivo js, timeout (s), prioridad
TAREAS = [
    (101, "JARVIS Brain + Voice", "10_brain_voice.js", 90, 100),
    (102, "JARVIS Distraccion Inicio", "20_distraccion_inicio.js", 10, 50),
    (103, "JARVIS Distraccion Fin", "21_distraccion_fin.js", 10, 50),
    (104, "JARVIS Vigia", "30_vigia.js", 60, 40),
    (105, "JARVIS Notificacion", "40_notificacion.js", 60, 40),
    (106, "JARVIS Registrar", "50_registrar.js", 10, 50),
    (107, "JARVIS Setup", "60_setup.js", 60, 100),
    (108, "JARVIS No Molestar", "70_no_molestar.js", 10, 60),
    (109, "JARVIS Enviar WhatsApp", "80_enviar_whatsapp.js", 10, 60),
]

APPS_DISTRACCION = [
    ("TikTok", "com.zhiliaoapp.musically"),
    ("TikTok", "com.ss.android.ugc.trill"),
    ("TikTok Lite", "com.zhiliaoapp.musically.go"),
    ("Instagram", "com.instagram.android"),
]

# id, nombre, tarea entrada, tarea salida, xml del contexto
PERFILES = [
    (201, "JARVIS Detector Distraccion", 102, 103,
     '<App sr="con0" ve="2">\n<flags>2</flags>\n'
     + "".join(f"<label{i}>{escape(l)}</label{i}>\n<pkg{i}>{p}</pkg{i}>\n"
               for i, (l, p) in enumerate(APPS_DISTRACCION))
     + "</App>"),
    (202, "JARVIS Vigia Patrones", 104, None,
     '<Time sr="con0">\n<fh>0</fh>\n<fm>0</fm>\n<rep>2</rep>\n<repval>2</repval>\n'
     '<th>23</th>\n<tm>59</tm>\n</Time>'),
]


def accion_js(codigo: str, timeout: int) -> str:
    return (
        '<Action sr="act0" ve="7">\n<code>129</code>\n'
        f'<Str sr="arg0" ve="3">{escape(codigo)}</Str>\n'
        '<Str sr="arg1" ve="3"/>\n'
        '<Int sr="arg2" val="1"/>\n'
        f'<Int sr="arg3" val="{timeout}"/>\n</Action>'
    )


def tarea_xml(tid, nombre, archivo, timeout, pri) -> str:
    codigo = LIB + "\n\n" + (JS / archivo).read_text(encoding="utf-8")
    return (
        f'<Task sr="task{tid}">\n<cdate>{FECHA}</cdate>\n<edate>{FECHA}</edate>\n'
        f"<id>{tid}</id>\n<nme>{escape(nombre)}</nme>\n<pri>{pri}</pri>\n"
        f"{accion_js(codigo, timeout)}\n</Task>"
    )


def perfil_xml(pid, nombre, entra, sale, contexto) -> str:
    mids = f"<mid0>{entra}</mid0>\n" + (f"<mid1>{sale}</mid1>\n" if sale else "")
    return (
        f'<Profile sr="prof{pid}" ve="2">\n<cdate>{FECHA}</cdate>\n<edate>{FECHA}</edate>\n'
        f"<flags>8</flags>\n<id>{pid}</id>\n{mids}<nme>{escape(nombre)}</nme>\n{contexto}\n</Profile>"
    )


def envolver(cuerpo: str) -> str:
    return f'<TaskerData sr="" dvi="1" tv="{TV}">\n{cuerpo}\n</TaskerData>\n'


def slug(n: str) -> str:
    return n.replace(" + ", "_").replace(" ", "_")


def main():
    tareas = {t[0]: tarea_xml(*t) for t in TAREAS}
    perfiles = {p[0]: perfil_xml(*p) for p in PERFILES}

    proyecto = (
        f'<Project sr="proj0" ve="2">\n<cdate>{FECHA}</cdate>\n<name>JARVIS</name>\n'
        f"<pids>{','.join(str(p) for p in perfiles)}</pids>\n"
        f"<tids>{','.join(str(t) for t in tareas)}</tids>\n</Project>"
    )
    (SALIDA / "JARVIS.prj.xml").write_text(
        envolver("\n".join(perfiles.values()) + "\n" + proyecto + "\n" + "\n".join(tareas.values())),
        encoding="utf-8")

    (SALIDA / "perfiles").mkdir(exist_ok=True)
    for pid, nombre, entra, sale, _ in PERFILES:
        cuerpo = [perfiles[pid], tareas[entra]] + ([tareas[sale]] if sale else [])
        (SALIDA / "perfiles" / f"{slug(nombre)}.prf.xml").write_text(envolver("\n".join(cuerpo)), encoding="utf-8")

    (SALIDA / "tareas").mkdir(exist_ok=True)
    for tid, nombre, *_ in TAREAS:
        (SALIDA / "tareas" / f"{slug(nombre)}.tsk.xml").write_text(envolver(tareas[tid]), encoding="utf-8")

    print("OK:", len(tareas), "tareas,", len(perfiles), "perfiles")


if __name__ == "__main__":
    main()
