/* ============================================================
   INTI — PRUEBAS DEL MOTOR
   ------------------------------------------------------------
   Correr con:  node test.js
   Cada prueba verifica UNA cosa. Si algo se rompe, sabes cuál.
   ============================================================ */
var INTI = require('./engine.js');

/* ---------- arnés mínimo de pruebas ---------- */
var pasadas = 0, falladas = 0, grupoActual = '';

function grupo(nombre) { grupoActual = nombre; console.log('\n\x1b[1m' + nombre + '\x1b[0m'); }

function probar(desc, fn) {
  try {
    fn();
    pasadas++;
    console.log('  \x1b[32m✓\x1b[0m ' + desc);
  } catch (e) {
    falladas++;
    console.log('  \x1b[31m✗ ' + desc + '\x1b[0m');
    console.log('      ' + e.message);
  }
}

function igual(a, b, msg) {
  var sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || 'esperaba') + ' ' + sb + ' pero llegó ' + sa);
}
function cerca(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error((msg || 'esperaba') + ' ~' + b + ' (±' + tol + ') pero llegó ' + a);
}
function cierto(v, msg) { if (!v) throw new Error(msg || 'esperaba verdadero'); }

/* ---------- helper: armar una cuadrícula a mano ----------
   Se pasa un arreglo de textos (las filas, de arriba a abajo),
   con 6 caracteres cada uno:
     c=copa  t=triangulo  h=hexagono  p=pentagono
     r=rombo u=tumi       k=chakana   i=inti
     S=ídolo (scatter)
   El multiplicador ya no vive en el tablero — lo entrega el
   Ekeko aparte, así que aquí ya no hace falta letra para él. */
var LETRAS = {
  c: 'j', t: 'q', h: 'k', p: 'bs5',
  r: 'bs10', u: 'bs100', k: 'chulito', i: 'casita'
};

function gridDe(filas) {
  var cols = filas[0].length;
  var g = [];
  for (var c = 0; c < cols; c++) {
    var col = [];
    for (var r = 0; r < filas.length; r++) {
      var ch = filas[r][c];
      if (ch === 'S') col.push({ t: 'scatter' });
      else col.push({ t: 'sim', id: LETRAS[ch] });
    }
    g.push(col);
  }
  return g;
}

/* ============================================================
   1. GENERADOR ALEATORIO
   ============================================================ */
grupo('1. Generador aleatorio');

probar('con la misma semilla produce la misma secuencia', function () {
  var a = INTI.crearRNG(12345), b = INTI.crearRNG(12345);
  for (var i = 0; i < 100; i++) igual(a(), b(), 'valor ' + i);
});

probar('con semillas distintas produce secuencias distintas', function () {
  var a = INTI.crearRNG(1), b = INTI.crearRNG(2);
  cierto(a() !== b(), 'dos semillas dieron el mismo primer valor');
});

probar('los valores caen siempre en el rango [0, 1)', function () {
  var r = INTI.crearRNG(999);
  for (var i = 0; i < 10000; i++) {
    var v = r();
    cierto(v >= 0 && v < 1, 'valor fuera de rango: ' + v);
  }
});

probar('la distribución es pareja en 10 cajones (±2% sobre 200k)', function () {
  var r = INTI.crearRNG(777), cajones = new Array(10).fill(0), N = 200000;
  for (var i = 0; i < N; i++) cajones[Math.floor(r() * 10)]++;
  cajones.forEach(function (n, idx) {
    cerca(n / N, 0.1, 0.02, 'cajón ' + idx);
  });
});

/* ============================================================
   2. CUADRÍCULA
   ============================================================ */
grupo('2. Cuadrícula');

var motor = INTI.crearMotor({ semilla: 42 });

probar('se genera con 6 columnas de 4 filas', function () {
  var g = motor._.nuevaGrid(false);
  igual(g.length, 6, 'columnas');
  g.forEach(function (col, i) { igual(col.length, 4, 'filas de la columna ' + i); });
});

probar('toda celda es símbolo o ídolo', function () {
  for (var n = 0; n < 200; n++) {
    var g = motor._.nuevaGrid(false);
    g.forEach(function (col) {
      col.forEach(function (cel) {
        cierto(['sim', 'scatter'].indexOf(cel.t) >= 0, 'tipo raro: ' + cel.t);
      });
    });
  }
});

probar('en las cascadas nunca aparecen scatters nuevos', function () {
  for (var n = 0; n < 5000; n++) {
    var cel = motor._.celdaNueva(false, false);
    cierto(cel.t !== 'scatter', 'salió un scatter en una cascada');
  }
});

