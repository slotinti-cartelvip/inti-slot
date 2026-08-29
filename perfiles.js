/* ============================================================
   INTI — PERFILES DE RTP Y ESTADÍSTICAS
   ------------------------------------------------------------
   Lo cargan el juego y el panel de operador.

   IMPORTANTE — cómo funciona esto en la industria:

   Un juego comercial se publica con VARIAS versiones de RTP,
   y cada una se certifica por separado en el laboratorio. El
   operador elige una según su jurisdicción y su margen, y esa
   queda FIJA en el despliegue.

   La tabla de pagos de los símbolos NUNCA cambia entre
   perfiles — es la misma tabla certificada. Lo único que varía
   es PROB_MULT: qué tan seguido el Ekeko aparece a multiplicar
   una jugada ganadora. Es un solo número por perfil, fácil de
   auditar, y no toca ni la frecuencia de premio ni la tabla de
   símbolos.

   Por eso este archivo solo permite ELEGIR entre perfiles ya
   calibrados. No deja inventar valores sueltos: cambiar la
   probabilidad a mano invalidaría la certificación y, en un
   juego de dinero real, sería amañar la máquina.

   Cambiar de perfil con una partida en curso tampoco se hace:
   el cambio se aplica al empezar la siguiente sesión.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- Perfiles ----------
     Cada tabla se midió sobre 4,2 millones de rondas.
     La frecuencia de premio NO cambia entre perfiles (1 de cada
     5,3 giros): lo que cambia es cuánto paga cada combinación. */
  var PERFILES = {
    p96: {
      id: 'p96',
      nombre: 'Estándar',
      rtpDeclarado: 96.0,
      rtpMedido: 96.39,
      nota: 'El más generoso. Para mercados competitivos donde el jugador compara.',
      probMult: 0.1175
    },
    p94: {
      id: 'p94',
      nombre: 'Equilibrado',
      rtpDeclarado: 94.0,
      rtpMedido: 94.31,
      nota: 'Punto medio habitual. Margen sano sin que el jugador lo note.',
      probMult: 0.1106
    },
    p92: {
      id: 'p92',
      nombre: 'Conservador',
      rtpDeclarado: 92.0,
      rtpMedido: 91.61,
      nota: 'Margen alto. Ojo: muchas jurisdicciones exigen un RTP mínimo.',
      probMult: 0.1038
    }
  };

  var POR_DEFECTO = 'p96';

  /* ---------- Almacén ----------
     Usa el almacenamiento del navegador. Si no está disponible
     (modo privado, o incrustado en otra página), cae a memoria
     y todo sigue funcionando: solo no persiste al recargar. */
  var memoria = {};
  var hayDisco = (function () {
    try {
      var k = '__inti_prueba__';
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  function leerCrudo(clave) {
    try { return hayDisco ? global.localStorage.getItem(clave) : (memoria[clave] || null); }
    catch (e) { return memoria[clave] || null; }
  }
  function guardarCrudo(clave, valor) {
    try {
      if (hayDisco) global.localStorage.setItem(clave, valor);
      else memoria[clave] = valor;
    } catch (e) { memoria[clave] = valor; }
  }

  var K_PERFIL = 'inti.perfil';
  var K_STATS  = 'inti.stats';

  /* ---------- Perfil activo ---------- */
  function perfilActivo() {
    var id = leerCrudo(K_PERFIL);
    return PERFILES[id] ? PERFILES[id] : PERFILES[POR_DEFECTO];
  }

  function fijarPerfil(id) {
    if (!PERFILES[id]) return false;
    guardarCrudo(K_PERFIL, id);
    return true;
  }

  /* Devuelve el bloque de configuración que hay que pasarle a
     INTI.crearMotor({ config: ... }) para que use este perfil.
     Los símbolos (pesos, pagos, arte) nunca cambian: lo único
     que ajusta el perfil es qué tan seguido aparece el Ekeko. */
  function configDe(perfil) {
    return {
      PROB_MULT: perfil.probMult,
      PROB_MULT_GRATIS: Math.min(1, perfil.probMult * 2.5)
    };
  }

  /* ---------- Estadísticas ---------- */
  function statsVacias() {
    return { giros: 0, apostado: 0, pagado: 0, premios: 0, mayor: 0, dias: {} };
  }

  function leerStats() {
    try {
      var s = JSON.parse(leerCrudo(K_STATS) || 'null');
      if (!s || typeof s.giros !== 'number') return statsVacias();
      if (!s.dias) s.dias = {};
      return s;
    } catch (e) { return statsVacias(); }
  }

  function hoy() {
    var d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  /* Se llama una vez por ronda desde el juego. */
  function registrarGiro(apuesta, pago, perfilId) {
    var s = leerStats();
    s.giros++;
    s.apostado += apuesta;
    s.pagado += pago;
    if (pago > 0) s.premios++;
    var veces = apuesta > 0 ? pago / apuesta : 0;
    if (veces > s.mayor) s.mayor = veces;

    var d = hoy();
    if (!s.dias[d]) s.dias[d] = { giros: 0, apostado: 0, pagado: 0, perfil: perfilId };
    s.dias[d].giros++;
    s.dias[d].apostado += apuesta;
    s.dias[d].pagado += pago;
    s.dias[d].perfil = perfilId;

    // conservamos como mucho 60 días
    var claves = Object.keys(s.dias).sort();
    while (claves.length > 60) { delete s.dias[claves.shift()]; }

    guardarCrudo(K_STATS, JSON.stringify(s));
  }

  function reiniciarStats() { guardarCrudo(K_STATS, JSON.stringify(statsVacias())); }

  /* ---------- Margen de error estadístico ----------
     Con volatilidad alta, el RTP real tarda MUCHO en acercarse
     al teórico. Esta función dice cuánto puede desviarse por
     puro azar, para no confundir mala suerte con un problema.
     Es el intervalo de confianza del 95%: 1,96 desviaciones
     divididas por la raíz del número de giros. */
  function margen(giros, volatilidad) {
    if (!giros || giros < 1) return null;
    var vol = volatilidad || 6.5;
    return 1.96 * vol / Math.sqrt(giros);   // en veces la apuesta
  }

  global.INTI_CONFIG = {
    PERFILES: PERFILES,
    POR_DEFECTO: POR_DEFECTO,
    hayDisco: hayDisco,
    perfilActivo: perfilActivo,
    fijarPerfil: fijarPerfil,
    configDe: configDe,
    leerStats: leerStats,
    registrarGiro: registrarGiro,
    reiniciarStats: reiniciarStats,
    margen: margen,
    hoy: hoy
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.INTI_CONFIG;

})(typeof window !== 'undefined' ? window : globalThis);
