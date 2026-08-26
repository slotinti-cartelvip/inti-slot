/* ============================================================
   INTI — SIMULADOR
   ------------------------------------------------------------
   Mide el comportamiento real del juego jugando millones de
   rondas. Usa el MISMO engine.js que el juego, así que lo que
   mides aquí es lo que va a pasar en la pantalla.

   Uso:
     node sim.js                 -> 2 millones de rondas
     node sim.js 5000000         -> 5 millones
     node sim.js 2000000 3       -> 2 millones × 3 semillas
   ============================================================ */
var INTI = require('./engine.js');

var N = parseInt(process.argv[2] || '2000000', 10);
var CORRIDAS = parseInt(process.argv[3] || '1', 10);
var APUESTA = 10;

function correr(semilla) {
  var m = INTI.crearMotor({ semilla: semilla });
  var apostado = 0, ganado = 0, premios = 0, mayor = 0;
  var rondasGratis = 0, ganadoGratis = 0, sumaCascadas = 0, maxCascadas = 0;
  var sumaCuad = 0;                 // para la desviación estándar
  var reparto = { '0': 0, '0-1': 0, '1-5': 0, '5-20': 0, '20-100': 0, '100+': 0 };

  for (var i = 0; i < N; i++) {
    apostado += APUESTA;
    var ronda = m.jugarRonda(APUESTA);
    var g = ronda.pagoTotal;

    ganado += g;
    if (g > 0) premios++;
    var x = g / APUESTA;
    if (x > mayor) mayor = x;
    sumaCuad += x * x;

    if (ronda.activoGratis) {
      rondasGratis++;
      for (var k = 1; k < ronda.giros.length; k++) ganadoGratis += ronda.giros[k].pagoTotal;
    }
    var base = ronda.giros[0];
    sumaCascadas += base.pasos.length;
    if (base.pasos.length > maxCascadas) maxCascadas = base.pasos.length;

    if (x === 0) reparto['0']++;
    else if (x < 1) reparto['0-1']++;
    else if (x < 5) reparto['1-5']++;
    else if (x < 20) reparto['5-20']++;
    else if (x < 100) reparto['20-100']++;
    else reparto['100+']++;
  }

  var rtp = ganado / apostado;
  var media = ganado / N / APUESTA;
  var desv = Math.sqrt(sumaCuad / N - media * media);

  return {
    rtp: rtp, hit: premios / N, mayor: mayor,
    fs: rondasGratis / N, aporteFS: ganado > 0 ? ganadoGratis / ganado : 0,
    cascadaMedia: sumaCascadas / N, maxCascadas: maxCascadas,
    desv: desv, reparto: reparto
  };
}

function pct(x, d) { return (x * 100).toFixed(d === undefined ? 2 : d) + '%'; }
function linea() { console.log('─'.repeat(52)); }

console.log('\nINTI — simulación de ' + N.toLocaleString('es') +
            ' rondas' + (CORRIDAS > 1 ? ' × ' + CORRIDAS + ' semillas' : '') + '\n');

var rtps = [];
for (var c = 0; c < CORRIDAS; c++) {
  var semilla = 1000 + c * 7919;
  var t0 = Date.now();
  var r = correr(semilla);
  rtps.push(r.rtp);

  if (CORRIDAS > 1) console.log('\x1b[1mSemilla ' + semilla + '\x1b[0m  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
  linea();
  console.log('RTP                      ' + pct(r.rtp));
  console.log('Frecuencia de premio     ' + pct(r.hit) + '   (1 de cada ' + (1 / r.hit).toFixed(1) + ')');
  console.log('Volatilidad (desv. est.) ' + r.desv.toFixed(2) + '×');
  console.log('Ganancia máxima vista    ' + Math.round(r.mayor) + '×');
  console.log('Giros gratis             1 de cada ' + Math.round(1 / r.fs) +
              '   (aporta ' + pct(r.aporteFS, 1) + ' del retorno)');
  console.log('Cascadas por giro        ' + r.cascadaMedia.toFixed(2) + ' promedio, ' + r.maxCascadas + ' máximo');
  console.log('');
  console.log('Reparto de resultados por ronda:');
  Object.keys(r.reparto).forEach(function (k) {
    var n = r.reparto[k];
    var etiqueta = k === '0' ? 'sin premio' : k + '× la apuesta';
    var barra = '█'.repeat(Math.max(0, Math.round(n / N * 40)));
    console.log('  ' + etiqueta.padEnd(16) + pct(n / N, 2).padStart(7) + '  ' + barra);
  });
  linea();
  console.log('');
}

if (CORRIDAS > 1) {
  var min = Math.min.apply(null, rtps), max = Math.max.apply(null, rtps);
  var prom = rtps.reduce(function (a, b) { return a + b; }, 0) / rtps.length;
  console.log('\x1b[1mRTP entre semillas\x1b[0m: promedio ' + pct(prom) +
              ', rango ' + pct(min) + ' a ' + pct(max));
  console.log('Si el rango es ancho, el juego es muy volátil y necesita');
  console.log('más rondas para converger. Sube N hasta que se cierre.\n');
}
