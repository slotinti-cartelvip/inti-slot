/* ============================================================
   INTI — INTERFAZ
   ------------------------------------------------------------
   Esta capa NO decide nada. Le pide un giro al motor, recibe el
   resultado ya resuelto con la lista de pasos, y lo reproduce.

   Por eso el día que muevas el motor al servidor, este archivo
   casi no cambia: en vez de motor.girar() harás fetch() y el
   resto de la animación queda igual.
   ============================================================ */
(function () {
  'use strict';

  var APUESTAS = [1, 5, 10, 25, 50];
  var CREDITOS_INICIALES = 1000;

  var TIEMPOS = {
    caidaInicial: 380,
    resaltarGanadores: 620,
    estallido: 300,
    caidaCascada: 360,
    revelarMultiplicador: 800,
    entreGirosGratis: 1200
  };

  var motor = INTI.crearMotor();          // sin semilla = aleatorio real
  var arte = window.SIMBOLOS_ARTE;

  var creditos = CREDITOS_INICIALES;
  var idxApuesta = 2;
  var ocupado = false;
  var sonido = true;
  var girosGratisRestantes = 0;
  var acumuladoGratis = 0;

  var $ = function (id) { return document.getElementById(id); };
  var espera = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ---------------- dibujo ---------------- */
  function pintar(grid, posNuevas) {
    var cont = $('grid');
    var nuevas = posNuevas ? new Set(posNuevas) : null;
    var html = '';

    for (var r = 0; r < motor.cfg.ROWS; r++) {
      for (var c = 0; c < motor.cfg.COLS; c++) {
        var cel = grid[c][r];
        var pos = c + '-' + r;
        var clases = 'cell';
        var dentro = '';

        if (cel.t === 'sim') {
          dentro = arte.dibujar(motor.porId[cel.id]);
        } else if (cel.t === 'orbe') {
          clases += ' orbe';
          dentro = '<span class="val">' + cel.v + 'x</span>';
        } else {
          clases += ' scatter';
          dentro = arte.SCATTER;
        }

        if (nuevas && nuevas.has(pos)) clases += ' nuevo';
        html += '<div class="' + clases + '" data-pos="' + pos + '">' + dentro + '</div>';
      }
    }
    cont.innerHTML = html;
  }

  function todasLasPosiciones() {
    var a = [];
    for (var c = 0; c < motor.cfg.COLS; c++)
      for (var r = 0; r < motor.cfg.ROWS; r++) a.push(c + '-' + r);
    return a;
  }

  function resaltar(grid, ganadores) {
    for (var c = 0; c < motor.cfg.COLS; c++) {
      for (var r = 0; r < motor.cfg.ROWS; r++) {
        var cel = grid[c][r];
        if (cel.t === 'sim' && ganadores.indexOf(cel.id) >= 0) {
          var el = document.querySelector('[data-pos="' + c + '-' + r + '"]');
          if (el) el.classList.add('gana');
        }
      }
    }
  }

  /* ---------------- reproducción de un giro ---------------- */
  async function reproducir(resultado) {
    pintar(resultado.gridInicial, todasLasPosiciones());
    tono(180, 0.06, 0.04);
    await espera(TIEMPOS.caidaInicial);

    for (var i = 0; i < resultado.pasos.length; i++) {
      var paso = resultado.pasos[i];

      pintar(paso.gridAntes, null);
      resaltar(paso.gridAntes, paso.ganadores);
      mensaje('Cascada ' + (i + 1) + ' · +' + paso.pago, 'win');
      tono(520 + i * 60, 0.12, 0.05);
      await espera(TIEMPOS.resaltarGanadores);

      document.querySelectorAll('.cell.gana').forEach(function (e) { e.classList.add('sale'); });
      await espera(TIEMPOS.estallido);

      pintar(paso.gridDespues, paso.nuevas);
      await espera(TIEMPOS.caidaCascada);
    }

    if (resultado.pagoCascada > 0 && resultado.multTotal > 0) {
      mensaje('Multiplicador total ' + resultado.multTotal + '×', 'win');
      fanfarria(resultado.multTotal);
      await espera(TIEMPOS.revelarMultiplicador);
    }
  }

  /* ---------------- ciclo de juego ---------------- */
  async function jugar() {
    if (ocupado) return;

    var apuesta = APUESTAS[idxApuesta];
    var esGratis = girosGratisRestantes > 0;

    if (!esGratis && creditos < apuesta) {
      mensaje('Créditos insuficientes. Recarga para seguir probando.', '');
      return;
    }

    ocupado = true;
    bloquear(true);
    $('banner').classList.remove('on');
    $('gain').textContent = '0';

    if (!esGratis) {
      creditos -= apuesta;
      $('credits').textContent = redondearVista(creditos);
    }

    // AQUÍ se resuelve el giro entero, de una sola vez.
    var resultado = motor.girar(apuesta, { gratis: esGratis });

    await reproducir(resultado);

    if (resultado.pagoTotal > 0) {
      creditos += resultado.pagoTotal;
      $('credits').textContent = redondearVista(creditos);
      $('gain').textContent = resultado.pagoTotal;
      mostrarBanner(esGratis ? 'Ganancia del giro gratis' : 'Ganancia total', resultado.pagoTotal);
      if (!esGratis) fanfarria(resultado.pagoTotal / apuesta);
    } else if (resultado.pasos.length === 0) {
      mensaje('Sin combinación. Otra vez.', '');
    }

    if (esGratis) {
      acumuladoGratis += resultado.pagoTotal;
      girosGratisRestantes--;
      if (girosGratisRestantes > 0) {
        mensaje('Giros gratis restantes: ' + girosGratisRestantes, 'free');
      } else {
        mensaje('Giros gratis terminados · total ' + INTI.redondear(acumuladoGratis), 'free');
        acumuladoGratis = 0;
      }
    } else if (resultado.activaGratis) {
      girosGratisRestantes = motor.cfg.GIROS_GRATIS;
      acumuladoGratis = 0;
      mensaje('¡' + resultado.scatters + ' ídolos! ' + motor.cfg.GIROS_GRATIS + ' giros gratis', 'free');
      fanfarria(100);
    }

    ocupado = false;
    bloquear(false);

    if (girosGratisRestantes > 0) {
      await espera(TIEMPOS.entreGirosGratis);
      jugar();
    }
  }

  /* ---------------- utilidades de pantalla ---------------- */
  function redondearVista(n) { return Math.round(n * 100) / 100; }

  function mensaje(txt, cls) {
    var m = $('message');
    m.textContent = txt;
    m.className = 'message ' + (cls || '');
  }

  function mostrarBanner(txt, num) {
    $('bannerTxt').textContent = txt;
    $('bannerNum').textContent = num;
    $('banner').classList.add('on');
  }

  function bloquear(v) {
    $('spin').disabled = v;
    $('betUp').disabled = v;
    $('betDown').disabled = v;
    $('spin').textContent = girosGratisRestantes > 0 ? 'GRATIS ' + girosGratisRestantes : 'GIRAR';
  }

  function cambiarApuesta(d) {
    if (ocupado || girosGratisRestantes > 0) return;
    idxApuesta = Math.min(APUESTAS.length - 1, Math.max(0, idxApuesta + d));
    $('betAmount').textContent = APUESTAS[idxApuesta];
    $('betView').textContent = APUESTAS[idxApuesta];
  }

  /* ---------------- sonido ---------------- */
  var ctx = null;
  function tono(f, d, v) {
    if (!sonido) return;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(v, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + d);
    } catch (e) { /* el navegador puede bloquear audio antes del primer toque */ }
  }
  function fanfarria(x) {
    var notas = x >= 50 ? [523, 659, 784, 1046, 1318, 1568] : [440, 554, 659];
    notas.forEach(function (n, i) { setTimeout(function () { tono(n, 0.16, 0.055); }, i * 95); });
  }

  /* ---------------- tabla de pagos ---------------- */
  function pintarTabla() {
    var filas = motor.simbolos.slice().reverse().map(function (s) {
      return '<div class="ptrow">' + arte.dibujar(s) +
        '<span>' + s.nombre + '</span>' +
        '<span class="nums">' + s.pagos[0] + '× / ' + s.pagos[1] + '× / ' + s.pagos[2] + '×</span></div>';
    });
    filas.push('<div class="ptrow">' + arte.SCATTER + '<span>Ídolo</span>' +
      '<span class="nums">4+ = ' + motor.cfg.GIROS_GRATIS + ' gratis</span></div>');
    $('paytable').innerHTML = filas.join('');
  }

  /* ---------------- arranque ---------------- */
  $('spin').addEventListener('click', jugar);
  $('betUp').addEventListener('click', function () { cambiarApuesta(1); });
  $('betDown').addEventListener('click', function () { cambiarApuesta(-1); });

  $('recharge').addEventListener('click', function () {
    if (ocupado) return;
    creditos = CREDITOS_INICIALES;
    $('credits').textContent = creditos;
    mensaje('Créditos recargados.', '');
  });

  $('soundToggle').addEventListener('click', function (e) {
    sonido = !sonido;
    e.target.textContent = 'Sonido: ' + (sonido ? 'activado' : 'apagado');
  });

  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); jugar(); }
  });

  pintarTabla();
  pintar(motor._.nuevaGrid(false), null);

})();
