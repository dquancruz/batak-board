# Tarea: sistema de animaciones para Batak Board

## Contexto del proyecto

Batak Board es un entrenador de reflejos físico (tabla con 12 botones luminosos) conectado a una Raspberry Pi. La Pi corre la interfaz web que ves en este repo, mostrada en un monitor junto a la tabla.

Pantallas actuales: menú (modo de juego + dificultad), partida (grid de 12 círculos, puntaje, barra de tiempo), resultados con clasificación. Hay tema claro y oscuro, y una mascota pixel-art en la esquina superior izquierda que ya cambia de color y expresión según el estado.

**Dos restricciones que definen todo el diseño:**

1. **El jugador NO está viendo la pantalla durante la partida.** Está viendo los botones físicos de la tabla. Las animaciones durante el juego deben ser mínimas y cortas. El esfuerzo visual va en idle, transiciones y resultados.
2. **Corre en Raspberry Pi con Chromium.** El presupuesto de rendimiento es estrecho. Ver la sección de rendimiento más abajo.

## Antes de escribir código

1. Explorá el repo e identificá el stack (framework, manejo de estado, cómo está organizado el CSS, si hay librería de animación instalada).
2. Encontrá dónde viven las transiciones de pantalla y el estado de la partida.
3. Mirá cómo está implementada la mascota hoy (sprites, SVG, CSS, canvas).
4. **Contame qué encontraste y proponé el plan antes de implementar.** No arranques a escribir hasta que confirme.

## Arquitectura que quiero

- Un módulo central de animaciones con todas las duraciones, delays y easings como constantes con nombre. Nada de números mágicos regados por los componentes.
- Un flag global `reducedMotion` que respete `prefers-reduced-motion` y que además se pueda forzar desde un toggle "modo simple" en configuración.
- Las animaciones no deben poder romper la lógica del juego. Si una animación se interrumpe, el estado debe quedar correcto. El input nunca se bloquea esperando que termine una animación.
- Cada animación debe poder cancelarse limpiamente al cambiar de pantalla.

## Especificación

### Fase 1 — Idle / atracción

Se activa a los 20 s sin interacción en el menú. Loop de ~12 s. Sale con fade de 250 ms ante cualquier input.

| Elemento | Duración | Intervalo |
|---|---|---|
| Respiración mascota (scale 1 → 1.03) | 2.5 s | loop continuo |
| Parpadeo (ojos scaleY 1 → 0.1 → 1) | 120 ms | aleatorio 3–6 s |
| Gesto mascota (saludo / bostezo / mirar a los lados) | 1.2 s | cada 5 s, alternando |
| Onda de luz por los 12 círculos | 400 ms c/u, stagger 60 ms | cada 4 s |
| Rotación de textos (récord actual, "¿Podés superarlo?") | 300 ms fade out + 300 ms in | 4 s visible c/u |
| Pulso botón COMENZAR (scale 1 → 1.05) | 900 ms | cada 2 s |

### Fase 2 — Entrada al juego

Secuencia encadenada, 2.6 s total.

| Paso | Duración | Delay |
|---|---|---|
| Menú sale (fade + translateY 20px) | 250 ms | 0 |
| Grid entra (círculos scale 0.7 → 1) | 300 ms, stagger 40 ms | 100 ms |
| Mascota se reposiciona | 400 ms | simultáneo al grid |
| Countdown 3 · 2 · 1 (scale 1.6 → 1 + fade) | 500 ms por número | 100 ms entre números |
| "¡YA!" sale y arranca el timer | 300 ms | 0 |

El timer del juego arranca cuando termina "¡YA!", no antes.

### Fase 3 — Durante la partida

Nada arriba de 300 ms.

| Elemento | Duración | Nota |
|---|---|---|
| Círculo objetivo se enciende | 150 ms ease-out | debe sentirse instantáneo |
| Acierto: flash + scale 1 → 1.15 → 1 | 200 ms | verde |
| Fallo: shake horizontal ±6px | 250 ms | 3 oscilaciones |
| Puntaje sube (scale 1 → 1.25 → 1) | 180 ms | solo el número |
| Racha ≥5: aura pulsante en mascota | 800 ms loop | mientras dure la racha |
| Últimos 5 s: barra roja + latido | 500 ms loop, baja a 350 ms en los últimos 2 s | |
| Cambio de expresión de mascota | 120 ms crossfade | **máximo 1 cambio cada 400 ms** |

