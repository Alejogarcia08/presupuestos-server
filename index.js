// -----------------------------------------------------------------------
// SERVIDOR — el único lugar del proyecto que tiene el Airtable Token
// -----------------------------------------------------------------------
import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
app.use(cors());
app.use(express.json());

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_API = "https://api.airtable.com/v0";

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

// =========================================================================
// MODULO PRESUPUESTOS
// =========================================================================

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
      fechaUltimoCobro: r.fields.Fecha_Ultimo_Cobro || "",
    }));
    presupuestos.sort((a, b) => (b.numero || 0) - (a.numero || 0));
    res.json(presupuestos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/:baseId/presupuestos/:id/cobro", async (req, res) => {
  try {
    const { incremento } = req.body;
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
          Cobrado: quedoSaldado,
        },
      },
    });
    res.json({ ok: true, montoCobrado: nuevoTotal, cobrado: quedoSaldado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/:baseId/presupuestos/:id/cobrado", async (req, res) => {
  try {
    const { cobrado } = req.body;
    const fieldsAActualizar = { Cobrado: !!cobrado };

    if (cobrado) {
      const actual = await airtableFetch(req.params.baseId, "Presupuestos", {
        path: `/${req.params.id}`,
      });
      fieldsAActualizar.Monto_Cobrado = actual.fields.Total || 0;
    } else {
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

app.delete("/api/:baseId/presupuestos/:id", async (req, res) => {
  try {
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

app.post("/api/:baseId/presupuestos", async (req, res) => {
  const { baseId } = req.params;
  try {
    const { clienteId, lineas } = req.body;

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

    const presupuesto = await airtableFetch(baseId, "Presupuestos", {
      method: "POST",
      body: {
        fields: {
          Cliente: [clienteId],
          Estado: "Listo para Enviar",
        },
      },
    });

    // Si el cliente estaba marcado como Inactivo (por el chequeo semanal
    // del Mini-CRM), lo reactivamos: acaba de tener actividad de nuevo,
    // asi no queda "pegado" en Inactivo para siempre.
    try {
      await airtableFetch(baseId, "Clientes", {
        method: "PATCH",
        path: `/${clienteId}`,
        body: { fields: { Estado_Cliente: "Activo" } },
      });
    } catch {
      // Si el cliente no tiene ese campo o falla, no bloqueamos el
      // presupuesto por esto.
    }

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

// =========================================================================
// MODULO TURNOS (base separada — usa el mismo :baseId generico, solo que
// para este modulo apunta a la base "Sistema Turnos", no a la de
// Presupuestos. El front decide que baseId mandar segun el cliente/rubro)
// =========================================================================

app.get("/api/:baseId/pacientes", async (req, res) => {
  try {
    const data = await airtableFetch(req.params.baseId, "Pacientes");
    const pacientes = data.records.map((r) => ({
      id: r.id,
      nombre: r.fields.Name || "",
      telefono: r.fields.Telefono || "",
      email: r.fields.Email || "",
      notas: r.fields.Notas || "",
    }));
    res.json(pacientes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/:baseId/pacientes", async (req, res) => {
  try {
    const { nombre, telefono, email, notas } = req.body;
    const data = await airtableFetch(req.params.baseId, "Pacientes", {
      method: "POST",
      body: {
        fields: {
          Name: nombre,
          ...(telefono ? { Telefono: telefono } : {}),
          ...(email ? { Email: email } : {}),
          ...(notas ? { Notas: notas } : {}),
        },
      },
    });
    res.json({
      id: data.id,
      nombre: data.fields.Name || "",
      telefono: data.fields.Telefono || "",
      email: data.fields.Email || "",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/:baseId/pacientes/:id", async (req, res) => {
  try {
    const { nombre, telefono, email, notas } = req.body;
    const data = await airtableFetch(req.params.baseId, "Pacientes", {
      method: "PATCH",
      path: `/${req.params.id}`,
      body: {
        fields: {
          ...(nombre !== undefined ? { Name: nombre } : {}),
          ...(telefono !== undefined ? { Telefono: telefono } : {}),
          ...(email !== undefined ? { Email: email } : {}),
          ...(notas !== undefined ? { Notas: notas } : {}),
        },
      },
    });
    res.json({
      id: data.id,
      nombre: data.fields.Name || "",
      telefono: data.fields.Telefono || "",
      email: data.fields.Email || "",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/:baseId/pacientes/:id", async (req, res) => {
  try {
    await airtableFetch(req.params.baseId, "Pacientes", {
      method: "DELETE",
      path: `/${req.params.id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/:baseId/turnos", async (req, res) => {
  try {
    const data = await airtableFetch(req.params.baseId, "Turnos");
    const turnos = data.records.map((r) => ({
      id: r.id,
      pacienteId: (r.fields.Paciente && r.fields.Paciente.length) ? r.fields.Paciente[0] : null,
      fecha: r.fields.Fecha || "",
      hora: r.fields.Hora || "",
      notas: r.fields.Notas_Turno || "",
      estado: r.fields.Estado || "Confirmado",
      recordatorioEnviado: !!r.fields.Recordatorio_Enviado,
      resenaSolicitada: !!r.fields.Resena_Solicitada,
    }));
    // Los mas proximos primero
    turnos.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
    res.json(turnos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/:baseId/turnos", async (req, res) => {
  try {
    const { pacienteId, fecha, hora, notas } = req.body;
    const data = await airtableFetch(req.params.baseId, "Turnos", {
      method: "POST",
      body: {
        fields: {
          Paciente: [pacienteId],
          Fecha: fecha,
          Hora: hora,
          ...(notas ? { Notas_Turno: notas } : {}),
          Estado: "Confirmado",
        },
      },
    });
    res.json({ ok: true, id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/:baseId/turnos/:id/estado", async (req, res) => {
  try {
    const { estado } = req.body;
    await airtableFetch(req.params.baseId, "Turnos", {
      method: "PATCH",
      path: `/${req.params.id}`,
      body: { fields: { Estado: estado } },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/:baseId/turnos/:id/reprogramar", async (req, res) => {
  try {
    const { fecha, hora } = req.body;
    await airtableFetch(req.params.baseId, "Turnos", {
      method: "PATCH",
      path: `/${req.params.id}`,
      body: { fields: { Fecha: fecha, Hora: hora } },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/:baseId/turnos/:id/resena", async (req, res) => {
  try {
    await airtableFetch(req.params.baseId, "Turnos", {
      method: "PATCH",
      path: `/${req.params.id}`,
      body: { fields: { Resena_Solicitada: true } },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/:baseId/turnos/:id", async (req, res) => {
  try {
    await airtableFetch(req.params.baseId, "Turnos", {
      method: "DELETE",
      path: `/${req.params.id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// MODULO TURNOS RECURRENTES ("reglas" que generan turnos cada semana)
// =========================================================================

app.get("/api/:baseId/turnos-recurrentes", async (req, res) => {
  try {
    const data = await airtableFetch(req.params.baseId, "Turnos_Recurrentes");
    const reglas = data.records.map((r) => ({
      id: r.id,
      pacienteId: (r.fields.Paciente && r.fields.Paciente.length) ? r.fields.Paciente[0] : null,
      diaSemana: r.fields.Dia_Semana || "",
      hora: r.fields.Hora || "",
      fechaInicio: r.fields.Fecha_Inicio || "",
      activo: !!r.fields.Activo,
      notas: r.fields.Notas || "",
    }));
    res.json(reglas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/:baseId/turnos-recurrentes", async (req, res) => {
  try {
    const { pacienteId, diaSemana, hora, fechaInicio, notas } = req.body;
    const data = await airtableFetch(req.params.baseId, "Turnos_Recurrentes", {
      method: "POST",
      body: {
        fields: {
          Paciente: [pacienteId],
          Dia_Semana: diaSemana,
          Hora: hora,
          Fecha_Inicio: fechaInicio,
          Activo: true,
          ...(notas ? { Notas: notas } : {}),
        },
      },
    });
    res.json({ ok: true, id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/:baseId/turnos-recurrentes/:id/activo", async (req, res) => {
  try {
    const { activo } = req.body;
    await airtableFetch(req.params.baseId, "Turnos_Recurrentes", {
      method: "PATCH",
      path: `/${req.params.id}`,
      body: { fields: { Activo: !!activo } },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// MODULO FLOTA Y CONDUCTORES (base separada "Sistema Flota")
// =========================================================================

app.get("/api/:baseId/vehiculos", async (req, res) => {
  try {
    const data = await airtableFetch(req.params.baseId, "Vehiculos");
    const vehiculos = data.records.map((r) => ({
      id: r.id,
      patente: r.fields.Name || "",
      marcaModelo: r.fields.Marca_Modelo || "",
      tipo: r.fields.Tipo || "",
      vtvVencimiento: r.fields.VTV_Vencimiento || "",
      seguroVencimiento: r.fields.Seguro_Vencimiento || "",
      serviceProximo: r.fields.Service_Proximo || "",
      conductorId: (r.fields.Conductor && r.fields.Conductor.length) ? r.fields.Conductor[0] : null,
      notas: r.fields.Notas || "",
    }));
    res.json(vehiculos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/:baseId/vehiculos", async (req, res) => {
  try {
    const { patente, marcaModelo, tipo, vtvVencimiento, seguroVencimiento, serviceProximo, conductorId, notas } = req.body;
    const data = await airtableFetch(req.params.baseId, "Vehiculos", {
      method: "POST",
      body: {
        fields: {
          Name: patente,
          ...(marcaModelo ? { Marca_Modelo: marcaModelo } : {}),
          ...(tipo ? { Tipo: tipo } : {}),
          ...(vtvVencimiento ? { VTV_Vencimiento: vtvVencimiento } : {}),
          ...(seguroVencimiento ? { Seguro_Vencimiento: seguroVencimiento } : {}),
          ...(serviceProximo ? { Service_Proximo: serviceProximo } : {}),
          ...(conductorId ? { Conductor: [conductorId] } : {}),
          ...(notas ? { Notas: notas } : {}),
        },
      },
    });
    res.json({ id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/:baseId/vehiculos/:id", async (req, res) => {
  try {
    const { patente, marcaModelo, tipo, vtvVencimiento, seguroVencimiento, serviceProximo, conductorId, notas } = req.body;
    const fields = {};
    if (patente !== undefined) fields.Name = patente;
    if (marcaModelo !== undefined) fields.Marca_Modelo = marcaModelo;
    if (tipo !== undefined) fields.Tipo = tipo;
    // Airtable rechaza "" para campos de fecha (quiere una fecha valida o
    // directamente que no le mandemos nada) — por eso mandamos null si
    // el campo vino vacio.
    if (vtvVencimiento !== undefined) fields.VTV_Vencimiento = vtvVencimiento || null;
    if (seguroVencimiento !== undefined) fields.Seguro_Vencimiento = seguroVencimiento || null;
    if (serviceProximo !== undefined) fields.Service_Proximo = serviceProximo || null;
    if (conductorId !== undefined) fields.Conductor = conductorId ? [conductorId] : [];
    if (notas !== undefined) fields.Notas = notas;

    await airtableFetch(req.params.baseId, "Vehiculos", {
      method: "PATCH",
      path: `/${req.params.id}`,
      body: { fields },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/:baseId/vehiculos/:id", async (req, res) => {
  try {
    await airtableFetch(req.params.baseId, "Vehiculos", {
      method: "DELETE",
      path: `/${req.params.id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/:baseId/conductores", async (req, res) => {
  try {
    const data = await airtableFetch(req.params.baseId, "Conductores");
    const conductores = data.records.map((r) => ({
      id: r.id,
      nombre: r.fields.Name || "",
      telefono: r.fields.Telefono || "",
      email: r.fields.Email || "",
      licenciaNumero: r.fields.Licencia_Numero || "",
      licenciaVencimiento: r.fields.Licencia_Vencimiento || "",
    }));
    res.json(conductores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/:baseId/conductores", async (req, res) => {
  try {
    const { nombre, telefono, email, licenciaNumero, licenciaVencimiento } = req.body;
    const data = await airtableFetch(req.params.baseId, "Conductores", {
      method: "POST",
      body: {
        fields: {
          Name: nombre,
          ...(telefono ? { Telefono: telefono } : {}),
          ...(email ? { Email: email } : {}),
          ...(licenciaNumero ? { Licencia_Numero: licenciaNumero } : {}),
          ...(licenciaVencimiento ? { Licencia_Vencimiento: licenciaVencimiento } : {}),
        },
      },
    });
    res.json({ id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/:baseId/conductores/:id", async (req, res) => {
  try {
    const { nombre, telefono, email, licenciaNumero, licenciaVencimiento } = req.body;
    const fields = {};
    if (nombre !== undefined) fields.Name = nombre;
    if (telefono !== undefined) fields.Telefono = telefono;
    if (email !== undefined) fields.Email = email;
    if (licenciaNumero !== undefined) fields.Licencia_Numero = licenciaNumero;
    if (licenciaVencimiento !== undefined) fields.Licencia_Vencimiento = licenciaVencimiento;

    await airtableFetch(req.params.baseId, "Conductores", {
      method: "PATCH",
      path: `/${req.params.id}`,
      body: { fields },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/:baseId/conductores/:id", async (req, res) => {
  try {
    await airtableFetch(req.params.baseId, "Conductores", {
      method: "DELETE",
      path: `/${req.params.id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/:baseId/checklists", async (req, res) => {
  try {
    const data = await airtableFetch(req.params.baseId, "Checklists_Semanales");
    const checklists = data.records.map((r) => ({
      id: r.id,
      vehiculoId: (r.fields.Vehiculo && r.fields.Vehiculo.length) ? r.fields.Vehiculo[0] : null,
      fecha: r.fields.Fecha || "",
      presionNeumaticos: !!r.fields.Presion_Neumaticos,
      aceite: !!r.fields.Aceite,
      luces: !!r.fields.Luces,
      toldo: !!r.fields.Toldo,
      fugas: !!r.fields.Fugas,
      espejosVidrios: !!r.fields.Espejos_Vidrios,
      observaciones: r.fields.Observaciones || "",
      requiereAtencion: !!r.fields.Requiere_Atencion,
    }));
    checklists.sort((a, b) => b.fecha.localeCompare(a.fecha));
    res.json(checklists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/:baseId/checklists", async (req, res) => {
  try {
    const {
      vehiculoId,
      fecha,
      presionNeumaticos,
      aceite,
      luces,
      toldo,
      fugas,
      espejosVidrios,
      observaciones,
      requiereAtencion,
    } = req.body;
    const data = await airtableFetch(req.params.baseId, "Checklists_Semanales", {
      method: "POST",
      body: {
        fields: {
          Vehiculo: [vehiculoId],
          Fecha: fecha,
          Presion_Neumaticos: !!presionNeumaticos,
          Aceite: !!aceite,
          Luces: !!luces,
          Toldo: !!toldo,
          Fugas: !!fugas,
          Espejos_Vidrios: !!espejosVidrios,
          ...(observaciones ? { Observaciones: observaciones } : {}),
          Requiere_Atencion: !!requiereAtencion,
        },
      },
    });
    res.json({ id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor escuchando en http://localhost:${PORT} (y en tu red local)`);
});