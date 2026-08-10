# Servidor de Presupuestos

Este es el "puente seguro" entre tu formulario de React y Airtable. Guarda tu
token secreto y es el único que le habla a Airtable directamente.

## Instalación (primera vez)

1. Abrí una terminal DENTRO de esta carpeta (`presupuestos-server`).
2. Corré:
   ```
   npm install
   ```
3. Copiá el archivo `.env.example` y renombralo a `.env` (sin ".example").
4. Abrí `.env` con el Bloc de notas (o VS Code) y pegá tu token real de
   Airtable donde dice `pegá_aca_tu_token...`. Guardá el archivo.

## Cómo prenderlo

```
npm run dev
```

Si todo salió bien, vas a ver en la terminal:
```
Servidor escuchando en http://localhost:3001
```

**Importante**: este servidor tiene que estar prendido EN PARALELO al
proyecto de React (`presupuestos-app`). Son dos terminales distintas, las
dos abiertas al mismo tiempo:
- Una corriendo `npm run dev` en `presupuestos-server` (este servidor)
- Otra corriendo `npm run dev` en `presupuestos-app` (el formulario)

## Qué hace cada ruta

- `GET /api/:baseId/clientes` — lista los clientes de esa base
- `POST /api/:baseId/clientes` — crea un cliente nuevo
- `GET /api/:baseId/productos` — lista el catálogo de productos
- `POST /api/:baseId/presupuestos` — crea un presupuesto completo (y crea
  productos nuevos en el catálogo si hace falta)

El `:baseId` en la URL es el ID de tu base de Airtable (empieza con `app...`).

## Si algo no funciona

Mirá la terminal donde corre este servidor — cualquier error de Airtable
(token mal copiado, nombre de campo distinto, etc.) va a aparecer ahí
impreso, con el detalle de qué está mal.
