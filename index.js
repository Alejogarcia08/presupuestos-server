// -----------------------------------------------------------------------
// SERVIDOR — el único lugar del proyecto que tiene el Airtable Token
// -----------------------------------------------------------------------
// Este archivo levanta un pequeño servidor que:
//   1) Recibe pedidos desde tu formulario de React (que corre en otra
//      terminal, en localhost:5173)
//   2) Habla con Airtable usando el token secreto (que vive en .env,
//      nunca en el código, nunca en el navegador)
//   3) Le devuelve la respuesta a React
//
// Se prende con: npm run dev   (desde ESTA carpeta, presupuestos-server)
// -----------------------------------------------------------------------

import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
app.use(cors());          // permite que React (otro puerto) le pueda hablar a este servidor
app.use(express.json());  // permite recibir JSON en el body de los pedidos

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_API = "https://api.airtable.com/v0";

// -----------------------------------------------------------------------
// Función helper: hace un pedido a la API de Airtable con el token puesto
// -----------------------------------------------------------------------
async function airtableFetch(baseId, tabla, opciones = {}) {
  const url = `${AIRTABLE_API}/${baseId}/${encodeURIComponent(tabla)}${opciones.path || ""}`;
  const res = await fetch(url, {
    method: opciones.method || "GET",
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Error de Airtable:", data);
    throw new Error(data?.error?.message || "Error hablando con Airtable");
  }
  return data;
}

// -----------------------------------------------------------------------
// GET /api/:baseId/clientes  -> lista los clientes de esa base
// -----------------------------------------------------------------------
app.get("/api/:baseId/clientes", async (req, res) => {
  try {
    const data = await airtableFetch(req.params.baseId, "Clientes");
    const clientes = data.records.map((r) => ({
      id: r.id,
      nombre: r.fields.Name || "",
      empresa: r.fields.Empresa || "",
      telefono: r.fields.telefono || "",
      email: r.fields.Email || "",
      estadoCliente: r.fields.Estado_Cliente || "",
      ultimaInteraccion: r.fields.Ultima_Interaccion || "",
    }));
    res.json(clientes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// POST /api/:baseId/clientes  -> crea un cliente nuevo
// body: { nombre, empresa?, telefono?, email? }
// -----------------------------------------------------------------------
app.post("/api/:baseId/clientes", async (req, res) => {
  try {
    const { nombre, empresa, telefono, email } = req.body;
    const data = await airtableFetch(req.params.baseId, "Clientes", {
      method: "POST",
      body: {
        fields: {
          Name: nombre,
          ...(empresa ? { Empresa: empresa } : {}),
          ...(telefono ? { telefono } : {}),
          ...(email ? { Email: email } : {}),
        },
      },
    });
    res.json({ id: data.id, nombre: data.fields.Name, empresa: data.fields.Empresa || "" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// GET /api/:baseId/productos  -> lista el catálogo de Productos_Servicios
// -----------------------------------------------------------------------
app.get("/api/:baseId/productos", async (req, res) => {
  try {
    const data = await airtableFetch(req.params.baseId, "Productos_Servicios");
    const productos = data.records.map((r) => ({
      id: r.id,
      nombre: r.fields.Name || "",
      precio: r.fields["Precio base"] || 0,
    }));
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// GET /api/:baseId/presupuestos/:id/items -> los ítems de un presupuesto puntual
// -----------------------------------------------------------------------
app.get("/api/:baseId/presupuestos/:id/items", async (req, res) => {
  try {
    const data = await airtableFetch(req.params.baseId, "Items_Presupuestos");
    const items = data.records
      .filter((r) => (r.fields.Presupuesto || []).includes(req.params.id))
      .map((r) => ({
        id: r.id,
        nombre: r.fields.Producto_Nombre || r.fields.Name || "",
        cantidad: r.fields.Cantidad || 0,
        precioUnitario: r.fields.Precio_Unitario || 0,
        subtotal: r.fields.Subtotal || 0,
      }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// POST /api/:baseId/presupuestos  -> crea un presupuesto completo
// body: { clienteId, lineas: [{ productoId?, nombre, precio, cantidad }] }
//
// Si una línea NO tiene productoId (fue cargada como "ítem personalizado"),
// primero se crea el producto en Productos_Servicios, y de ahí en adelante
// queda disponible en el catálogo para la próxima vez.
// -----------------------------------------------------------------------
// -----------------------------------------------------------------------
// GET /api/:baseId/presupuestos  -> lista los presupuestos (para "Mis presupuestos")
// -----------------------------------------------------------------------
app.get("/api/:baseId/presupuestos", async (req, res) => {
  try {
    const data = await airtableFetch(req.params.baseId, "Presupuestos");
    const presupuestos = data.records.map((r) => ({
      id: r.id,
      numero: r.fields["N. Presupuesto"] || "",
      clienteId: (r.fields.Cliente && r.fields.Cliente.length) ? r.fields.Cliente[0] : null,
      fecha: r.fields.Fecha_Creacion || r.fields["Fecha Creacion"] || "",
      total: r.fields.Total || 0,
      estado: r.fields.Estado || "",
      cobrado: !!r.fields.Cobrado,
      montoCobrado: r.fields.Monto_Cobrado || 0,
      saldoPendiente: r.fields.Saldo_Pendiente || 0,
    }));
    // Los más nuevos primero
    presupuestos.sort((a, b) => (b.numero || 0) - (a.numero || 0));
    res.json(presupuestos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// PATCH /api/:baseId/presupuestos/:id/cobro  -> registra un cobro parcial/total
// body: { montoCobrado: number }
// -----------------------------------------------------------------------
app.patch("/api/:baseId/presupuestos/:id/cobro", async (req, res) => {
  try {
    const { incremento } = req.body;
    // Primero leemos el registro actual, para saber cuánto lleva cobrado
    // y cuál es el total (para saber si con este pago queda saldado)
    const actual = await airtableFetch(req.params.baseId, "Presupuestos", {
      path: `/${req.params.id}`,
    });
    const cobradoActual = actual.fields.Monto_Cobrado || 0;
    const total = actual.fields.Total || 0;
    const nuevoTotal = cobradoActual + (Number(incremento) || 0);
    const quedoSaldado = nuevoTotal >= total && total > 0;

    await airtableFetch(req.params.baseId, "Presupuestos", {
      method: "PATCH",
      path: `/${req.params.id}`,
      body: {
        fields: {
          Monto_Cobrado: nuevoTotal,
          // Si con este pago se llega o se supera el total, lo marcamos
          // como Cobrado automáticamente, para que "Mis presupuestos"
          // quede sincronizado sin que haya que tocarlo a mano ahí también.
          Cobrado: quedoSaldado,
        },
      },
    });
    res.json({ ok: true, montoCobrado: nuevoTotal, cobrado: quedoSaldado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// PATCH /api/:baseId/presupuestos/:id/cobrado  -> marca/desmarca "Cobrado"
// body: { cobrado: true | false }
// -----------------------------------------------------------------------
app.patch("/api/:baseId/presupuestos/:id/cobrado", async (req, res) => {
  try {
    const { cobrado } = req.body;
    const fieldsAActualizar = { Cobrado: !!cobrado };

    if (cobrado) {
      // Al marcar como Cobrado a mano, completamos Monto_Cobrado con el
      // total, para que el saldo pendiente quede en cero.
      const actual = await airtableFetch(req.params.baseId, "Presupuestos", {
        path: `/${req.params.id}`,
      });
      fieldsAActualizar.Monto_Cobrado = actual.fields.Total || 0;
    } else {
      // Al desmarcar, reseteamos el monto cobrado a 0 — el presupuesto
      // vuelve completo a "Cobros pendientes", sin dejar memoria de un
      // cobro parcial anterior.
      fieldsAActualizar.Monto_Cobrado = 0;
    }

    await airtableFetch(req.params.baseId, "Presupuestos", {
      method: "PATCH",
      path: `/${req.params.id}`,
      body: { fields: fieldsAActualizar },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// DELETE /api/:baseId/presupuestos/:id -> borra un presupuesto Y sus items
// -----------------------------------------------------------------------
app.delete("/api/:baseId/presupuestos/:id", async (req, res) => {
  try {
    // Primero borramos las líneas (Items_Presupuestos) ligadas a este
    // presupuesto, para no dejar registros huérfanos en Airtable.
    const itemsData = await airtableFetch(req.params.baseId, "Items_Presupuestos");
    const idsABorrar = itemsData.records
      .filter((r) => (r.fields.Presupuesto || []).includes(req.params.id))
      .map((r) => r.id);

    for (const itemId of idsABorrar) {
      await airtableFetch(req.params.baseId, "Items_Presupuestos", {
        method: "DELETE",
        path: `/${itemId}`,
      });
    }

    await airtableFetch(req.params.baseId, "Presupuestos", {
      method: "DELETE",
      path: `/${req.params.id}`,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// DELETE /api/:baseId/productos/:id -> borra un producto del catálogo
// -----------------------------------------------------------------------
app.delete("/api/:baseId/productos/:id", async (req, res) => {
  try {
    await airtableFetch(req.params.baseId, "Productos_Servicios", {
      method: "DELETE",
      path: `/${req.params.id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/:baseId/presupuestos", async (req, res) => {
  const { baseId } = req.params;
  try {
    const { clienteId, lineas } = req.body;

    // 1) Para cada línea sin productoId, creamos el producto en el catálogo
    const lineasConProducto = [];
    for (const linea of lineas) {
      let productoId = linea.productoId;
      if (!productoId) {
        const nuevoProducto = await airtableFetch(baseId, "Productos_Servicios", {
          method: "POST",
          body: { fields: { Name: linea.nombre, "Precio base": linea.precio } },
        });
        productoId = nuevoProducto.id;
      }
      lineasConProducto.push({ ...linea, productoId });
    }

    // 2) Creamos el registro del Presupuesto (todavía sin líneas linkeadas)
    const presupuesto = await airtableFetch(baseId, "Presupuestos", {
      method: "POST",
      body: {
        fields: {
          Cliente: [clienteId],
          Estado: "Listo para Enviar",
        },
      },
    });

    // 3) Creamos cada línea en Items_Presupuestos, linkeada al presupuesto y al producto
    for (const linea of lineasConProducto) {
      await airtableFetch(baseId, "Items_Presupuestos", {
        method: "POST",
        body: {
          fields: {
            Presupuesto: [presupuesto.id],
            Producto: [linea.productoId],
            Cantidad: linea.cantidad,
            Precio_Unitario: linea.precio,
          },
        },
      });
    }

    // 4) Intentamos actualizar el Total a mano (si el campo es un rollup/fórmula
    //    automática en tu base, Airtable va a rechazar esta escritura — lo
    //    ignoramos sin romper nada, porque en ese caso ya se calcula solo).
    const total = lineasConProducto.reduce((acc, l) => acc + l.precio * l.cantidad, 0);
    try {
      await airtableFetch(baseId, "Presupuestos", {
        method: "PATCH",
        path: `/${presupuesto.id}`,
        body: { fields: { Total: total } },
      });
    } catch {
      // Campo probablemente calculado automáticamente — no pasa nada.
    }

    res.json({ ok: true, presupuestoId: presupuesto.id, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor escuchando en http://localhost:${PORT} (y en tu red local)`);
});