/* ============================================================
   3. CONTEO Y TRAMOS DE PAGO
   ============================================================ */
grupo('3. Conteo y tramos');

probar('cuenta bien los símbolos del tablero', function () {
  var g = gridDe([
    'cccccc',
    'ccrrrr',
    'tttttt',
    'hhhhhh'
  ]);
  var m = motor._.contar(g);
  igual(m.j, 8);
  igual(m.bs10, 4);
  igual(m.q, 6);
});

probar('los ídolos no se cuentan como símbolos', function () {
  var g = gridDe([
    'cccccS',
    'cccccc',
    'tttttt',
    'hhhhhh'
  ]);
  var m = motor._.contar(g);
  igual(m.j, 11, 'jotas');
  igual(m.scatter, undefined, 'scatter no debe contarse como símbolo');
});

probar('el tramo se elige por cantidad: 8-9 → 0, 10-11 → 1, 12+ → 2', function () {
  igual(motor._.tramo(8), 0);
  igual(motor._.tramo(9), 0);
  igual(motor._.tramo(10), 1);
  igual(motor._.tramo(11), 1);
  igual(motor._.tramo(12), 2);
  igual(motor._.tramo(30), 2);
});

probar('menos de 8 no está en ningún tramo', function () {
  igual(motor._.tramo(7), -1);
  igual(motor._.tramo(1), -1);
});

/* ============================================================
   4. PAGOS
   ============================================================ */
grupo('4. Pagos');

probar('con 7 símbolos iguales NO paga', function () {
  var g = gridDe([
    'cccccc',
    'chhhhh',
    'tttttt',
    'rrrrrr'
  ]);
  // copa aparece 7 veces: 6 arriba + 1
  igual(motor._.contar(g).j, 7, 'preparación de la prueba');
  var ev = motor._.evaluar(g, 10);
  igual(ev.ganadores.length, 0, 'no debería haber ganadores');
  igual(ev.pago, 0);
});

probar('con 8 símbolos iguales paga el tramo 0 × apuesta', function () {
  var g = gridDe([
    'cccccc',
    'cchhhh',
    'tttttt',
    'rrrrrr'
  ]);
  igual(motor._.contar(g).j, 8, 'preparación');
  var ev = motor._.evaluar(g, 10);
  igual(ev.ganadores, ['j']);
  igual(ev.pago, INTI.redondear(1.55 * 10), 'j tramo 0 = 1.55 × 10');
});

probar('con 12 símbolos iguales paga el tramo 2', function () {
  var g = gridDe([
    'iiiiii',
    'iiiiii',
    'tttttt',
    'rrrrrr'
  ]);
  igual(motor._.contar(g).casita, 12, 'preparación');
  var ev = motor._.evaluar(g, 10);
  igual(ev.pago, INTI.redondear(152.40 * 10), 'casita tramo 2 = 152.40 × 10');
});

probar('varios símbolos ganadores a la vez suman sus pagos', function () {
  var g = gridDe([
    'cccccc',
    'cciiii',
    'iiiiii',
    'rrrrrr'
  ]);
  var m = motor._.contar(g);
  igual(m.j, 8, 'jotas'); igual(m.casita, 10, 'intis');
  var ev = motor._.evaluar(g, 10);
  igual(ev.ganadores.sort(), ['casita', 'j']);
  igual(ev.pago, INTI.redondear(1.55 * 10 + 60.70 * 10), 'j tramo 0 + casita tramo 1');
});

probar('el pago escala de forma lineal con la apuesta', function () {
  var g = gridDe(['cccccc', 'cchhhh', 'tttttt', 'rrrrrr']);
  var a = motor._.evaluar(g, 1).pago;
  var b = motor._.evaluar(g, 50).pago;
  cerca(b, a * 50, 0.01, 'apuesta 50 debería pagar 50 veces la de 1');
});

/* ============================================================
   5. CASCADA (la pieza más delicada)
   ============================================================ */
grupo('5. Cascada');

probar('cada columna sigue teniendo 4 celdas después de derrumbar', function () {
  var g = gridDe(['cccccc', 'cchhhh', 'tttttt', 'rrrrrr']);
  var res = motor._.derrumbar(g, ['j'], false);
  res.grid.forEach(function (col, i) { igual(col.length, 4, 'columna ' + i); });
});

