# INTI — motor de slot con cascada 6×5

Juego de tragamonedas con cuadrícula 6×5, pago por cantidad (sin líneas),
cascada encadenada y orbes multiplicadores. Tema andino original.

**RTP calibrado: 96,25%** — medido, no estimado.

---

## Archivos

| Archivo | Qué hace | Toca la pantalla |
|---|---|---|
| `engine.js` | Toda la lógica y la matemática | No |
| `symbols.js` | Dibujo SVG de los símbolos | Solo dibujo |
| `ui.js` | Anima lo que el motor devuelve | Sí |
| `style.css` | Estilos | Sí |
| `index.html` | Arma todo | Sí |
| `test.js` | 35 pruebas del motor | No |
| `sim.js` | Mide RTP y volatilidad | No |

La regla: **`engine.js` no sabe que existe una pantalla**. Por eso el mismo
archivo corre en el navegador, en las pruebas y en el simulador — y lo que
mides es exactamente lo que juega el usuario.

---

## Cómo correr

**El juego:** abre `index.html` en el navegador. No necesita servidor.

**Las pruebas:**
```
node test.js
```
Verifica 35 cosas por separado: el generador aleatorio, el conteo, los tramos
de pago, la gravedad de la cascada, los multiplicadores, los giros gratis y
la convergencia del RTP. Si algo se rompe, te dice cuál.

**El simulador:**
```
node sim.js                 # 2 millones de rondas
node sim.js 5000000         # 5 millones
node sim.js 2000000 3       # 2 millones × 3 semillas distintas
```

---

## Cómo ajustar la matemática

Todo lo ajustable está en los dos primeros bloques de `engine.js`:

**`CONFIG`** — tamaño de la cuadrícula, mínimo para pagar, probabilidad de
orbes y scatters, cantidad de giros gratis, tabla de valores de orbe.

**`SIMBOLOS`** — para cada símbolo:
- `pagos: [a, b, c]` — multiplicador por tramo: 8-9, 10-11, 12 o más
- `peso` — qué tan seguido aparece (mayor = más común)

Después de tocar **cualquier** número:

```
node sim.js 3000000
```

Y ajusta hasta que el RTP quede donde lo quieres. Un slot comercial va
entre 94% y 97%.

### Sobre el RTP y la volatilidad

Este juego es volátil: la desviación estándar es de unas 4,5× la apuesta y el
orbe de 500× aparece muy rara vez pero pesa mucho en el promedio. Consecuencia
práctica: **un millón de rondas no alcanza para medirlo bien**. Con tres
semillas distintas de un millón cada una el RTP salió entre 95,4% y 97,2%.

Para un número confiable usa 5 millones o más, y corre varias semillas para
ver el rango real. Esto no es un defecto: es cómo se comportan los juegos de
alta volatilidad, y es exactamente el tipo de análisis que un laboratorio te
va a pedir después.

---

## Cambiar el arte

`symbols.js` está aislado a propósito. Si quieres usar imágenes propias en vez
de SVG, cambia la función `dibujar()` para que devuelva un `<img src="...">`
y nada más se rompe.

Los colores del gabinete están en las variables de arriba de `style.css`.

---

## Lo que sigue (en este orden)

**1. Servidor.** Hoy `motor.girar()` corre en el navegador — cualquiera abre la
consola y hace trampa. El siguiente paso es mover `engine.js` al servidor y que
`ui.js` pida el resultado por `fetch()`. La interfaz casi no cambia porque el
motor ya devuelve el giro completo con la lista de pasos: la pantalla solo
reproduce, nunca decide.

**2. Estado y billetera.** Créditos del lado del servidor, historial de giros,
identificador de sesión, y capacidad de reconstruir cualquier giro pasado.

**3. Recién ahí, certificación.** Y ojo con esto: `crearRNG()` usa `Math.random`
cuando no le pasas semilla. **Eso no sirve para dinero real.** Un laboratorio
exige un generador criptográfico certificado. La versión con semilla que está
ahí es para desarrollo y para reproducir giros al depurar — que además es un
requisito de las auditorías.

---

## Estado actual

Demo técnica funcional. Créditos sin valor, sin dinero real, sin necesidad de
licencia ni certificación. Sirve tal cual como juego social o promocional.