Ese throttle de 400 ms en la mascota es obligatorio. Sin él, en dificultad difícil la cara parpadea como estroboscopio.

### Fase 4 — Fin de ronda

| Paso | Duración | Delay |
|---|---|---|
| Congelar grid + desaturar | 300 ms | 0 |
| "TIEMPO" entra y sale | 800 ms visible | 200 ms |
| Grid sale (stagger inverso) | 250 ms, stagger 30 ms | 400 ms |
| Transición a resultados | 350 ms | 0 |

### Fase 5 — Resultados (~5 s total)

| Paso | Duración | Delay |
|---|---|---|
| Título RESULTADOS entra | 400 ms | 0 |
| Puntaje cuenta de 0 al total | 1.2 s ease-out | 200 ms |
| Desglose aciertos/fallos (fade + slide) | 300 ms | 300 ms |
| Mascota celebra o se desanima | 1.5 s | simultáneo al conteo |
| Confeti (**solo si entra al top 3**) | 2.5 s | al terminar el conteo |
| Filas del leaderboard entran | 250 ms c/u, stagger 80 ms | 400 ms |
| Fila propia se resalta + scroll | 600 ms | 300 ms |
| Botón JUGAR DE NUEVO aparece | 300 ms | 500 ms |

Sin interacción: a los 15 s vuelve al menú, a los 35 s entra el idle.

### Fase 6 — Modo 2 jugadores

| Elemento | Duración |
|---|---|
| Cambio de turno (card del jugador entra) | 500 ms |
| Nombre del jugador activo pulsa | 700 ms loop |
| Comparativa final (barras crecen) | 900 ms, stagger 200 ms |
| Corona sobre el ganador | 600 ms con rebote |

### Fase 7 — Micro-interacciones

| Elemento | Duración |
|---|---|
| Hover en botón | 150 ms |
| Press (scale 0.96) | 100 ms |
| Cambio de tema claro/oscuro | 400 ms |
| Toast | 200 ms in, 3 s visible, 200 ms out |

## Rendimiento en Raspberry Pi

Reglas duras:

- Animá **solo** `transform` y `opacity`. Nada de animar `width`, `height`, `top`, `left`, `margin`, `background-color` en loops.
- Prohibido `box-shadow` animado y `filter: blur()` sobre áreas grandes. Si necesitás glow, usá una capa con opacidad animada o un pseudo-elemento con gradiente.
- Confeti en `<canvas>`, **máximo 80 partículas**, que se detenga solo y libere el `requestAnimationFrame`.
- `will-change` solo mientras la animación corre; quitalo al terminar.
- Nada de `requestAnimationFrame` corriendo cuando no hay animación activa.
- Objetivo: 60 fps en menú y resultados, 60 fps estables durante la partida (esto último es lo más crítico, el input no puede tener jitter).

## Accesibilidad

- `@media (prefers-reduced-motion: reduce)` que lleve todas las duraciones a 0.01 ms, **sin** eliminar los cambios de color ni el feedback de acierto/fallo.
- Toggle "modo simple" en configuración que haga lo mismo, persistido en localStorage.

## Entregables

1. Módulo de constantes de animación.
2. Implementación por fases, en el orden 1 → 7.
3. Toggle de modo simple funcionando.
4. Un README corto explicando cómo ajustar duraciones y cómo agregar un nuevo estado de mascota.

## Cómo quiero que trabajes

- **Fase por fase.** Implementá una, mostrámela, y esperá mi visto bueno antes de seguir con la siguiente.
- No refactorices la lógica del juego. Si algo necesita cambiar para que la animación encaje, decímelo primero.
- Si alguna duración de la tabla se siente mal en la práctica, decímelo y proponé otra en vez de cambiarla en silencio.
- Si algo del spec choca con el rendimiento en la Pi, priorizá el rendimiento y avisame.