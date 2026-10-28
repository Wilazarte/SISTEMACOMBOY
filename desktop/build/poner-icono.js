// Hook afterPack de electron-builder: pone el icono y los datos de versión
// en el .exe con resedit (JavaScript puro), así se puede compilar para
// Windows desde Linux sin wine. En Windows funciona igual.
const fs = require("fs");
const path = require("path");

exports.default = async function ponerIcono(context) {
  if (context.electronPlatformName !== "win32") return;
  const { NtExecutable, NtExecutableResource, Data, Resource } = await import("resedit");

  const info = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${info.productFilename}.exe`);
  const exe = NtExecutable.from(fs.readFileSync(exePath));
  const res = NtExecutableResource.from(exe);

  const ico = Data.IconFile.from(fs.readFileSync(path.join(__dirname, "icon.ico")));
  const grupos = Resource.IconGroupEntry.fromEntries(res.entries);
  const idGrupo = grupos.length ? grupos[0].id : 1;
  const idioma = grupos.length ? grupos[0].lang : 1033;
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, idGrupo, idioma, ico.icons.map((i) => i.data)
  );

  const [vi] = Resource.VersionInfo.fromEntries(res.entries);
  const v = info.version.split(".").map(Number);
  vi.setFileVersion(v[0], v[1] || 0, v[2] || 0, 0, 1033);
  vi.setProductVersion(v[0], v[1] || 0, v[2] || 0, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: info.productName,
    ProductName: info.productName,
    CompanyName: info.companyName || "",
    LegalCopyright: info.copyright,
    OriginalFilename: `${info.productFilename}.exe`,
    InternalName: info.productFilename,
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
};
