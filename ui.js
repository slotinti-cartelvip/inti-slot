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

  /* Escalera de apuestas. El límite de mesa es el tope duro:
     ningún jugador puede apostar más, tenga los créditos que tenga.
     En un casino real este número lo fija el operador. */
  var APUESTAS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  var LIMITE_MESA = 500;
  var CREDITOS_INICIALES = 1000;

  /* ============================================================
     VELOCIDAD DEL JUEGO
     ------------------------------------------------------------
     Todos los tiempos en milisegundos, en un solo lugar.
     Los de la cascada están medidos sobre la referencia
     comercial: el resaltado dura cerca de un segundo, el
     estallido un tercio, y el relleno es rápido.

     Para acelerar TODO el juego de una vez, sube RITMO:
       1.0 = normal   0.7 = 30% más rápido   1.3 = más pausado
     ============================================================ */
  var RITMO = 1.0;

  var TIEMPOS = {
    caidaInicial: 380,
    resaltarGanadores: 980,   // el jugador tiene que alcanzar a leer qué ganó
    estallido: 330,
    caidaCascada: 300,
    entreGirosGratis: 1200,
    entreAutomaticos: 550,

    /* --- coreografía del multiplicador --- */
    antesDelOrbe: 700,        // el Ekeko toma impulso antes de que baje
    rayoAntesDelOrbe: 260,    // la luz baja primero, el orbe después
    orbeAntesDelConteo: 620,  // el orbe se deja ver antes de que trepe el número
    despuesDelConteo: 500     // aire al final para leer el total
  };

  // el RITMO escala todos los tiempos de una sola vez
  Object.keys(TIEMPOS).forEach(function (k) {
    TIEMPOS[k] = Math.round(TIEMPOS[k] * RITMO);
  });

  /* El perfil de RTP lo define el panel de operador (perfiles.js).
     Se lee UNA vez al cargar: cambiar de perfil a mitad de partida
     no se hace, hay que recargar. */
  var CONF = window.INTI_CONFIG;
  var perfil = CONF.perfilActivo();
  var motor = INTI.crearMotor({ config: CONF.configDe(perfil) });
  var arte = window.SIMBOLOS_ARTE;

  var creditos = CREDITOS_INICIALES;
  var idxApuesta = 2;
  var ocupado = false;
  var sonido = true;
  var girosGratisRestantes = 0;
  var acumuladoGratis = 0;

  /* ---------- tiros automáticos ---------- */
  var CANTIDADES_AUTO = [10, 25, 50, 100, 250, 500];
  var UMBRAL_PREMIO = 50;          // veces la apuesta
  var autoRestantes = 0;
  var autoConfig = { pararGratis: true, pararPremio: false };
  var autoCantidad = 25;

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

  function mostrarAviso() { $('skiphint').classList.add('on'); }
  function ocultarAviso() { $('skiphint').classList.remove('on'); }



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
  /* ============================================================
     VIDEO DEL EKEKO
     ------------------------------------------------------------
     "reposo" y "lanza" son WebP animado (video real, no CSS).
     Solo una capa tiene la clase .on a la vez.

     Un <img> con WebP animado no avisa por evento cuándo empieza
     o termina su ciclo — por eso la duración va escrita a mano
     abajo (se midió al exportar el archivo). Si algún día cambias
     el video, cambia también el número.

     Si el navegador no logra decodificar el WebP (el evento
     'error' del <img> lo delata), se cae al respaldo: la imagen
     fija con las animaciones de CSS que ya existían.
     ============================================================ */
  var DURACION_LANZA_MS = 3800;   // 38 cuadros a 10 fps
  var videoDisponible = true;
  var lanzando = false;

  var pjReposo   = $('pjReposo');
  var pjLanza    = $('pjLanza');
  var pjEstatico = $('pjEstatico');

  function activarRespaldo() {
    if (!videoDisponible) return;   // ya estaba activo
    videoDisponible = false;
    $('personaje').classList.add('sin-video');
    if (pjReposo) pjReposo.hidden = true;
    if (pjLanza) pjLanza.hidden = true;
    if (pjEstatico) { pjEstatico.hidden = false; pjEstatico.classList.add('on'); }
  }
  if (pjReposo) pjReposo.addEventListener('error', activarRespaldo);
  if (pjLanza) pjLanza.addEventListener('error', activarRespaldo);

  function ekekoLanza() {
    var p = $('personaje');
    if (!p || lanzando) return;

    tono(760, 0.09, 0.05);
    setTimeout(function () { tono(1040, 0.11, 0.045); }, 90);

    if (!videoDisponible) {
      // respaldo: el gesto lo hace el CSS sobre la imagen fija
      p.classList.remove('celebra');
      void p.offsetWidth;
      p.classList.add('celebra');
      setTimeout(function () { p.classList.remove('celebra'); }, 700);
      return;
    }

    lanzando = true;
    p.classList.add('celebra');
    pjReposo.classList.remove('on');
    // cambiar el src reinicia la animación desde el primer cuadro,
    // incluso si el navegador ya la tenía en caché
    pjLanza.src = 'img/ekeko-lanza.webp?r=' + Date.now();
    pjLanza.classList.add('on');

    setTimeout(function () {
      pjLanza.classList.remove('on');
      pjReposo.classList.add('on');
      p.classList.remove('celebra');
      lanzando = false;
    }, DURACION_LANZA_MS);
  }

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
      // el monto aparece directo, sin contador ni cartel
      $('gain').textContent = INTI.redondear(acumulado);
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
        $('gain').textContent = INTI.redondear(resultado.pagoCascada);
      }
      return;
    }

    if (resultado.pagoCascada > 0 && resultado.multTotal > 0) {
      await revelarMultiplicador(resultado);
    }
  }

  /* ============================================================
     REVELAR EL MULTIPLICADOR
     ------------------------------------------------------------
     El orden importa y está copiado del ritmo de los slots
     comerciales:

       1. el Ekeko toma impulso y lanza
       2. baja una columna de luz sobre una casilla
       3. el orbe aterriza y late
       4. RECIÉN AHÍ el premio trepa hasta el total

     Ese respiro entre el gesto y el número es lo que hace que
     se sienta un premio y no un dato que cambió en pantalla.
     ============================================================ */
  async function revelarMultiplicador(resultado) {
    var total = INTI.redondear(resultado.pagoCascada * resultado.multTotal);

    // 1. el gesto
    ekekoLanza();
    $('gain').textContent = INTI.redondear(resultado.pagoCascada);
    await espera(TIEMPOS.antesDelOrbe);

    // 2 y 3. la luz y el orbe sobre una casilla al azar
    var celda = celdaAlAzar();
    if (celda) {
      lanzarRayo(celda);
      await espera(TIEMPOS.rayoAntesDelOrbe);
      var orbe = ponerOrbe(celda, resultado.multTotal);
      tono(880, 0.12, 0.06);
      await espera(TIEMPOS.orbeAntesDelConteo);
      if (orbe) orbe.classList.add('espera');
    }

    // 4. RECIÉN AHÍ se aplica el multiplicador: el monto salta al total
    barrerLuz();
    fanfarria(resultado.multTotal);
    $('gain').textContent = INTI.redondear(total);
    mensaje('Multiplicador ×' + resultado.multTotal, 'win');

    await espera(TIEMPOS.despuesDelConteo);
  }

  /* Elige una casilla del tablero para que caiga el orbe.
     Evita las dos columnas del borde para que no quede cortado. */
  function celdaAlAzar() {
    var c = 1 + Math.floor(Math.random() * (motor.cfg.COLS - 2));
    var r = Math.floor(Math.random() * motor.cfg.ROWS);
    return document.querySelector('[data-pos="' + c + '-' + r + '"]');
  }

  function lanzarRayo(celda) {
    var g = $('grid');
    if (!g) return;
    var rayo = document.createElement('div');
    rayo.className = 'rayo-mult';
    var caja = celda.getBoundingClientRect();
    var cajaG = g.getBoundingClientRect();
    rayo.style.left = (caja.left - cajaG.left + caja.width * 0.37) + 'px';
    rayo.style.width = (caja.width * 0.26) + 'px';
    g.appendChild(rayo);
    setTimeout(function () { rayo.remove(); }, 600);
  }

  function ponerOrbe(celda, valor) {
    var o = document.createElement('div');
    o.className = 'orbe-mult';
    o.innerHTML = '<span>' + valor + 'x</span>';
    celda.appendChild(o);
    chispear(celda, 8);
    return o;
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

      /* Los créditos se cargan directo, sin contador ni cartel:
         el jugador ve el número final de una vez. */
      creditos += resultado.pagoTotal;
      $('credits').textContent = INTI.redondear(creditos);
      $('gain').textContent = INTI.redondear(resultado.pagoTotal);

      if (veces >= 20) barrerLuz();
      if (!esGratis) fanfarria(veces);
      if (resultado.multTotal === 0) {
        ekekoCelebra();
        mensaje('', '');
      }
    } else {
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

    /* Registro para el panel: la apuesta solo cuenta en el giro
       base; los giros gratis suman pago pero no apuesta. */
    CONF.registrarGiro(esGratis ? 0 : apuesta, resultado.pagoTotal, perfil.id);

    ocupado = false;
    saltar = false;
    bloquear(false);
    pintarApuesta();

    /* --- encadenar el siguiente giro --- */
    if (girosGratisRestantes > 0) {
      await espera(TIEMPOS.entreGirosGratis);
      jugar();
      return;
    }

    if (autoRestantes > 0 && !esGratis) {
      autoRestantes--;

      // condiciones de parada, en orden de importancia
      if (creditos < APUESTAS[idxApuesta]) {
        detenerAuto('Automático detenido: créditos insuficientes.');
      } else if (autoConfig.pararGratis && resultado.activaGratis) {
        detenerAuto('Automático detenido: se activaron giros gratis.');
      } else if (autoConfig.pararPremio &&
                 resultado.pagoTotal / apuesta >= UMBRAL_PREMIO) {
        detenerAuto('Automático detenido: premio de ' +
                    Math.round(resultado.pagoTotal / apuesta) + '× la apuesta.');
      } else if (autoRestantes > 0) {
        pintarAuto();
        await espera(TIEMPOS.entreAutomaticos);
        jugar();
        return;
      } else {
        detenerAuto('Tiros automáticos terminados.');
      }
      pintarAuto();
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
    var gratis = girosGratisRestantes > 0;
    $('spinTxt').textContent = gratis ? 'Gratis ' + girosGratisRestantes : 'Girar';
    $('spin').classList.toggle('gratis', gratis);
  }

  /* La apuesta tiene tres topes: la escalera, el límite de mesa
     y los créditos que el jugador tenga en ese momento. Manda el
     más bajo de los tres. */
  function apuestaMaximaPosible() {
    var tope = 0;
    for (var i = 0; i < APUESTAS.length; i++) {
      if (APUESTAS[i] <= LIMITE_MESA && APUESTAS[i] <= creditos) tope = i;
    }
    return tope;
  }

  function cambiarApuesta(d) {
    if (ocupado || girosGratisRestantes > 0 || autoRestantes > 0) return;
    var nuevo = idxApuesta + d;
    var maxIdx = apuestaMaximaPosible();
    if (nuevo < 0) nuevo = 0;
    if (nuevo > maxIdx) nuevo = maxIdx;
    idxApuesta = nuevo;
    pintarApuesta();
  }

  function pintarApuesta() {
    var v = APUESTAS[idxApuesta];
    $('betAmount').textContent = v;
    var campo = $('betValor');
    if (campo) campo.textContent = v;

    var maxIdx = apuestaMaximaPosible();
    var bloqueado = ocupado || girosGratisRestantes > 0 || autoRestantes > 0;
    $('betDown').disabled = bloqueado || idxApuesta <= 0;
    $('betUp').disabled   = bloqueado || idxApuesta >= maxIdx;
    var bmax = $('apuestaMax');
    if (bmax) bmax.disabled = bloqueado || idxApuesta >= maxIdx;

    var lim = $('limites');
    if (lim) {
      lim.innerHTML =
        '<span>Mínimo <b>' + APUESTAS[0] + '</b></span>' +
        '<span>Límite de mesa <b>' + LIMITE_MESA + '</b></span>' +
        '<span>Tu máximo <b>' + APUESTAS[maxIdx] + '</b></span>';
    }
    if (campo) {
      campo.textContent = v;
    }
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
    var ps = motor.cfg.PAGOS_SCATTER;
    filas.push('<div class="ptrow">' + arte.SCATTER + '<span>Ídolo</span>' +
      '<span class="nums">4 = ' + ps[4] + '× / 5 = ' + ps[5] + '× / 6+ = ' + ps[6] + '×<br>' +
      'y ' + motor.cfg.GIROS_GRATIS + ' giros gratis</span></div>');
    $('paytable').innerHTML = filas.join('');
  }

  /* ============================================================
     ARRANQUE
     ============================================================ */
  $('spin').addEventListener('click', function () {
    // si el automático está corriendo, el botón lo corta
    if (autoRestantes > 0) { detenerAuto('Automático detenido.'); return; }
    jugar();
  });
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

  /* ============================================================
     TIROS AUTOMÁTICOS
     ------------------------------------------------------------
     Se detiene solo en cuatro casos: se acabaron los giros, se
     acabaron los créditos, se activaron giros gratis, o el premio
     pasó el umbral. Los dos últimos son opcionales.

     Que se pueda cortar en cualquier momento no es un detalle:
     es requisito de juego responsable en toda jurisdicción.
     ============================================================ */
  function pintarAuto() {
    var chip = $('abrirAuto');
    var aviso = $('autoAviso');
    if (autoRestantes > 0) {
      $('autoEstado').textContent = autoRestantes;
      chip.classList.add('on');
      aviso.textContent = 'Tiros automáticos restantes ' + autoRestantes;
      aviso.classList.add('on');
    } else {
      $('autoEstado').textContent = 'OFF';
      chip.classList.remove('on');
      aviso.classList.remove('on');
    }
  }

  function detenerAuto(motivo) {
    if (autoRestantes <= 0) return;
    autoRestantes = 0;
    pintarAuto();
    pintarApuesta();
    if (motivo) mensaje(motivo, 'free');
  }

  function iniciarAuto() {
    autoConfig.pararGratis = $('pararGratis').checked;
    autoConfig.pararPremio = $('pararPremio').checked;
    autoRestantes = autoCantidad;
    cerrarTodo();
    pintarAuto();
    pintarApuesta();
    jugar();
  }

  function pintarOpcionesAuto() {
    $('opcionesAuto').innerHTML = CANTIDADES_AUTO.map(function (n) {
      return '<button data-n="' + n + '"' + (n === autoCantidad ? ' class="sel"' : '') + '>' + n + '</button>';
    }).join('');
    Array.prototype.forEach.call($('opcionesAuto').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        autoCantidad = parseInt(b.dataset.n, 10);
        pintarOpcionesAuto();
      });
    });
  }

  /* ---------- paneles ---------- */
  function cerrarTodo() {
    $('modal').hidden = true;
    $('modalApuesta').hidden = true;
    $('modalAuto').hidden = true;
  }

  $('abrirApuesta').addEventListener('click', function () {
    if (ocupado || girosGratisRestantes > 0 || autoRestantes > 0) return;
    pintarApuesta();
    $('modalApuesta').hidden = false;
  });
  $('cerrarApuesta').addEventListener('click', function () { $('modalApuesta').hidden = true; });
  $('modalApuesta').addEventListener('click', function (e) {
    if (e.target === $('modalApuesta')) $('modalApuesta').hidden = true;
  });
  $('apuestaMax').addEventListener('click', function () {
    if (ocupado || girosGratisRestantes > 0 || autoRestantes > 0) return;
    idxApuesta = apuestaMaximaPosible();
    pintarApuesta();
  });

  $('abrirAuto').addEventListener('click', function () {
    if (autoRestantes > 0) { detenerAuto('Automático detenido.'); return; }
    if (ocupado || girosGratisRestantes > 0) return;
    $('umbralTxt').textContent = UMBRAL_PREMIO;
    pintarOpcionesAuto();
    $('modalAuto').hidden = false;
  });
  $('cerrarAuto').addEventListener('click', function () { $('modalAuto').hidden = true; });
  $('modalAuto').addEventListener('click', function (e) {
    if (e.target === $('modalAuto')) $('modalAuto').hidden = true;
  });
  $('iniciarAuto').addEventListener('click', iniciarAuto);

  /* ---------- panel de información ---------- */
  function abrirInfo() {
    var f = document.getElementById('fichaRtp');
    if (f) f.textContent = perfil.rtpDeclarado.toFixed(2).replace('.', ',') + '%';
    $('modal').hidden = false;
  }
  function cerrarInfo() { $('modal').hidden = true; }

  $('infoBtn').addEventListener('click', abrirInfo);
  $('cerrarModal').addEventListener('click', cerrarInfo);
  $('modal').addEventListener('click', function (e) {
    if (e.target === $('modal')) cerrarInfo();   // clic fuera de la hoja
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') cerrarTodo();
  });

  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' || e.target !== document.body) return;
    if (!$('modal').hidden) return;
    e.preventDefault();
    if (ocupado) pedirSalto();   // espacio durante la animación = saltar
    else jugar();                // espacio en reposo = girar
  });

  pintarTabla();
  pintarApuesta();
  pintarAuto();
  pintarOpcionesAuto();
  pintar(motor._.nuevaGrid(false), null);

})();
