/* ============================================================
   INTI — SÍMBOLOS
   ------------------------------------------------------------
   Solo dibujo. La matemática no pasa por aquí.

   Hay tres clases de símbolo y se eligen con el campo `tipo`
   que viene de engine.js:

     tipo: 'imagen'   -> usa un PNG de la carpeta img/
     tipo: 'letra'    -> dibuja una letra (J, Q, K)
     tipo: 'billete'  -> dibuja un billete con su monto

   Para cambiar un símbolo de letra a imagen, solo agrégale
   `tipo: 'imagen'` y `archivo: 'img/loquesea.png'` en
   engine.js. Aquí no se toca nada.
   ============================================================ */
(function (global) {
  'use strict';

  function envolver(inner) {
    return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  }

  function idGrad(color) { return 'g' + color.replace('#', ''); }

  function degradado(color) {
    return '<defs><linearGradient id="' + idGrad(color) + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#fff" stop-opacity=".62"/>' +
      '<stop offset="42%" stop-color="' + color + '"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity=".62"/>' +
      '</linearGradient></defs>';
  }

  /* ---------- LETRAS (J, Q, K) ----------
     Letra gruesa con contorno oscuro. El contorno es lo que
     hace que se lea sobre cualquier fondo, por eso va grueso
     y detrás del relleno (paint-order). */
  function dibujarLetra(s) {
    var f = 'url(#' + idGrad(s.color) + ')';
    return envolver(
      degradado(s.color) +
      '<text x="50" y="54" text-anchor="middle" dominant-baseline="middle" ' +
      'font-family="Bungee, Impact, sans-serif" font-size="72" ' +
      'fill="' + f + '" stroke="#1A120B" stroke-width="10" paint-order="stroke" ' +
      'style="letter-spacing:0">' + s.texto + '</text>' +
      // brillo superior
      '<text x="50" y="52" text-anchor="middle" dominant-baseline="middle" ' +
      'font-family="Bungee, Impact, sans-serif" font-size="72" ' +
      'fill="#fff" opacity=".18">' + s.texto + '</text>'
    );
  }

  /* ---------- BILLETES (5, 10, 100 Bs) ----------
     Rectángulo inclinado con el monto grande y "Bs" chico.
     El número se achica solo según cuántos dígitos tenga. */
  function dibujarBillete(s) {
    var f = 'url(#' + idGrad(s.color) + ')';
    var digitos = s.texto.length;
    var tam = digitos >= 3 ? 26 : (digitos === 2 ? 32 : 38);

    return envolver(
      degradado(s.color) +
      '<g transform="rotate(-7 50 50)">' +
        '<rect x="9" y="27" width="82" height="46" rx="6" fill="' + f + '" ' +
          'stroke="#1A120B" stroke-width="6"/>' +
        '<rect x="16" y="33" width="68" height="34" rx="4" fill="none" ' +
          'stroke="#fff" stroke-opacity=".45" stroke-width="2"/>' +
        '<text x="46" y="51" text-anchor="middle" dominant-baseline="middle" ' +
          'font-family="Bungee, Impact, sans-serif" font-size="' + tam + '" ' +
          'fill="#fff" stroke="#1A120B" stroke-width="5" paint-order="stroke">' + s.texto + '</text>' +
        '<text x="76" y="52" text-anchor="middle" dominant-baseline="middle" ' +
          'font-family="Bungee, Impact, sans-serif" font-size="15" ' +
          'fill="#fff" stroke="#1A120B" stroke-width="4" paint-order="stroke">Bs</text>' +
      '</g>'
    );
  }

  /* ---------- IMÁGENES ---------- */
  function dibujarImagen(s) {
    return '<img class="art" src="' + s.archivo + '" alt="' + (s.nombre || '') + '" draggable="false">';
  }

  /* ---------- despachador ---------- */
  function dibujar(s) {
    if (!s) return '';
    if (s.tipo === 'imagen' && s.archivo) return dibujarImagen(s);
    if (s.tipo === 'billete') return dibujarBillete(s);
    if (s.tipo === 'letra') return dibujarLetra(s);
    // por si algún símbolo se queda sin tipo definido
    return dibujarLetra({ color: s.color || '#888', texto: (s.nombre || '?').charAt(0) });
  }

  /* ---------- el ídolo (scatter) ---------- */
  var SCATTER = '<img class="art" src="img/ekeko.png" alt="Ekeko" draggable="false">';

  global.SIMBOLOS_ARTE = { dibujar: dibujar, SCATTER: SCATTER };

})(typeof window !== 'undefined' ? window : globalThis);
