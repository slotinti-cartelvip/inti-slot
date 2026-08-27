/* ============================================================
   INTI — INTERFAZ
   ------------------------------------------------------------
   Esta capa NO decide nada. Le pide un giro al motor, recibe el
   resultado ya resuelto con la lista de pasos, y lo reproduce.

   Como el resultado está decidido ANTES de animar, el jugador
   puede saltarse la animación en cualquier momento sin que eso
   cambie lo que gana. Por eso el botón de saltar es seguro.
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
    revelarMultiplicador: 850,
    mostrarTotal: 900,
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

  /* ============================================================
     ESPERA CANCELABLE
     Permite que un toque corte la animación al instante.
     ============================================================ */
  var saltar = false;
  var cancelarEsperaActual = null;

  function espera(ms) {
    return new Promise(function (resolver) {
      if (saltar) { resolver(); return; }
      var t = setTimeout(function () { cancelarEsperaActual = null; resolver(); }, ms);
      cancelarEsperaActual = function () {
        clearTimeout(t);
        cancelarEsperaActual = null;
        resolver();
      };
    });
  }

  function pedirSalto() {
    if (!ocupado || saltar) return;
    saltar = true;
    ocultarAviso();
    if (cancelarEsperaActual) cancelarEsperaActual();
  }

  /* ============================================================
     DIBUJO DEL TABLERO
     ============================================================ */
  function pintar(grid, posNuevas) {
    var nuevas = posNuevas ? posNuevas : null;
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

        if (nuevas && nuevas.indexOf(pos) >= 0) clases += ' nuevo';
        html += '<div class="' + clases + '" data-pos="' + pos + '">' + dentro + '</div>';
      }
    }
    $('grid').innerHTML = html;
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
          if (el) { el.classList.add('gana'); chispear(el, 4); }
        }
      }
    }
  }

  /* ============================================================
     CONTADOR DE COMBO
     Se muestra arriba del tablero y sube con cada cascada.
     El nivel cambia el color y el tamaño para que se sienta
     que la cadena está creciendo.
     ============================================================ */
  function mostrarCombo(nivel, acumulado) {
    var el = $('combo');
    $('comboX').textContent = '×' + nivel;
    $('comboMonto').textContent = '+' + INTI.redondear(acumulado);

    el.className = 'combo on nivel' + Math.min(nivel, 5);
    // reinicia la animación de latido
    void el.offsetWidth;
    el.classList.add('late');
  }

  function ocultarCombo() { $('combo').className = 'combo'; }

  /* ============================================================
     TOTAL DE LA JUGADA
     ============================================================ */
  function mostrarTotal(texto, monto, grande) {
    $('totalCap').textContent = texto;
    $('totalNum').textContent = INTI.redondear(monto);
    $('total').className = 'total on' + (grande ? ' grande' : '');
  }

  function ocultarTotal() { $('total').className = 'total'; }

  function mostrarAviso() { $('skiphint').classList.add('on'); }
  function ocultarAviso() { $('skiphint').classList.remove('on'); }



  /* ============================================================
     NÚMEROS QUE SUBEN
     ------------------------------------------------------------
     El monto no aparece de golpe: trepa. Esa media pausa
     mientras el número corre es lo que hace que un premio se
     sienta premio y no un dato.
     La duración crece con el tamaño del premio, con tope, para
     que un premio grande se saboree y uno chico no aburra.
     ============================================================ */
  function animarNumero(el, desde, hasta, ms, alTerminar) {
    var t0 = null;
    var salto = hasta - desde;

    function paso(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / ms);
      var suave = 1 - Math.pow(1 - p, 3);        // frena al final
      el.textContent = INTI.redondear(desde + salto * suave);
      if (p < 1) requestAnimationFrame(paso);
      else {
        el.textContent = INTI.redondear(hasta);
        if (alTerminar) alTerminar();
      }
    }
    requestAnimationFrame(paso);
  }

  function duracionConteo(veces) {
    if (veces >= 50) return 2200;
    if (veces >= 20) return 1500;
    if (veces >= 5)  return 950;
    return 550;
  }

  /* ============================================================
     CHISPAS
     Saltan de cada símbolo que paga. Se borran solas.
     ============================================================ */
  function chispear(celda, cantidad) {
    for (var i = 0; i < cantidad; i++) {
      var c = document.createElement('span');
      c.className = 'chispa';
      var ang = Math.random() * Math.PI * 2;
      var dist = 22 + Math.random() * 26;
      c.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'px');
      c.style.setProperty('--dy', (Math.sin(ang) * dist).toFixed(1) + 'px');
      c.style.left = (28 + Math.random() * 44) + '%';
      c.style.top  = (28 + Math.random() * 44) + '%';
      c.style.animationDelay = (Math.random() * 0.22).toFixed(2) + 's';
      celda.appendChild(c);
      (function (el) { setTimeout(function () { el.remove(); }, 1100); })(c);
    }
  }

  function barrerLuz() {
    var b = document.createElement('div');
    b.className = 'brillo';
    $('board').appendChild(b);
    setTimeout(function () { b.remove(); }, 1000);
  }

  /* ============================================================
     EL EKEKO
     Respira siempre (eso va por CSS). Aqui solo se le avisa
     cuando hay premio para que celebre.
     El dia que lo cambies por una animacion Lottie, este es el
     unico lugar del codigo que hay que tocar.
     ============================================================ */
  function ekekoCelebra() {
    var p = $('personaje');
    if (!p) return;
    p.classList.remove('celebra');
    void p.offsetWidth;          // reinicia la animacion
    p.classList.add('celebra');
    setTimeout(function () { p.classList.remove('celebra'); }, 1400);
  }

  /* ============================================================
     REPRODUCCIÓN DE UN GIRO
     ============================================================ */
  async function reproducir(resultado) {
    pintar(resultado.gridInicial, todasLasPosiciones());
    tono(180, 0.06, 0.04);
    if (resultado.pasos.length > 0) mostrarAviso();
    await espera(TIEMPOS.caidaInicial);

    var acumulado = 0;

    for (var i = 0; i < resultado.pasos.length; i++) {
      if (saltar) break;
      var paso = resultado.pasos[i];
      acumulado += paso.pago;

      pintar(paso.gridAntes, null);
      resaltar(paso.gridAntes, paso.ganadores);
      mostrarCombo(i + 1, acumulado);
      tono(520 + i * 70, 0.12, 0.05);
      await espera(TIEMPOS.resaltarGanadores);
      if (saltar) break;

      var marcados = document.querySelectorAll('.cell.gana');
      for (var k = 0; k < marcados.length; k++) marcados[k].classList.add('sale');
      await espera(TIEMPOS.estallido);
      if (saltar) break;

      pintar(paso.gridDespues, paso.nuevas);
      await espera(TIEMPOS.caidaCascada);
    }

    ocultarAviso();

    // Si se saltó, mostramos directamente el estado final
    if (saltar) {
      pintar(resultado.gridFinal, null);
      if (resultado.pasos.length > 0) {
        mostrarCombo(resultado.pasos.length, resultado.pagoCascada);
      }
      return;
    }

    if (resultado.pagoCascada > 0 && resultado.multTotal > 0) {
      var conMult = INTI.redondear(resultado.pagoCascada * resultado.multTotal);
      mostrarTotal('Multiplicador ×' + resultado.multTotal, resultado.pagoCascada, true);
      $('totalNum').classList.add('contando');
      animarNumero($('totalNum'), resultado.pagoCascada, conMult,
                   duracionConteo(resultado.multTotal), function () {
        $('totalNum').classList.remove('contando');
      });
      barrerLuz();
      fanfarria(resultado.multTotal);
      ekekoCelebra();
      await espera(TIEMPOS.revelarMultiplicador);
    }
  }

  /* ============================================================
     CICLO DE JUEGO
     ============================================================ */
  async function jugar() {
    if (ocupado) return;

    var apuesta = APUESTAS[idxApuesta];
    var esGratis = girosGratisRestantes > 0;

    if (!esGratis && creditos < apuesta) {
      mensaje('Créditos insuficientes. Recarga para seguir probando.', '');
      return;
    }

    ocupado = true;
    saltar = false;
    bloquear(true);
    ocultarCombo();
    ocultarTotal();
    $('gain').textContent = '0';

    if (!esGratis) {
      creditos -= apuesta;
      $('credits').textContent = INTI.redondear(creditos);
    }

    // El giro se resuelve entero AQUÍ, antes de animar nada.
    var resultado = motor.girar(apuesta, { gratis: esGratis });

    await reproducir(resultado);

    if (resultado.pagoTotal > 0) {
      var veces = resultado.pagoTotal / apuesta;
      var dur = duracionConteo(veces);
      var creditosAntes = creditos;
      creditos += resultado.pagoTotal;

      mostrarTotal(esGratis ? 'Giro gratis' : 'Ganancia', 0, veces >= 20);
      $('totalNum').classList.add('contando');
      animarNumero($('totalNum'), 0, resultado.pagoTotal, dur, function () {
        $('totalNum').classList.remove('contando');
      });
      animarNumero($('gain'), 0, resultado.pagoTotal, dur);
      animarNumero($('credits'), creditosAntes, creditos, dur);

      if (veces >= 20) barrerLuz();
      if (!esGratis) fanfarria(veces);
      if (resultado.multTotal === 0) ekekoCelebra();
      mensaje('', '');
    } else {
      ocultarCombo();
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
      ekekoCelebra();
    }

    ocupado = false;
    saltar = false;
    bloquear(false);

    if (girosGratisRestantes > 0) {
      await espera(TIEMPOS.entreGirosGratis);
      jugar();
    }
  }

  /* ============================================================
     PANTALLA
     ============================================================ */
  function mensaje(txt, cls) {
    var m = $('message');
    m.textContent = txt;
    m.className = 'message ' + (cls || '');
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

  /* ============================================================
     SONIDO
     ============================================================ */
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
    } catch (e) { /* el navegador bloquea audio antes del primer toque */ }
  }

  function fanfarria(x) {
    if (!sonido) return;
    var notas = x >= 50 ? [523, 659, 784, 1046, 1318, 1568] : [440, 554, 659];
    notas.forEach(function (n, i) {
      setTimeout(function () { tono(n, 0.16, 0.055); }, i * 95);
    });
  }

  /* ============================================================
     TABLA DE PAGOS
     ============================================================ */
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

  /* ============================================================
     ARRANQUE
     ============================================================ */
  $('spin').addEventListener('click', jugar);
  $('betUp').addEventListener('click', function () { cambiarApuesta(1); });
  $('betDown').addEventListener('click', function () { cambiarApuesta(-1); });

  // Tocar el tablero salta la animación (el resultado ya está decidido)
  $('board').addEventListener('click', pedirSalto);
  $('board').addEventListener('touchstart', pedirSalto, { passive: true });

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
    if (e.code !== 'Space' || e.target !== document.body) return;
    e.preventDefault();
    if (ocupado) pedirSalto();   // espacio durante la animación = saltar
    else jugar();                // espacio en reposo = girar
  });

  pintarTabla();
  pintar(motor._.nuevaGrid(false), null);

})();
