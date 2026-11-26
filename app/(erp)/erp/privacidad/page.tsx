import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad | COMBOY VID",
  description: "Política de Privacidad y Eliminación de Datos de COMBOY VID, Arequipa.",
};

const CORREO = "comboyvidaqp@gmail.com";
const URL_PRIVACIDAD = "https://comboy-erp.vercel.app/privacidad";

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
      <div className="space-y-2 leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

// Pagina publica: se muestra a pantalla completa por encima del menu del ERP
export default function PrivacidadPage() {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <header className="mb-8 border-b border-slate-200 pb-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-600">COMBOY VID</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
            Política de Privacidad y Eliminación de Datos
          </h1>
          <p className="mt-3 text-slate-600">
            Distribuidora de soluciones minerales · Arequipa, Perú
          </p>
        </header>

        <div className="space-y-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-10">
          <Seccion titulo="1. Quiénes somos">
            <p>
              COMBOY VID es una distribuidora de soluciones minerales con sede en Arequipa, Perú. Esta
              política explica qué datos personales recopilamos, para qué los usamos y cómo puedes
              solicitar su eliminación.
            </p>
          </Seccion>

          <Seccion titulo="2. Uso de WhatsApp">
            <p>
              Utilizamos la <strong>WhatsApp Cloud API</strong> de Meta exclusivamente para la
              atención al cliente: responder consultas, enviar cotizaciones e información sobre
              nuestros productos y pedidos.
            </p>
          </Seccion>

          <Seccion titulo="3. Datos que recopilamos">
            <p>
              Solo guardamos tu <strong>nombre</strong> y tu <strong>número de teléfono</strong>, junto
              con los mensajes que nos envías por WhatsApp. Estos datos se usan{" "}
              <strong>únicamente para fines de ventas</strong> y atención comercial.
            </p>
          </Seccion>

          <Seccion titulo="4. No compartimos tus datos">
            <p>
              No vendemos, alquilamos ni compartimos tus datos personales con terceros. La información
              se almacena de forma segura y solo la utiliza el equipo comercial de COMBOY VID.
            </p>
          </Seccion>

          <Seccion titulo="5. Eliminación de datos">
            <p>Puedes solicitar en cualquier momento que eliminemos tus datos personales:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Escribiendo a{" "}
                <a href={`mailto:${CORREO}?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos`} className="font-medium text-amber-700 underline underline-offset-2">
                  {CORREO}
                </a>{" "}
                con el asunto &quot;Eliminación de datos&quot; e indicando tu nombre y número de teléfono.
              </li>
              <li>
                O ingresando a{" "}
                <a href={URL_PRIVACIDAD} className="font-medium text-amber-700 underline underline-offset-2">
                  {URL_PRIVACIDAD}
                </a>
                .
              </li>
            </ul>
            <p>Atenderemos tu solicitud y eliminaremos tus datos de nuestros sistemas.</p>
          </Seccion>

          <Seccion titulo="6. Contacto">
            <p>
              Para cualquier consulta sobre esta política escríbenos a{" "}
              <a href={`mailto:${CORREO}`} className="font-medium text-amber-700 underline underline-offset-2">
                {CORREO}
              </a>
              .
            </p>
          </Seccion>
        </div>

        <footer className="mt-8 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} COMBOY VID · Arequipa, Perú
        </footer>
      </div>
    </div>
  );
}