probar('los símbolos ganadores desaparecen del tablero', function () {
  var g = gridDe(['cccccc', 'cchhhh', 'tttttt', 'rrrrrr']);
  var res = motor._.derrumbar(g, ['j'], false);
  var quedan = motor._.contar(res.grid).j || 0;
  // pueden reaparecer copas nuevas al rellenar, pero nunca las 8 originales intactas
  cierto(quedan < 8, 'quedaron ' + quedan + ' jotas, deberían ser menos de 8');
});

probar('los que sobreviven caen al fondo manteniendo su orden', function () {
  // columna 0: c,c,t,r,u  → al quitar copas debe quedar [nuevo, nuevo, t, r, u]
  var g = gridDe(['cccccc', 'cccccc', 'tttttt', 'rrrrrr']);
  var res = motor._.derrumbar(g, ['j'], false);
  var col = res.grid[0];
  igual(col[2], { t: 'sim', id: 'q' }, 'fila 2');
  igual(col[3], { t: 'sim', id: 'bs10' }, 'fila 3');
});

probar('las celdas nuevas entran por arriba', function () {
  var g = gridDe(['cccccc', 'cccccc', 'tttttt', 'rrrrrr']);
  var res = motor._.derrumbar(g, ['j'], false);
  igual(res.nuevas.filter(function (p) { return p.indexOf('0-') === 0; }).sort(), ['0-0', '0-1']);
});

probar('los scatters NO se eliminan en la cascada', function () {
  var g = gridDe(['ccccSc', 'cccccc', 'tttttt', 'rrrrrr']);
  var res = motor._.derrumbar(g, ['j'], false);
  igual(motor._.contarScatters(res.grid), 1, 'el scatter debería seguir ahí');
});

/* ============================================================
   6. EL MULTIPLICADOR DEL EKEKO
   ------------------------------------------------------------
   Ya no vive en el tablero: es un valor que se sortea aparte,
   y solo si la jugada ya ganó algo.
   ============================================================ */
grupo('6. El multiplicador del Ekeko');

probar('los valores del multiplicador salen siempre de la tabla configurada', function () {
  var validos = INTI.CONFIG.MULTIPLICADORES.map(function (o) { return o.v; });
  for (var i = 0; i < 20000; i++) {
    var v = motor._.valorMultAlAzar();
    cierto(validos.indexOf(v) >= 0, 'valor de multiplicador inválido: ' + v);
  }
});

probar('sin ganancia, el multiplicador nunca aparece', function () {
  // PROB_MULT en 100% y sin scatters: si el tablero no paga nada,
  // el multiplicador no debe sortearse aunque la probabilidad sea total.
  var m = INTI.crearMotor({
    semilla: 5,
    config: { PROB_MULT: 1.0, PROB_SCATTER: 0 }
  });
  var vistoAlguno = false, vistoSinPago = false;
  for (var i = 0; i < 3000; i++) {
    var r = m.girar(10);
    if (r.pagoCascada === 0) {
      vistoSinPago = true;
      igual(r.multTotal, 0, 'sin pago no debería haber multiplicador');
      igual(r.pagoTotal, 0, 'sin pago el total debe ser 0');
    } else {
      vistoAlguno = true;
    }
  }
  cierto(vistoSinPago, 'preparación: debería haber giros sin pago');
  cierto(vistoAlguno, 'preparación: debería haber giros con pago');
});

probar('con multiplicador, el total = cascada × multiplicador', function () {
  var m = INTI.crearMotor({ semilla: 2024, config: { PROB_MULT: 1.0 } });
  for (var i = 0; i < 4000; i++) {
    var r = m.girar(10);
    if (r.pagoCascada > 0 && r.multTotal > 0) {
      cerca(r.pagoTotal, INTI.redondear(r.pagoCascada * r.multTotal), 0.02,
        'total con multiplicador');
      return;
    }
  }
  throw new Error('no se encontró ningún giro con premio y multiplicador');
});

probar('con PROB_MULT en 0, el total siempre es igual a la cascada', function () {
  var m = INTI.crearMotor({ semilla: 7, config: { PROB_MULT: 0, PROB_MULT_GRATIS: 0 } });
  for (var i = 0; i < 2000; i++) {
    var r = m.girar(10);
    igual(r.multTotal, 0, 'no debería haber multiplicador');
    igual(r.pagoTotal, r.pagoCascada, 'total = cascada');
  }
});

