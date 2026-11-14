"use client";

import { useEffect } from "react";

/**
 * Entradas al hacer scroll: cada `[data-revelar]` sube y aparece una vez, al entrar en
 * pantalla. La clase de <html> solo se pone si hay JS, así sin él nada queda oculto.
 * Con "reducir movimiento" el CSS no anima nada.
 */
export function Revelar() {
  useEffect(() => {
    const raiz = document.documentElement;
    const elementos = Array.from(document.querySelectorAll<HTMLElement>(".sitio [data-revelar]"));
    if (!("IntersectionObserver" in window) || elementos.length === 0) return;

    // Lo que ya está en pantalla al cargar se muestra sin esperar al observador.
    const alto = window.innerHeight;
    for (const el of elementos) {
      if (el.getBoundingClientRect().top < alto * 0.9) el.classList.add("s-visto");
    }
    raiz.classList.add("s-con-revelar");

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            e.target.classList.add("s-visto");
            observador.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    for (const el of elementos) if (!el.classList.contains("s-visto")) observador.observe(el);

    return () => {
      observador.disconnect();
      raiz.classList.remove("s-con-revelar");
    };
  }, []);

  return null;
}
