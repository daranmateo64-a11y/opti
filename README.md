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

## Cómo se usa

1. **Stock**: cargá todas las planchas y retazos que tenés (tipo, espesor, medidas, cantidad). Se guarda solo en el
   navegador. Con *Descargar stock* te llevás una copia a un archivo y con *Cargar desde archivo* la recuperás.
2. **Cortar**: elegí el vidrio (sólo aparecen los tipos y espesores que hay en el stock), ingresá ancho, alto y
   cantidad de la pieza que necesitás y tocá *Buscar mejor corte*.
3. Revisá el plan y tocá **Confirmar corte y actualizar stock**: se descuentan las planchas o retazos usados, los
   retazos que se agotan desaparecen y los retazos útiles que sobran se agregan al stock.

## Otras funciones

- Cantidad de planchas por medida (vacío = sin límite).
- Retazos del stock marcados como tales (se usan con prioridad).
- Los retazos útiles que salen de un corte se pueden reutilizar en el mismo trabajo.
- Piezas con o sin rotación (por ejemplo vidrios con dibujo o veta).
- Ancho de corte y despunte de borde configurables.
- Fuera de claude.ai los datos se guardan en el navegador.

## En el teléfono

La app está publicada en claude.ai: https://claude.ai/artifact/X3kFxCtRrDBZH9Yn7Q2qia

Ahí el stock y los ajustes se guardan en el servidor, no en el navegador. Para actualizarla después de cambiar el
código: `npm run build` arma `dist/opti-vidrio.html` (una sola página con todo embebido), que es lo que se publica.

## Abrir la página en la computadora

Es una página estática, sin instalación. Servila con cualquier servidor estático y abrí `index.html`:

```sh
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Tests

```sh
npm test
```
