const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ==========================================
// CONEXIÓN A MONGODB ATLAS
// ==========================================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://christopheraispuro_db_user:TU_PASSWORD@bloqueos.tj6s6fc.mongodb.net/bloqueos?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("🟢 Conectado exitosamente a MongoDB Atlas"))
    .catch((error) => console.error("❌ Error de conexión a MongoDB:", error));

// Esquema de la base de datos
const BloqueoSchema = new mongoose.Schema({
    numero: String,
    motivo: String,
    extension: String,
    operador: String,
    comentarios: String,
    fecha: String,
    atendido: { type: Boolean, default: false }
}, { timestamps: true });

const Bloqueo = mongoose.model("Bloqueo", BloqueoSchema);

// Archivos estáticos de la carpeta public
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// RUTAS LIMPIAS (PASO 1)
// ==========================================
// Ruta para la Tablet (Abre index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para el Receptor PC (Abre receptor.html)
app.get('/receptor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'receptor.html'));
});

// ==========================================
// CONEXIONES SOCKET.IO
// ==========================================
io.on("connection", async (socket) => {
    console.log("🟢 Dispositivo conectado:", socket.id);

    // 1. Enviar historial guardado en MongoDB al conectar
    try {
        const registros = await Bloqueo.find().sort({ createdAt: -1 });
        const historial = registros.map(doc => ({
            id: doc._id.toString(),
            numero: doc.numero,
            motivo: doc.motivo,
            extension: doc.extension,
            operador: doc.operador,
            comentarios: doc.comentarios,
            fecha: doc.fecha,
            atendido: doc.atendido
        }));
        socket.emit("cargarHistorial", historial);
    } catch (error) {
        console.error("❌ Error al cargar historial desde MongoDB:", error);
    }

    // 2. Recibir nuevo bloqueo desde la tablet
    socket.on("nuevoBloqueo", async (datos, callback) => {
        if (!datos) return;

        try {
            const nuevoBloqueo = new Bloqueo({
                numero: datos.numero || datos.phone || "N/A",
                motivo: datos.motivo || datos.reason || "N/A",
                extension: datos.extension || "N/A",
                operador: datos.operador || datos.operator_name || "Sin especificar",
                comentarios: datos.comentarios || datos.notes || "Sin comentarios",
                fecha: datos.fecha || "",
                atendido: false
            });

            await nuevoBloqueo.save();

            const registroParaEmitir = {
                id: nuevoBloqueo._id.toString(),
                numero: nuevoBloqueo.numero,
                motivo: nuevoBloqueo.motivo,
                extension: nuevoBloqueo.extension,
                operador: nuevoBloqueo.operador,
                comentarios: nuevoBloqueo.comentarios,
                fecha: nuevoBloqueo.fecha,
                atendido: nuevoBloqueo.atendido
            };

            console.log("📵 NUEVO BLOQUEO GUARDADO EN MONGODB:", registroParaEmitir.numero);

            // Transmitir a todos los receptores conectados
            io.emit("bloqueoRecibido", registroParaEmitir);

            // Responder confirmación a la tablet
            if (typeof callback === "function") {
                callback({ ok: true });
            }
        } catch (error) {
            console.error("❌ Error guardando registro en MongoDB:", error);
            if (typeof callback === "function") {
                callback({ ok: false, error: "Error al guardar en base de datos" });
            }
        }
    });

    // 3. Marcar registro como atendido en MongoDB
    socket.on("marcarAtendido", async (id) => {
        try {
            await Bloqueo.findByIdAndUpdate(id, { atendido: true });
            io.emit("bloqueoAtendido", id);
        } catch (error) {
            console.error("❌ Error actualizando estado en MongoDB:", error);
        }
    });

    socket.on("disconnect", () => {
        console.log("🔴 Dispositivo desconectado:", socket.id);
    });
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
server.listen(PORT, "0.0.0.0", () => {
    console.log("\n====================================");
    console.log("🚀 SERVIDOR EN LÍNEA CON MONGODB ATLAS");
    console.log("====================================");
    console.log(`📱 Tablet:   http://localhost:${PORT}/`);
    console.log(`📊 Receptor: http://localhost:${PORT}/receptor`);
    console.log("====================================\n");
});