# Animaciones del dashboard web

Guía corta para tocar el sistema de animaciones sin tener que releer los ocho
archivos. Cubre exactamente dos cosas: **ajustar una duración** y **agregar
un estado nuevo de la mascota**. Todo lo demás (qué anima cada fase, por qué
quedó así) está comentado en el propio archivo de cada fase.

## Dónde vive cada fase

| Archivo | Fase | Qué anima |
|---|---|---|
| `anim.js` | — | Constantes (`DURATIONS`/`DELAYS`/`EASINGS`), `reducedMotion`, el wrapper `play()`/`cancelScope()` sobre la Web Animations API |
| `idle.js` | 1 — Idle/atracción | Menú sin tocar 20s: onda del grid, texto rotando, pulso del botón COMENZAR |
| `intro.js` | 2 — Entrada al juego | Countdown 3·2·1·¡YA!, entrada del grid, reposición de la mascota |
| `duringplay.js` | 3 — Durante la partida | Flash de acierto, shake de fallo, salto del puntaje, latido del timer |
| `roundend.js` | 4 — Fin de ronda | Congelar/desaturar el grid, cartel "TIEMPO", salida del grid |
| `results.js` | 5 — Resultados | Título, conteo del puntaje, confeti, filas del leaderboard, botón "jugar de nuevo" |
| `twoplayer.js` | 6 — Modo 2 jugadores | Card de cambio de turno, pulso del nombre, barras comparativas, corona |
| `micro.js` | 7 — Micro-interacciones | Toast (hover/press/tema son CSS puro en `style.css`) |
| `pet.js` | (todas) | Todo lo de la mascota: pose, quirks, reacciones, modos de pantalla |

Cada archivo de fase es independiente y borrable: si sacás el `<script>` y
los puntos donde `app.js` lo llama, el juego sigue funcionando igual, solo
se pierde ese adorno puntual (está anotado en el comentario de cabecera de
cada uno).

## Ajustar una duración o delay

Nunca edites un número suelto en un archivo de fase o en `style.css` — todo
sale de `anim.js`:

```js
// anim.js
const DURATIONS = {
  game: { // Fase 3
    hit: 200,        // <- por ejemplo, para que el flash de acierto dure más
    wrongShake: 250,
    ...
  },
};
```

- Si lo consume **JS** (la mayoría: `duringplay.js`, `results.js`,
  `twoplayer.js`, etc.), listo — leen `window.BatakAnim.DURATIONS.*` /
  `DELAYS.*` directo, no hace falta tocar nada más.
- Si lo consume **CSS puro** (un `@keyframes` en loop, como `.pet-breathe`,
  `.pulse-cta`, `.pet-aura.active`, `.timer-track.urgent`), `anim.js` lo
  expone además como propiedad custom (`--dur-idle-breathe`,
  `--dur-game-streak-aura`, etc.) cerca del final del archivo — buscá el
  bloque de `document.documentElement.style.setProperty(...)` y agregá la
  tuya ahí si el valor es nuevo.

Si una duración se siente mal en la práctica, cambiala ahí nomás; no hace
falta tocar el resto del pipeline.

## Modo reducido (accesibilidad)

`anim.js` combina `prefers-reduced-motion` del sistema operativo con el
toggle manual "MODO SIMPLE" del menú (`anim.js`'s `setSimpleMode()`,
persistido en `localStorage`) en un solo flag: `BatakAnim.reducedMotion`.

- Todo lo que pasa por `BatakAnim.play()` baja su duración a 1ms
  automáticamente — no hay que pedirlo en cada call site.
- Todo lo que es CSS puro (loops, transiciones) lo cubre la regla global
  `html[data-motion="reduced"] * { ...!important }` en `style.css`.
- Un contador (`results.js`'s `animateCount`) o cualquier cosa que no pase
  por ninguno de los dos caminos anteriores tiene que chequear
  `window.BatakAnim.reducedMotion` a mano y saltar directo al valor final.

## Agregar un estado nuevo de la mascota

Todo el dibujo de la mascota vive en `pet.js`, sobre un `<canvas>` de
píxeles (nada de sprites/imágenes). Tres piezas, de la más simple a la más
elaborada:

### 1. Una pose nueva (ojos/boca ya existentes, combinación nueva)

No hace falta nada nuevo — `paint(moodKey, eyesOverride, mouthOverride, props)`
ya acepta cualquier combinación de `EYES`/`MOUTHS`/props sueltos. Mirá cómo
`playFailedToRank()` arma `paint("idle", "sad", "sad", puddleProps().concat(fSignProps()))`.

### 2. Una reacción nueva (como hit/wrong/timeout)

1. Agregá la entrada a `MOODS` (color de cuerpo, ojos, boca, si brilla, y
   la clase CSS que dispara — `pet-hop`/`pet-droop` o una nueva en
   `style.css` con su propio `@keyframes`, transform/opacity nomás).
2. Llamala con `window.BatakPet.react("tu-mood", duracionMs, streak)` desde
   donde corresponda (hoy solo `app.js`'s `pulseFeedback()` lo hace, para
   hit/wrong/timeout).

`react()` ya se encarga de: abortar cualquier quirk/attract en curso,
throttlear el cambio de expresión durante la partida a 1 cada 400ms (Fase
3), y el pequeño "crossfade" de opacidad al repintar.

### 3. Un quirk/gesto nuevo (escena de varios cuadros, como el chupetín)

Agregá una entrada a `QUIRKS` (para las escenas random del menú/results) o
`GESTURES` (para el idle-attract de Fase 1): una lista de
`{ ms, eyes, mouth, props }`, uno por cuadro. `playQuirk()`/`playGesture()`
ya hacen el resto (reproducir cuadro a cuadro, permitir que una reacción
real los interrumpa). Si el gesto necesita un dibujo nuevo (no solo
ojos/boca), sumale una función `miPropNuevoProps()` junto a las que ya
existen (`lollipopProps`, `balloonProps`, etc.) — son solo listas de
`{ pixels, color }` en el mismo sistema de coordenadas que `BODY`.

No hace falta tocar `anim.js` para nada de esto salvo que el gesto nuevo
necesite una duración configurable — en ese caso, sumala igual que
cualquier otra (ver sección anterior).
