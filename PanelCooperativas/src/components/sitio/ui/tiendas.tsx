import { AppleLogo, GooglePlayLogo } from "@phosphor-icons/react/dist/ssr";

import { tiendasApp } from "@/lib/sitio/urls";

/** true si la app ya tiene al menos un enlace de tienda configurado. */
export function hayAppPublicada(): boolean {
  const { android, ios } = tiendasApp();
  return Boolean(android || ios);
}

/**
 * Botones de Google Play y App Store. Con el enlace configurado son enlaces reales; sin
 * él se muestran como "Próximamente" (no clicables) y, si se pide, con una nota.
 * Nunca enlazan a una tienda que no existe.
 */
export function BotonesTienda({
  tono = "claro",
  nota = true,
  className,
}: {
  /** "noche" para ponerlos sobre fondo oscuro. */
  tono?: "claro" | "noche";
  /** Muestra la nota "Muy pronto…" cuando falta algún enlace. */
  nota?: boolean;
  className?: string;
}) {
  const { android, ios } = tiendasApp();
  const tiendas = [
    { clave: "android", url: android, Icono: GooglePlayLogo, arriba: "Disponible en", nombre: "Google Play" },
    { clave: "ios", url: ios, Icono: AppleLogo, arriba: "Descárgala en", nombre: "App Store" },
  ] as const;
  const faltan = !android || !ios;

  return (
    <div className={["s-tiendas", tono === "noche" && "s-tiendas--noche", className].filter(Boolean).join(" ")}>
      {tiendas.map(({ clave, url, Icono, arriba, nombre }) =>
        url ? (
          <a key={clave} href={url} className="s-tienda" target="_blank" rel="noopener noreferrer">
            <Icono weight="fill" aria-hidden />
            <span>
              <small>{arriba}</small>
              <strong>{nombre}</strong>
            </span>
          </a>
        ) : (
          <span key={clave} className="s-tienda" aria-disabled="true">
            <Icono weight="fill" aria-hidden />
            <span>
              <small>Próximamente en</small>
              <strong>{nombre}</strong>
            </span>
          </span>
        )
      )}
      {nota && faltan && (
        <p className="s-tiendas__nota">
          {android || ios
            ? "Pronto también en la otra tienda."
            : "La app llega muy pronto. Mientras tanto, puedes rastrear tus envíos aquí mismo."}
        </p>
      )}
    </div>
  );
}