probar('en giros gratis el multiplicador es más probable', function () {
  // Con la misma semilla, comparamos cuántas veces aparece el
  // multiplicador en 3000 giros base vs 3000 "giros gratis".
  var cfg = { PROB_MULT: 0.116, PROB_MULT_GRATIS: 0.30 };
  var mBase = INTI.crearMotor({ semilla: 555, config: cfg });
  var mGratis = INTI.crearMotor({ semilla: 555, config: cfg });
  var conBase = 0, conGratis = 0, N = 3000;
  for (var i = 0; i < N; i++) {
    if (mBase.girar(10, { gratis: false }).multTotal > 0) conBase++;
    if (mGratis.girar(10, { gratis: true }).multTotal > 0) conGratis++;
  }
  cierto(conGratis > conBase, 'en gratis (' + conGratis + ') debería salir más que en base (' + conBase + ')');
});

/* ============================================================
   7. GIROS GRATIS
   ============================================================ */
grupo('7. Giros gratis');

probar('se activan con 4 scatters o más', function () {
  var m = INTI.crearMotor({ semilla: 31, config: { PROB_SCATTER: 0.5 } });
  var r = m.girar(10);
  cierto(r.scatters >= 4, 'preparación: salieron ' + r.scatters);
  cierto(r.activaGratis, 'debería activar giros gratis');
});

probar('NO se activan con 3 scatters o menos', function () {
  var m = INTI.crearMotor({ semilla: 8, config: { PROB_SCATTER: 0 } });
  var r = m.girar(10);
  igual(r.scatters, 0);
  cierto(!r.activaGratis, 'no debería activar');
});

probar('un giro gratis nunca vuelve a activar giros gratis', function () {
  var m = INTI.crearMotor({ semilla: 31, config: { PROB_SCATTER: 0.5 } });
  var r = m.girar(10, { gratis: true });
  cierto(!r.activaGratis, 'un giro gratis no debe re-activar');
});

probar('la ronda entrega 1 + 10 giros cuando se activan', function () {
  var m = INTI.crearMotor({ semilla: 31, config: { PROB_SCATTER: 0.5 } });
  var ronda = m.jugarRonda(10);
  cierto(ronda.activoGratis, 'preparación');
  igual(ronda.giros.length, 11, 'giro base + 10 gratis');
});

/* ============================================================
   8. INTEGRIDAD DEL GIRO
   ============================================================ */
grupo('8. Integridad del giro');

probar('el pago nunca es negativo', function () {
  var m = INTI.crearMotor({ semilla: 111 });
  for (var i = 0; i < 20000; i++) {
    var r = m.girar(10);
    cierto(r.pagoTotal >= 0, 'pago negativo: ' + r.pagoTotal);
  }
});

probar('la cascada nunca se cuelga en un bucle infinito', function () {
  var m = INTI.crearMotor({ semilla: 222 });
  for (var i = 0; i < 20000; i++) {
    var r = m.girar(10);
    cierto(r.pasos.length < INTI.CONFIG.MAX_CASCADAS, 'demasiadas cascadas: ' + r.pasos.length);
  }
});

probar('la suma de los pasos coincide con el pago de cascada', function () {
  var m = INTI.crearMotor({ semilla: 333 });
  for (var i = 0; i < 20000; i++) {
    var r = m.girar(10);
    var suma = r.pasos.reduce(function (a, p) { return a + p.pago; }, 0);
    cerca(suma, r.pagoCascada, 0.02, 'giro ' + i);
  }
});

probar('el mismo motor con la misma semilla da el mismo resultado', function () {
  var a = INTI.crearMotor({ semilla: 4444 });
  var b = INTI.crearMotor({ semilla: 4444 });
  for (var i = 0; i < 500; i++) {
    igual(a.girar(10).pagoTotal, b.girar(10).pagoTotal, 'giro ' + i);
  }
});

/* ============================================================
   9. RTP — la prueba que decide si el juego sirve
   ============================================================ */
grupo('9. RTP (500.000 rondas, puede tardar unos segundos)');

probar('el RTP converge a 96,1% ± 2,5 puntos', function () {
  var m = INTI.crearMotor({ semilla: 20260825 });
  var N = 500000, APUESTA = 10, apostado = 0, ganado = 0;
  for (var i = 0; i < N; i++) {
    apostado += APUESTA;
    ganado += m.jugarRonda(APUESTA).pagoTotal;
  }
  var rtp = ganado / apostado * 100;
  console.log('      RTP medido: ' + rtp.toFixed(2) + '%');
  cerca(rtp, 96.1, 2.5, 'RTP');  // tolerancia amplia: el juego es muy volatil
});

/* ---------- resumen ---------- */
console.log('\n' + '─'.repeat(46));
console.log(pasadas + ' pasadas, ' + falladas + ' falladas');
console.log('─'.repeat(46) + '\n');
process.exit(falladas > 0 ? 1 : 0);
