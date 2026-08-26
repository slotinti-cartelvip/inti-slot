/* ============================================================
   INTI — SÍMBOLOS
   ------------------------------------------------------------
   Solo dibujo. Cambia aquí el arte sin tocar la matemática.
   Cada función devuelve un SVG en una caja de 100×100.
   Si más adelante usas imágenes propias (PNG/WebP), reemplaza
   dibujar() para que devuelva un <img> y listo.
   ============================================================ */
(function (global) {
  'use strict';

  function envolver(inner) {
    return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  }

  function degradado(color) {
    var id = 'g' + color.replace('#', '');
    return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#fff" stop-opacity=".55"/>' +
      '<stop offset="45%" stop-color="' + color + '"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity=".65"/>' +
      '</linearGradient></defs>';
  }

  function poligono(puntos, color) {
    return '<polygon points="' + puntos + '" fill="url(#g' + color.replace('#', '') +
      ')" stroke="' + color + '" stroke-width="4" stroke-linejoin="round"/>';
  }

  var FORMAS = {
    copa:      function (c) { return poligono('14,20 86,20 50,88', c); },
    triangulo: function (c) { return poligono('50,12 88,82 12,82', c); },
    hexagono:  function (c) { return poligono('50,10 86,30 86,70 50,90 14,70 14,30', c); },
    pentagono: function (c) { return poligono('50,10 90,40 75,86 25,86 10,40', c); },
    rombo:     function (c) { return poligono('50,8 88,50 50,92 12,50', c); },

    tumi: function (c) {
      var f = 'url(#g' + c.replace('#', '') + ')';
      return '<circle cx="50" cy="24" r="15" fill="' + f + '" stroke="' + c + '" stroke-width="3"/>' +
        '<rect x="46" y="38" width="8" height="20" fill="' + c + '"/>' +
        '<path d="M18,58 L82,58 A32,32 0 0 1 18,58 Z" fill="' + f + '" stroke="' + c + '" stroke-width="3"/>';
    },

    /* Chakana: la cruz andina escalonada, motivo tradicional */
    chakana: function (c) {
      var f = 'url(#g' + c.replace('#', '') + ')';
      return '<polygon points="40,4 60,4 60,24 80,24 80,44 100,44 100,60 80,60 80,80 60,80 60,98 40,98 40,80 20,80 20,60 0,60 0,44 20,44 20,24 40,24" ' +
        'fill="' + f + '" stroke="' + c + '" stroke-width="3" stroke-linejoin="round"/>' +
        '<circle cx="50" cy="51" r="9" fill="#0B1524"/>';
    },

    /* Inti: el sol, símbolo mayor */
    inti: function (c) {
      var f = 'url(#g' + c.replace('#', '') + ')';
      var rayos = '';
      for (var i = 0; i < 12; i++) {
        var a = (i * 30) * Math.PI / 180;
        var x2 = 50 + Math.cos(a) * 48, y2 = 50 + Math.sin(a) * 48;
        var xa = 50 + Math.cos(a - 0.13) * 30, ya = 50 + Math.sin(a - 0.13) * 30;
        var xb = 50 + Math.cos(a + 0.13) * 30, yb = 50 + Math.sin(a + 0.13) * 30;
        rayos += '<polygon points="' + xa + ',' + ya + ' ' + x2 + ',' + y2 + ' ' + xb + ',' + yb + '" fill="' + c + '"/>';
      }
      return rayos +
        '<circle cx="50" cy="50" r="30" fill="' + f + '" stroke="' + c + '" stroke-width="3"/>' +
        '<circle cx="42" cy="45" r="3.5" fill="#0B1524"/><circle cx="58" cy="45" r="3.5" fill="#0B1524"/>' +
        '<path d="M40,60 Q50,68 60,60" stroke="#0B1524" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
    }
  };

  function dibujar(simbolo) {
    var forma = FORMAS[simbolo.id];
    if (!forma) return '';
    return envolver(degradado(simbolo.color) + forma(simbolo.color));
  }

  var SCATTER = envolver(degradado('#E8B84B') +
    '<path d="M28,16 H72 A6,6 0 0 1 78,22 V62 Q50,94 22,62 V22 A6,6 0 0 1 28,16 Z" ' +
    'fill="url(#gE8B84B)" stroke="#E8B84B" stroke-width="4" stroke-linejoin="round"/>' +
    '<circle cx="39" cy="40" r="5" fill="#0B1524"/><circle cx="61" cy="40" r="5" fill="#0B1524"/>' +
    '<path d="M36,62 H64" stroke="#0B1524" stroke-width="5" stroke-linecap="round"/>');

  global.SIMBOLOS_ARTE = { dibujar: dibujar, SCATTER: SCATTER };

})(typeof window !== 'undefined' ? window : globalThis);
