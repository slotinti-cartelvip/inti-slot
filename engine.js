/* ============================================================
   INTI — MOTOR DE JUEGO
   ------------------------------------------------------------
   Toda la lógica y la matemática viven aquí. Este archivo NO
   toca la pantalla: no sabe nada de HTML ni de animaciones.

   Corre igual en tres lugares:
     - el navegador   -> <script src="engine.js"></script>
     - el simulador   -> require('./engine.js')
     - las pruebas    -> require('./engine.js')

   Eso importa: la matemática que mides en el simulador es
   exactamente la que juega el usuario. No hay dos versiones.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- CONFIGURACIÓN ----------
     Todo lo ajustable del juego está en este bloque. */
  var CONFIG = {
    COLS: 6,                  // columnas de la cuadrícula
    ROWS: 5,                  // filas
    MIN_PARA_PAGAR: 8,        // cuántos símbolos iguales hacen falta
    TRAMOS: [[8, 9], [10, 11], [12, 30]],  // rangos de la tabla de pagos
    PROB_ORBE: 0.008,         // probabilidad de orbe por celda nueva
    PROB_ORBE_GRATIS: 0.018,  // ídem durante giros gratis
    PROB_SCATTER: 0.020,      // solo en la caída inicial
    SCATTERS_PARA_GRATIS: 4,
    GIROS_GRATIS: 10,
    MAX_CASCADAS: 50,         // tope de seguridad contra bucles infinitos
    ORBES: [
      { v: 2, p: 34 }, { v: 3, p: 24 }, { v: 4, p: 16 }, { v: 5, p: 11 },
      { v: 6, p: 7 }, { v: 8, p: 4 }, { v: 10, p: 2.4 }, { v: 15, p: 1.2 },
      { v: 25, p: 0.6 }, { v: 50, p: 0.25 }, { v: 100, p: 0.1 }, { v: 500, p: 0.02 }
    ]
  };

  /* ---------- SÍMBOLOS ----------
     pagos = [tramo 8-9, tramo 10-11, tramo 12+] multiplicado por la apuesta
     peso  = qué tan seguido aparece (mayor = más común)
     Calibrado a RTP 96,25% — si tocas un número, vuelve a correr sim.js */
  var SIMBOLOS = [
    { id: 'copa',      nombre: 'Copa',      color: '#B15CD8', pagos: [0.18, 0.35, 0.70],  peso: 24 },
    { id: 'triangulo', nombre: 'Triángulo', color: '#3FC97E', pagos: [0.20, 0.42, 0.85],  peso: 22 },
    { id: 'hexagono',  nombre: 'Hexágono',  color: '#F0A93B', pagos: [0.28, 0.55, 1.10],  peso: 20 },
    { id: 'pentagono', nombre: 'Pentágono', color: '#E0453F', pagos: [0.35, 0.70, 1.40],  peso: 17 },
    { id: 'rombo',     nombre: 'Rombo',     color: '#3AA9E8', pagos: [0.55, 1.10, 2.80],  peso: 14 },
    { id: 'tumi',      nombre: 'Tumi',      color: '#D9A441', pagos: [0.70, 1.40, 3.50],  peso: 10 },
    { id: 'chakana',   nombre: 'Chakana',   color: '#2FD3C4', pagos: [1.40, 2.80, 7.00],  peso: 7  },
    { id: 'inti',      nombre: 'Inti',      color: '#FFC93C', pagos: [3.50, 7.00, 17.50], peso: 4  }
  ];

  /* ============================================================
     GENERADOR DE NÚMEROS ALEATORIOS
     ------------------------------------------------------------
     Con semilla, la secuencia es siempre la misma. Eso permite
     reproducir un giro exacto para depurar o para probar.
     Sin semilla usa Math.random.

     OJO para más adelante: Math.random NO sirve para dinero real.
     Un laboratorio exige un RNG criptográfico certificado. Este
     de aquí es para desarrollo y pruebas.
     ============================================================ */
  function crearRNG(semilla) {
    if (semilla === undefined || semilla === null) return Math.random;
    var a = semilla >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function redondear(n) { return Math.round(n * 100) / 100; }
  function clonar(grid) { return grid.map(function (col) { return col.map(function (c) { return Object.assign({}, c); }); }); }

  /* ============================================================
     MOTOR
     ============================================================ */
  function crearMotor(opciones) {
    opciones = opciones || {};
    var cfg = Object.assign({}, CONFIG, opciones.config || {});
    var simbolos = opciones.simbolos || SIMBOLOS;
    var rnd = crearRNG(opciones.semilla);

    var porId = {};
    simbolos.forEach(function (s) { porId[s.id] = s; });
    var pesoTotal = simbolos.reduce(function (a, s) { return a + s.peso; }, 0);
    var pesoOrbes = cfg.ORBES.reduce(function (a, o) { return a + o.p; }, 0);

    /* ---------- generación ---------- */
    function simboloAlAzar() {
      var r = rnd() * pesoTotal;
      for (var i = 0; i < simbolos.length; i++) { r -= simbolos[i].peso; if (r <= 0) return simbolos[i]; }
      return simbolos[simbolos.length - 1];
    }

    function valorOrbeAlAzar() {
      var r = rnd() * pesoOrbes;
      for (var i = 0; i < cfg.ORBES.length; i++) { r -= cfg.ORBES[i].p; if (r <= 0) return cfg.ORBES[i].v; }
      return cfg.ORBES[cfg.ORBES.length - 1].v;
    }

    function celdaNueva(esCaidaInicial, esGratis) {
      var probOrbe = esGratis ? cfg.PROB_ORBE_GRATIS : cfg.PROB_ORBE;
      if (esCaidaInicial && rnd() < cfg.PROB_SCATTER) return { t: 'scatter' };
      if (rnd() < probOrbe) return { t: 'orbe', v: valorOrbeAlAzar() };
      return { t: 'sim', id: simboloAlAzar().id };
    }

    function nuevaGrid(esGratis) {
      var g = [];
      for (var c = 0; c < cfg.COLS; c++) {
        var col = [];
        for (var r = 0; r < cfg.ROWS; r++) col.push(celdaNueva(true, esGratis));
        g.push(col);
      }
      return g;
    }

    /* ---------- lectura del tablero ---------- */
    function contar(grid) {
      var m = {};
      for (var c = 0; c < grid.length; c++) {
        for (var r = 0; r < grid[c].length; r++) {
          var cel = grid[c][r];
          if (cel.t === 'sim') m[cel.id] = (m[cel.id] || 0) + 1;
        }
      }
      return m;
    }

    function tramo(cantidad) {
      for (var i = 0; i < cfg.TRAMOS.length; i++) {
        if (cantidad >= cfg.TRAMOS[i][0] && cantidad <= cfg.TRAMOS[i][1]) return i;
      }
      return cantidad > cfg.TRAMOS[cfg.TRAMOS.length - 1][1] ? cfg.TRAMOS.length - 1 : -1;
    }

    function contarScatters(grid) {
      var n = 0;
      for (var c = 0; c < grid.length; c++)
        for (var r = 0; r < grid[c].length; r++)
          if (grid[c][r].t === 'scatter') n++;
      return n;
    }

    function listaOrbes(grid) {
      var out = [];
      for (var c = 0; c < grid.length; c++)
        for (var r = 0; r < grid[c].length; r++)
          if (grid[c][r].t === 'orbe') out.push(grid[c][r].v);
      return out;
    }

    /* ---------- evaluación de una caída ---------- */
    function evaluar(grid, apuesta) {
      var cuentas = contar(grid);
      var ganadores = [];
      var pago = 0;
      Object.keys(cuentas).forEach(function (id) {
        if (cuentas[id] >= cfg.MIN_PARA_PAGAR) {
          ganadores.push(id);
          pago += porId[id].pagos[tramo(cuentas[id])] * apuesta;
        }
      });
      return { ganadores: ganadores, cuentas: cuentas, pago: redondear(pago) };
    }

    /* ---------- cascada: quitar, dejar caer, rellenar ----------
       Los orbes y los scatters NUNCA se quitan: se quedan hasta
       que termina la secuencia. */
    function derrumbar(grid, ganadores, esGratis) {
      var nuevaG = [];
      var posNuevas = [];
      for (var c = 0; c < grid.length; c++) {
        var quedan = grid[c].filter(function (cel) {
          return !(cel.t === 'sim' && ganadores.indexOf(cel.id) >= 0);
        });
        var faltan = cfg.ROWS - quedan.length;
        var arriba = [];
        for (var i = 0; i < faltan; i++) {
          arriba.push(celdaNueva(false, esGratis));
          posNuevas.push(c + '-' + i);
        }
        nuevaG.push(arriba.concat(quedan));
      }
      return { grid: nuevaG, nuevas: posNuevas };
    }

    /* ---------- un giro completo ----------
       Devuelve el resultado YA RESUELTO más la lista de pasos.
       La interfaz solo reproduce los pasos: no decide nada.
       Esta separación es la que permite, más adelante, mover
       esta función al servidor sin tocar el HTML. */
    function girar(apuesta, opts) {
      opts = opts || {};
      var esGratis = !!opts.gratis;

      var grid = nuevaGrid(esGratis);
      var gridInicial = clonar(grid);
      var scatters = contarScatters(grid);

      var pasos = [];
      var pagoCascada = 0;
      var vueltas = 0;

      while (vueltas++ < cfg.MAX_CASCADAS) {
        var ev = evaluar(grid, apuesta);
        if (ev.ganadores.length === 0) break;

        pagoCascada += ev.pago;
        var antes = clonar(grid);
        var res = derrumbar(grid, ev.ganadores, esGratis);

        pasos.push({
          ganadores: ev.ganadores,
          cuentas: ev.cuentas,
          pago: ev.pago,
          gridAntes: antes,
          gridDespues: clonar(res.grid),
          nuevas: res.nuevas
        });

        grid = res.grid;
      }

      var multiplicadores = listaOrbes(grid);
      var multTotal = multiplicadores.reduce(function (a, b) { return a + b; }, 0);
      pagoCascada = redondear(pagoCascada);
      var pagoTotal = (pagoCascada > 0 && multTotal > 0) ? redondear(pagoCascada * multTotal) : pagoCascada;

      return {
        apuesta: apuesta,
        gratis: esGratis,
        gridInicial: gridInicial,
        gridFinal: grid,
        pasos: pasos,
        scatters: scatters,
        multiplicadores: multiplicadores,
        multTotal: multTotal,
        pagoCascada: pagoCascada,
        pagoTotal: pagoTotal,
        activaGratis: !esGratis && scatters >= cfg.SCATTERS_PARA_GRATIS
      };
    }

    /* ---------- ronda completa (giro base + giros gratis si tocan) ---------- */
    function jugarRonda(apuesta) {
      var base = girar(apuesta, { gratis: false });
      var giros = [base];
      var total = base.pagoTotal;

      if (base.activaGratis) {
        for (var i = 0; i < cfg.GIROS_GRATIS; i++) {
          var g = girar(apuesta, { gratis: true });
          giros.push(g);
          total += g.pagoTotal;
        }
      }
      return { giros: giros, pagoTotal: redondear(total), activoGratis: base.activaGratis };
    }

    return {
      cfg: cfg,
      simbolos: simbolos,
      porId: porId,
      girar: girar,
      jugarRonda: jugarRonda,
      // expuestos para las pruebas
      _: {
        contar: contar, tramo: tramo, evaluar: evaluar, derrumbar: derrumbar,
        nuevaGrid: nuevaGrid, celdaNueva: celdaNueva,
        contarScatters: contarScatters, listaOrbes: listaOrbes,
        simboloAlAzar: simboloAlAzar, valorOrbeAlAzar: valorOrbeAlAzar
      }
    };
  }

  var API = {
    CONFIG: CONFIG,
    SIMBOLOS: SIMBOLOS,
    crearMotor: crearMotor,
    crearRNG: crearRNG,
    redondear: redondear,
    clonar: clonar
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.INTI = API;

})(typeof window !== 'undefined' ? window : globalThis);
