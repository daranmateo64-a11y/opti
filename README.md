# Opti Vidrio

Optimizador de cortes de vidrio que **no se queda con la plancha que deja menos sobrante, sino con la que deja menos desperdicio real**.

## La idea

Cortar las piezas de la plancha que deja menos área sobrante no siempre es lo mejor: si ese sobrante son tiras finas,
no sirve para nada y es desperdicio. A veces conviene cortar de otra plancha (más grande) porque lo que sobra es un
**retazo útil** que vuelve al stock.

Por eso cada sobrante se clasifica:

- **Retazo útil**: mide al menos lo que pongas en *Retazo útil: lado mín.* × *otro lado mín.* (en cualquier orientación).
  Vuelve al stock.
- **Desperdicio**: todo lo demás (tiras chicas, ancho de corte, despunte de borde).

Para cada plancha o retazo disponible se prueban varias formas de acomodar las piezas (cortes guillotina, como se corta
el vidrio) y se elige la que tenga **menor desperdicio por m² de pieza cortada**. A igual desperdicio se usan primero
los retazos que ya tenés, después la que coloque más piezas y por último la plancha más chica.

## Tipos y espesores

No hace falta definirlos de antemano: cargá en el stock cada combinación que tengas (por ejemplo *Float incoloro 4 mm*,
*Laminado 3+3 6 mm*, *Espejo 4 mm*…). Las piezas sólo se cortan de planchas del mismo tipo y espesor. Si una pieza no
tiene plancha de su tipo/espesor, aparece como "sin colocar".

## Otras funciones

- Cantidad de planchas por medida (vacío = sin límite).
- Retazos del stock marcados como tales (se usan con prioridad).
- Los retazos útiles que salen de un corte se pueden reutilizar en el mismo trabajo.
- Botón para guardar los retazos que sobran en el stock.
- Piezas con o sin rotación (por ejemplo vidrios con dibujo o veta).
- Ancho de corte y despunte de borde configurables.
- Los datos se guardan en el navegador.

## Uso

Es una página estática, sin instalación. Servila con cualquier servidor estático y abrí `index.html`:

```sh
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Tests

```sh
npm test
```
