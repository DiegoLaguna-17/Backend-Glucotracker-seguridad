const supabase = require('../../database'); // tu cliente Supabase


const response = (res, status, code, message, data = null) => {
  return res.status(code).json({ status, code, message, data });
};

const datosParaGlucosa = async (req, res) => {
  // Ajusté el nombre de la variable para que sea coherente con la consulta (ID del paciente)
  // Asegúrate de que tu ruta de Express diga algo como: router.get('/datos/:idPaciente', ...)
  const idPaciente = parseInt(req.params.idPaciente || req.params.idUsuario);

  if (isNaN(idPaciente)) {
    return response(res, 'error', 400, 'El ID del paciente proporcionado no es válido');
  }

  try {
    // 1️⃣ Consulta Relacional con Supabase (Reemplazo del RPC)
    const { data: p, error } = await supabase
      .from('paciente')
      .select(`
        id_paciente,
        embarazo,
        id_medico,
        usuario!inner (
          fecha_nac
        ),
        paciente_enfermedad (
          enfermedades_base (
            nombre_enfermedad
          )
        )
      `)
      .eq('id_paciente', idPaciente)
      .single();

    if (error) {
      console.error('Error en consulta Supabase (datosParaGlucosa):', error.message);
      if (error.code === 'PGRST116') {
        return response(res, 'error', 404, 'No se encontró el paciente en el sistema');
      }
      throw error;
    }

    // 2️⃣ Calcular la edad en Node.js (Reemplazo de date_part y age de PostgreSQL)
    let edad = 0;
    if (p.usuario?.fecha_nac) {
      const fechaNacimiento = new Date(p.usuario.fecha_nac);
      const hoy = new Date();
      edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
      const mes = hoy.getMonth() - fechaNacimiento.getMonth();
      
      // Si el mes actual es menor al mes de nacimiento, o si es el mismo mes pero el día no ha llegado, restamos 1 año
      if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNacimiento.getDate())) {
        edad--;
      }
    }

    // 3️⃣ Mapear enfermedades a un arreglo simple
    const listaEnfermedades = p.paciente_enfermedad?.map(pe => pe.enfermedades_base?.nombre_enfermedad) || [];

    // 4️⃣ Construir el objeto JSON final
    const datosFormateados = {
      edad: edad,
      embarazo: p.embarazo,
      id_medico: p.id_medico,
      id_paciente: p.id_paciente,
      enfermedades: listaEnfermedades
    };

    // 5️⃣ Respuesta Exitosa
    return response(res, 'success', 200, 'Datos médicos del paciente obtenidos correctamente', datosFormateados);

  } catch (err) {
    console.error('Error interno en datosParaGlucosa:', err.message);
    return response(res, 'error', 500, 'Error interno del servidor al procesar la solicitud');
  }
};
 


const nodemailer = require("nodemailer");
const { getHipoTemplate, getHiperTemplate } = require("../email/templates");

const guardarLogCompleto = async (logApp, logDetalles = []) => {
  try {
    const { data: logInsertado, error: errorLog } = await supabase
      .from("logs_aplicacion")
      .insert([logApp])
      .select()
      .single();

    if (errorLog) throw errorLog;

    if (logDetalles.length > 0) {
      const detalles = logDetalles.map(d => ({
        ...d,
        id_log_aplicacion: logInsertado.id
      }));

      const { error: errorDetalle } = await supabase
        .from("logs_detalle")
        .insert(detalles);

      if (errorDetalle) throw errorDetalle;
    }

  } catch (err) {
    console.error("Error guardando log:", err.message);
  }
};

const registrarAlerta = async (req, res) => {
  const { id_tipo_alerta, id_registro, id_medico, fecha_alerta } = req.body;

  if (!id_tipo_alerta || !id_registro || !id_medico || !fecha_alerta) {
    return response(res, 'error', 400, 'Todos los campos son requeridos para registrar la alerta');
  }

  try {
    // 1️⃣ Insertar alerta
    const { data, error } = await supabase
      .from('alertas')
      .insert([
        {
          id_tipo_alerta,
          id_registro,
          id_medico,
          fecha_alerta
        }
      ])
      .select();

    if (error) throw error;

    const alertaInsertada = data[0];

    // 2️⃣ RESPONDER PRIMERO (CLAVE)
    response(
      res,
      'success',
      201,
      'Alerta registrada y correo enviado correctamente al médico',
      alertaInsertada
    );

    // ================= LOG ASINCRONO =================
    setImmediate(() => {
      const logApp = {
        id_usuario: id_medico,
        modulo: "alertas",
        entidad: "alerta",
        accion: "CREATE",
        id_registro: alertaInsertada.id_registro,

        descripcion:
          id_tipo_alerta === 1
            ? "Alerta de hipoglucemia generada"
            : "Alerta de hiperglucemia generada",

        endpoint: req.originalUrl,
        metodo: req.method,
        codigo_http: 201,

        ip_origen: req.ip,
        user_agent: req.headers["user-agent"],
        fecha: new Date()
      };

      const logDetalles = [
        {
          tipo: "REFERENCIA",
          campo: "id_tipo_alerta",
          valor_entrante: id_tipo_alerta
        },
        {
          tipo: "REFERENCIA",
          campo: "id_registro",
          valor_entrante: id_registro
        }
      ];

      guardarLogCompleto(logApp, logDetalles);
    });

    // ================= PROCESO DE CORREO (también async si quieres optimizar más) =================
    // ⚠️ OPCIONAL: también podrías mover TODO esto a setImmediate si quieres ultra performance

    // Obtener registro de glucosa
    const { data: registro } = await supabase
      .from("registro_glucosa")
      .select("id_paciente, nivel_glucosa, fecha, hora, observaciones")
      .eq("id_registro", id_registro)
      .single();

    if (!registro) throw new Error("Registro de glucosa no encontrado");

    const { data: paciente } = await supabase
      .from("paciente")
      .select("id_usuario, id_medico")
      .eq("id_paciente", registro.id_paciente)
      .single();

    const { data: medico } = await supabase
      .from("medico")
      .select("id_usuario")
      .eq("id_medico", paciente.id_medico)
      .single();

    const { data: usuarioMedico } = await supabase
      .from("usuario")
      .select("correo, nombre_completo")
      .eq("id_usuario", medico.id_usuario)
      .single();

    const { data: usuarioPaciente } = await supabase
      .from("usuario")
      .select("nombre_completo")
      .eq("id_usuario", paciente.id_usuario)
      .single();

    const datosCorreo = {
      nombrePaciente: usuarioPaciente.nombre_completo,
      valor: registro.nivel_glucosa,
      fecha: registro.fecha,
      hora: registro.hora,
      nombreMedico: usuarioMedico.nombre_completo,
      observaciones: registro.observaciones
    };

    const template =
      id_tipo_alerta === 1
        ? getHipoTemplate(datosCorreo)
        : getHiperTemplate(datosCorreo);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    await transporter.sendMail({
      from: `"GlucoTracker" <${process.env.EMAIL_USER}>`,
      to: usuarioMedico.correo,
      subject: template.subject,
      html: template.html
    });

  } catch (err) {
    console.error('Error al insertar alerta o enviar correo:', err.message);

    return response(
      res,
      'error',
      500,
      'Ocurrió un error interno al registrar la alerta o procesar la notificación',
      err.message
    );
  }
};

module.exports = { datosParaGlucosa ,registrarAlerta };
