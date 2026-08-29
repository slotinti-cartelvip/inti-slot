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
    ROWS: 4,                  // filas
    MIN_PARA_PAGAR: 8,        // cuántos símbolos iguales hacen falta
    TRAMOS: [[8, 9], [10, 11], [12, 24]],  // rangos de la tabla de pagos
    PROB_SCATTER: 0.020,      // solo en la caída inicial
    SCATTERS_PARA_GRATIS: 4,
    GIROS_GRATIS: 10,
    MAX_CASCADAS: 50,         // tope de seguridad contra bucles infinitos

    /* ---------- EL MULTIPLICADOR DEL EKEKO ----------
       Ya no caen orbes en el tablero. Cuando una jugada paga,
       el Ekeko PUEDE aparecer y multiplicar lo ganado.

       PROB_MULT es la perilla principal: sube o baja el RTP
       sin tocar la tabla de pagos ni la frecuencia de premio.
       Solo se sortea si la jugada ya ganó algo: nunca inventa
       un premio de la nada. */
    PROB_MULT: 0.1169,        // 11,69% de las jugadas premiadas — calibrado para RTP 96%
    PROB_MULT_GRATIS: 0.30,   // más seguido en los giros gratis
    MULTIPLICADORES: [
      { v: 2, p: 35 }, { v: 3, p: 25 }, { v: 5, p: 18 }, { v: 8, p: 10 },
      { v: 10, p: 6 }, { v: 15, p: 3 }, { v: 25, p: 2 }, { v: 50, p: 0.8 },
      { v: 100, p: 0.3 }, { v: 500, p: 0.05 }
    ]
  };

  /* ---------- SÍMBOLOS ----------
     pagos = [tramo 8-9, tramo 10-11, tramo 12+] multiplicado por la apuesta
     peso  = qué tan seguido aparece (mayor = más común)
     Calibrado a RTP 96,25% — si tocas un número, vuelve a correr sim.js */
  var SIMBOLOS = [
    { id: 'j',       nombre: 'J',       color: '#3AA9E8', tipo: 'letra',   texto: 'J',   pagos: [1.55, 3.20, 6.40],   peso: 24 },
    { id: 'q',       nombre: 'Q',       color: '#3FC97E', tipo: 'letra',   texto: 'Q',   pagos: [1.90, 3.75, 7.50],   peso: 22 },
    { id: 'k',       nombre: 'K',       color: '#B15CD8', tipo: 'letra',   texto: 'K',   pagos: [2.45, 4.85, 9.60],   peso: 20 },
    { id: 'bs5',     nombre: '5 Bs',    color: '#F0A93B', tipo: 'billete', texto: '5',   pagos: [3.20, 6.40, 13.30],  peso: 17 },
    { id: 'bs10',    nombre: '10 Bs',   color: '#E0453F', tipo: 'billete', texto: '10',  pagos: [4.85, 9.60, 23.20],  peso: 14 },
    { id: 'bs100',   nombre: '100 Bs',  color: '#2FD3C4', tipo: 'billete', texto: '100', pagos: [6.40, 13.30, 29.80], peso: 10 },
    { id: 'chulito', nombre: 'Chulito', color: '#FF7A18', tipo: 'imagen',  archivo: 'img/chulito.png', pagos: [12.10, 24.30, 60.70],  peso: 7 },
    { id: 'casita',  nombre: 'Casita',  color: '#E8703A', tipo: 'imagen',  archivo: 'img/casita.png',  pagos: [29.80, 60.70, 152.40], peso: 4 }
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
    var pesoMult = cfg.MULTIPLICADORES.reduce(function (a, o) { return a + o.p; }, 0);

    /* ---------- generación ---------- */
    function simboloAlAzar() {
      var r = rnd() * pesoTotal;
      for (var i = 0; i < simbolos.length; i++) { r -= simbolos[i].peso; if (r <= 0) return simbolos[i]; }
      return simbolos[simbolos.length - 1];
    }

    function valorMultAlAzar() {
      var r = rnd() * pesoMult;
      for (var i = 0; i < cfg.MULTIPLICADORES.length; i++) {
        r -= cfg.MULTIPLICADORES[i].p;
        if (r <= 0) return cfg.MULTIPLICADORES[i].v;
      }
      return cfg.MULTIPLICADORES[cfg.MULTIPLICADORES.length - 1].v;
    }

    /* El tablero solo tiene símbolos e ídolos. Los orbes se fueron. */
    function celdaNueva(esCaidaInicial, esGratis) {
      if (esCaidaInicial && rnd() < cfg.PROB_SCATTER) return { t: 'scatter' };
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
       Los ídolos nunca se quitan: se quedan hasta que termina
       la secuencia. */
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

      pagoCascada = redondear(pagoCascada);

      /* El Ekeko solo aparece si la jugada ya ganó algo.
         Nunca crea un premio donde no lo había. */
      var multTotal = 0;
      if (pagoCascada > 0) {
        var probMult = esGratis ? cfg.PROB_MULT_GRATIS : cfg.PROB_MULT;
        if (rnd() < probMult) multTotal = valorMultAlAzar();
      }
      var pagoTotal = multTotal > 0 ? redondear(pagoCascada * multTotal) : pagoCascada;

      return {
        apuesta: apuesta,
        gratis: esGratis,
        gridInicial: gridInicial,
        gridFinal: grid,
        pasos: pasos,
        scatters: scatters,
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
        contarScatters: contarScatters,
        simboloAlAzar: simboloAlAzar, valorMultAlAzar: valorMultAlAzar
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

  /* Se publica SIEMPRE en el objeto global, y además como módulo
     si el entorno lo soporta. Así el mismo archivo sirve en el
     navegador, en Node y dentro de un Worker de Cloudflare. */
  global.INTI = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

})(typeof window !== 'undefined' ? window : globalThis);
