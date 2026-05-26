const supabase = require('../../database'); // tu cliente Supabase
const bcrypt = require('bcrypt');
const response = (res, status, code, message, data = null) => {
  return res.status(code).json({
    status,
    code,
    message,
    data
  });
};
/*
const registrarMedico = async (req, res) => {
  try {
    const { nombre_completo, correo, contrasena, telefono, fecha_nac, id_especialidad, departamento } = req.body;

    // 1️⃣ Validar archivos
    const pdfFiles = req.files?.matriculaProfesional;
    const imgFiles = req.files?.carnetProfesional;

    if (!pdfFiles || pdfFiles.length === 0) {
      return res.status(400).json({ error: "Archivo de matrícula faltante" });
    }
    if (!imgFiles || imgFiles.length === 0) {
      return res.status(400).json({ error: "Archivo de carnet faltante" });
    }

    const pdf = pdfFiles[0];
    const img = imgFiles[0];

    // 2️⃣ Subir archivos a Supabase
    const pdfUpload = await supabase.storage
      .from("Matriculas_PDF")
      .upload(`pdfs/${Date.now()}_${pdf.originalname}`, pdf.buffer, { contentType: pdf.mimetype });

    const imgUpload = await supabase.storage
      .from("Carnets_IMG")
      .upload(`imgs/${Date.now()}_${img.originalname}`, img.buffer, { contentType: img.mimetype });

    if (pdfUpload.error) throw pdfUpload.error;
    if (imgUpload.error) throw imgUpload.error;

    const pdfUrl = supabase.storage.from("Matriculas_PDF").getPublicUrl(pdfUpload.data.path).data.publicUrl;
    const imgUrl = supabase.storage.from("Carnets_IMG").getPublicUrl(imgUpload.data.path).data.publicUrl;

    // 3️⃣ Hashear contraseña
    const hashed_contrasena = await bcrypt.hash(contrasena, 10);
    const rol = 'medico';

    // 4️⃣ Insertar usuario
    const { data: usuarioData, error: usuarioError } = await supabase
      .from("usuario")
      .insert([{
        nombre_completo,
        correo,
        contrasena: hashed_contrasena,
        rol,
        "teléfono": telefono,
        fecha_nac
      }])
      .select();

    if (usuarioError) throw usuarioError;
    const usuario = usuarioData[0];

    // 5️⃣ Insertar médico
    const { data: medicoData, error: medicoError } = await supabase
      .from('medico')
      .insert([{
        id_usuario: usuario.id_usuario,
        id_especialidad,
        matricula_profesional: pdfUrl,
        departamento,
        carnet_profesional: imgUrl,
        administrador_id_admin: 1
      }])
      .select();

    if (medicoError) throw medicoError;

    res.status(200).json({ mensaje: "Médico registrado correctamente", usuario, medico: medicoData[0] });

  } catch (error) {
    console.error("❌ Error en registrarMedico:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { registrarMedico };

*/


const verMedicos = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medico')
      .select(`
        id_medico,
        usuario ( nombre_completo )
      `);

    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    console.error('Error al obtener médicos:', error.message);
    res.status(500).json({ error: 'Error al obtener médicos' });
  }
};



const perfilMedico = async (req, res) => {
  try {
    const idUsuario = parseInt(req.params.idUsuario);

    // 🔹 Validación básica de entrada
    if (isNaN(idUsuario)) {
      return response(res, 'error', 400, 'El ID de usuario proporcionado no es válido');
    }

    // 1️⃣ Consulta Relacional con Supabase
    // Traemos datos del médico, cruzamos con su usuario, y cruzamos con el administrador (y el usuario del admin)
    const { data: medicoData, error } = await supabase
      .from('medico')
      .select(`
        id_medico,
        matricula_profesional,
        departamento,
        carnet_profesional,
        usuario!inner (
          nombre_completo,
          fecha_nac,
          teléfono,
          correo
        ),
        administrador (
          usuario (
            nombre_completo
          )
        )
      `)
      .eq('id_usuario', idUsuario)
      .maybeSingle(); // 👈 Devuelve el objeto directo o null si no hay coincidencias

    if (error) {
      console.error('Error en consulta Supabase:', error.message);
      throw error;
    }

    // 2️⃣ Validación de existencia
    if (!medicoData) {
      return response(res, 'error', 404, 'No se encontró el médico en el sistema');
    }

    // 3️⃣ Transformación de los datos
    // Mapeamos el resultado para que mantenga exactamente las mismas llaves que devolvía tu SQL
    const perfilFormateado = {
      id: medicoData.id_medico,
      nombre: medicoData.usuario?.nombre_completo,
      fechaNac: medicoData.usuario?.fecha_nac,
      telefono: medicoData.usuario?.teléfono,
      correo: medicoData.usuario?.correo,
      matricula: medicoData.matricula_profesional,
      departamento: medicoData.departamento,
      carnet: medicoData.carnet_profesional,
      // Manejo seguro del COALESCE usando encadenamiento opcional
      admin: medicoData.administrador?.usuario?.nombre_completo || 'No' 
    };

    // 4️⃣ Respuesta Exitosa
    return response(res, 'success', 200, 'Perfil del médico obtenido correctamente', perfilFormateado);

  } catch (err) {
    console.error('Error interno en perfilMedico:', err.message);
    return response(res, 'error', 500, 'Error interno del servidor al procesar la solicitud');
  }
};

const formatearFecha = (fechaString) => {
  if (!fechaString) return null;
  // Extraemos año, mes y día de forma segura ignorando la zona horaria
  const [year, month, day] = fechaString.split('T')[0].split('-');
  return `${day}/${month}/${year}`;
};

const verPacientes = async (req, res) => {
  const { idMedico } = req.params;

  if (!idMedico || isNaN(idMedico)) {
    return response(res, 'error', 400, 'El ID del médico proporcionado no es válido');
  }

  try {
    // 1️⃣ CONSULTA RELACIONAL CON SUPABASE
    // Usamos '!inner' en usuario para forzar un INNER JOIN y filtrar solo pacientes activos
    const { data: pacientesBD, error } = await supabase
      .from('paciente')
      .select(`
        id_paciente, genero, peso, altura, numero_emergencia, nombre_emergencia, foto_perfil,
        usuario!inner ( id_usuario, nombre_completo, fecha_nac, teléfono, correo, estado ),
        nivel_actividad_fisica ( descripcion ),
        paciente_enfermedad ( enfermedades_base ( nombre_enfermedad ) ),
        tratamiento_enfermedad ( dosis, tratamientos ( nombre_tratamiento, descripcion ) ),
        registro_glucosa (
          id_registro, fecha, hora, nivel_glucosa, observaciones,
          momento_dia ( momento ),
          alertas (
            id_alerta, 
            tipo_alerta ( tipo ),
            retroalimentacion ( mensaje )
          )
        )
      `)
      .eq('id_medico', parseInt(idMedico))
      .eq('usuario.estado', true);

    if (error) throw error;

    if (!pacientesBD || pacientesBD.length === 0) {
      return response(res, 'success', 200, "El médico aún no tiene pacientes asignados.", []);
    }

    // 2️⃣ TRANSFORMACIÓN DE DATOS (Mapeo a la estructura exacta de tu SQL)
    const pacientesFormateados = pacientesBD.map((p) => {
      // Formatear Afecciones
      const afecciones = p.paciente_enfermedad ? p.paciente_enfermedad.map(pe => ({
        afeccion: pe.enfermedades_base?.nombre_enfermedad || null
      })) : [];

      // Formatear Tratamientos
      const tratamientos = p.tratamiento_enfermedad ? p.tratamiento_enfermedad.map(te => ({
        titulo: te.tratamientos?.nombre_tratamiento || null,
        desc: te.tratamientos?.descripcion || null,
        dosis: String(te.dosis)
      })) : [];

      // Procesar y agrupar Historial de Glucosa
      const historialMap = {};
      
      // Ordenamos los registros: primero por fecha (DESC), luego por hora (ASC)
      const registrosOrdenados = (p.registro_glucosa || []).sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha > b.fecha ? -1 : 1; 
        return a.hora < b.hora ? -1 : 1;
      });

      registrosOrdenados.forEach((reg) => {
        const fechaFormateada = formatearFecha(reg.fecha);
        
        if (!historialMap[fechaFormateada]) {
          historialMap[fechaFormateada] = { fecha: fechaFormateada, registros: [] };
        }

        // Estructurar alerta si existe
        let alertaObj = null;
        if (reg.alertas && reg.alertas.length > 0) {
          const alertaData = reg.alertas[0]; // Tomamos la primera alerta
          alertaObj = {
            nivel: alertaData.tipo_alerta?.tipo || null,
            observacion: reg.observaciones,
            // retroalimentacion es un arreglo al venir de una relación 1 a N
            mensaje: (alertaData.retroalimentacion && alertaData.retroalimentacion.length > 0) 
                     ? alertaData.retroalimentacion[0].mensaje 
                     : null 
          };
        }

        historialMap[fechaFormateada].registros.push({
          fecha: fechaFormateada,
          hora: reg.hora ? reg.hora.substring(0, 5) : null, // Cortamos a 'HH:MI'
          momento: reg.momento_dia?.momento || null,
          glucosa: String(reg.nivel_glucosa),
          alerta: alertaObj
        });
      });

      // Convertimos el objeto a un arreglo de objetos ordenado
      const historial = Object.values(historialMap);

      // 3️⃣ ESTRUCTURA DEL PACIENTE FINAL
      return {
        id: p.id_paciente,
        nombre: p.usuario.nombre_completo,
        ci: String(p.usuario.id_usuario),
        fechaNac: formatearFecha(p.usuario.fecha_nac),
        genero: p.genero,
        peso: String(p.peso),
        altura: String(p.altura),
        actividadFisica: p.nivel_actividad_fisica?.descripcion || null,
        telefono: p.usuario.teléfono,
        Correo: p.usuario.correo,
        numero_emergencia: p.numero_emergencia,
        nombre_emergencia: p.nombre_emergencia,
        foto_perfil: p.foto_perfil,
        afecciones: afecciones,
        tratamientos: tratamientos,
        historial: historial
      };
    });

    // Devolvemos la respuesta formateada y estandarizada
    return response(res, 'success', 200, "Pacientes obtenidos correctamente.", pacientesFormateados);

  } catch (err) {
    console.error("❌ Error en verPacientes:", err.message);
    return response(res, 'error', 500, "Error interno del servidor al procesar la lista de pacientes.");
  }
};

const alertasActivas = async (req, res) => {
  try {
    const idMedico = parseInt(req.params.idMedico);

    if (isNaN(idMedico)) {
      return response(res, 'error', 400, 'El ID del médico proporcionado no es válido');
    }

    // 1️⃣ Consulta Supabase replicando tu SQL exacto
    const { data: alertasBD, error } = await supabase
      .from('alertas')
      .select(`
        id_alerta,
        estado,
        fecha_alerta,
        tipo_alerta!inner ( tipo ),
        registro_glucosa!inner (
          id_registro,
          fecha,
          hora,
          nivel_glucosa,
          observaciones,
          momento_dia ( momento ),
          paciente!inner (
            id_paciente,
            id_medico,
            usuario!inner ( nombre_completo )
          )
        )
      `)
      .eq('estado', true) // a.estado = true
      // 🔥 AQUÍ ESTÁ TU LÓGICA: p.id_medico = 2
      .eq('registro_glucosa.paciente.id_medico', idMedico) 
      // 🔥 AQUÍ ESTÁ TU ORDEN: order by a.fecha_alerta desc
      .order('fecha_alerta', { ascending: false });

    if (error) {
      console.error('Error en consulta Supabase:', error.message);
      throw error;
    }

    if (!alertasBD || alertasBD.length === 0) {
      return response(res, 'success', 200, 'No hay alertas activas en este momento', []);
    }

    // 2️⃣ Mapeo para cumplir con tu interfaz de Angular
    const alertasFormateadas = alertasBD.map(alerta => ({
      id: alerta.id_alerta,
      nivel: alerta.tipo_alerta?.tipo || '',
      idpaciente: alerta.registro_glucosa.paciente.id_paciente,
      paciente: alerta.registro_glucosa.paciente.usuario.nombre_completo,
      fecha: alerta.fecha_alerta || alerta.registro_glucosa.fecha,
      hora: alerta.registro_glucosa.hora,
      glucosa: alerta.registro_glucosa.nivel_glucosa,
      momento: alerta.registro_glucosa.momento_dia?.momento || '',
      observaciones: alerta.registro_glucosa.observaciones || ''
    }));

    return response(res, 'success', 200, 'Alertas activas obtenidas correctamente', alertasFormateadas);

  } catch (err) {
    console.error('Error interno en alertasActivas:', err.message);
    return response(res, 'error', 500, 'Error interno del servidor al procesar las alertas');
  }
};

const alertasResueltas = async (req, res) => {
  try {
    const idMedico = parseInt(req.params.idMedico);

    if (isNaN(idMedico)) {
      return response(res, 'error', 400, 'El ID del médico proporcionado no es válido');
    }

    // 1️⃣ Consulta Supabase replicando tu lógica SQL (con estado = false)
    const { data: alertasBD, error } = await supabase
      .from('alertas')
      .select(`
        id_alerta,
        estado,
        fecha_alerta,
        tipo_alerta!inner ( tipo ),
        registro_glucosa!inner (
          id_registro,
          fecha,
          hora,
          nivel_glucosa,
          observaciones,
          momento_dia ( momento ),
          paciente!inner (
            id_paciente,
            id_medico,
            usuario!inner ( nombre_completo )
          )
        ),
        retroalimentacion ( mensaje ) 
      `)
      .eq('estado', false) // 🔥 Solo alertas resueltas
      .eq('registro_glucosa.paciente.id_medico', idMedico) // 🔥 Filtro corregido apuntando al paciente
      .order('fecha_alerta', { ascending: false }); // 🔥 Ordenamos de la más reciente a la más antigua

    if (error) {
      console.error('Error en consulta Supabase (alertasResueltas):', error.message);
      throw error;
    }

    if (!alertasBD || alertasBD.length === 0) {
      return response(res, 'success', 200, 'No hay alertas resueltas en el historial', []);
    }

    // 2️⃣ Mapeo para cumplir con tu interfaz de Angular
    const alertasFormateadas = alertasBD.map(alerta => ({
      id: alerta.id_alerta,
      nivel: alerta.tipo_alerta?.tipo || '',
      idpaciente: alerta.registro_glucosa.paciente.id_paciente,
      paciente: alerta.registro_glucosa.paciente.usuario.nombre_completo,
      fecha: alerta.fecha_alerta || alerta.registro_glucosa.fecha,
      hora: alerta.registro_glucosa.hora,
      glucosa: alerta.registro_glucosa.nivel_glucosa,
      momento: alerta.registro_glucosa.momento_dia?.momento || '',
      observaciones: alerta.registro_glucosa.observaciones || '',
      // Extraemos el mensaje de la retroalimentación (Supabase lo devuelve como arreglo)
      mensaje: (alerta.retroalimentacion && alerta.retroalimentacion.length > 0) 
               ? alerta.retroalimentacion[0].mensaje 
               : 'Sin mensaje'
    }));

    return response(res, 'success', 200, 'Historial de alertas resueltas obtenido correctamente', alertasFormateadas);

  } catch (err) {
    console.error('Error interno en alertasResueltas:', err.message);
    return response(res, 'error', 500, 'Error interno del servidor al procesar el historial de alertas');
  }
};

const retroalimentacionAlerta = async (req, res) => {
  const { id_medico, fecha_registro, mensaje, alertas_id_alerta } = req.body;

  if (!id_medico || !fecha_registro || !mensaje || !alertas_id_alerta) {
    await guardarLogCompleto(
      {
        id_usuario: null,
        modulo: 'alertas',
        entidad: 'alertas',
        accion: 'VALIDATION_ERROR',
        descripcion: 'Intento de resolver alerta con campos incompletos',
        endpoint: req.originalUrl,
        metodo: req.method,
        codigo_http: 400,
        ip_origen: req.ip,
        user_agent: req.headers['user-agent'],
        fecha: new Date()
      },
      [
        { tipo: "IDENTIFICADOR", campo: 'id_medico', valor_entrante: id_medico || 'FALTANTE' },
        { tipo: "IDENTIFICADOR", campo: 'id_alerta', valor_entrante: alertas_id_alerta || 'FALTANTE' }
      ]
    );

    return response(res, 'error', 400, 'Todos los campos son requeridos para resolver la alerta');
  }


  let id_usuario_real = null;

  try {

    const { data: medicoData, error: medicoError } = await supabase
      .from("medico")
      .select("id_usuario")
      .eq("id_medico", id_medico) 
      .single();

    if (medicoError || !medicoData) {
      console.warn("⚠️ No se pudo obtener id_usuario desde medico:", medicoError);
      throw medicoError || new Error("No se encontró el usuario del médico especificado");
    } else {
      id_usuario_real = medicoData.id_usuario;
    }

    const { data: retroData, error: retroError } = await supabase
      .from('retroalimentacion')
      .insert([ { id_medico, fecha_registro, mensaje, alertas_id_alerta } ])
      .select();

    if (retroError) throw retroError;

    const { data: alertaUpdate, error: alertaError } = await supabase
      .from('alertas')
      .update({ estado: false })
      .eq('id_alerta', alertas_id_alerta)
      .select();

    if (alertaError) throw alertaError;

   
    await guardarLogCompleto(
      {
        id_usuario: id_usuario_real,
        modulo: 'alertas',
        entidad: 'alertas',
        accion: 'UPDATE',
        descripcion: `Médico respondió y resolvió la alerta ${alertas_id_alerta}`,
        endpoint: req.originalUrl,
        metodo: req.method,
        codigo_http: 200,
        ip_origen: req.ip,
        user_agent: req.headers['user-agent'],
        fecha: new Date()
      },
      [
        { tipo: "IDENTIFICADOR", campo: 'id_alerta', valor_nuevo: alertas_id_alerta },
        { tipo: "IDENTIFICADOR", campo: 'id_medico', valor_nuevo: id_medico },
        { tipo: "VALOR", campo: 'mensaje', valor_nuevo: mensaje },
        { tipo: "VALOR", campo: 'estado', valor_nuevo: 'RESUELTA' }
      ]
    );

    return response(res, 'success', 200, 'Alerta respondida y actualizada correctamente', {
      retroalimentacion: retroData,
      alerta_actualizada: alertaUpdate
    });

  } catch (err) {
    console.error('Error al responder alerta:', err.message);

    await guardarLogCompleto(
      {
        id_usuario: id_usuario_real, 
        modulo: 'alertas',
        entidad: 'alertas',
        accion: 'ERROR_SERVER',
        descripcion: `Error interno al intentar resolver la alerta ${alertas_id_alerta}: ${err.message}`,
        endpoint: req.originalUrl,
        metodo: req.method,
        codigo_http: 500,
        ip_origen: req.ip,
        user_agent: req.headers['user-agent'],
        fecha: new Date()
      },
      [
        { tipo: "IDENTIFICADOR", campo: 'id_alerta', valor_entrante: alertas_id_alerta },
        { tipo: "IDENTIFICADOR", campo: 'id_medico', valor_entrante: id_medico },
        { tipo: "ERROR_DETALLE", campo: 'mensaje_error', valor_entrante: err.message },
        { tipo: "ERROR_DETALLE", campo: 'stack_trace', valor_entrante: err.stack || 'No disponible' }
      ]
    );

    return response(res, 'error', 500, 'Error interno del servidor al responder la alerta', err.message);
  }
};
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
    console.error("💥 Error guardando log:", err.message);
  }
};

const registrarGlucosaMedico = async (req, res) => {
  const {
    fecha,
    hora,
    id_medico,
    id_momento,
    id_paciente,
    nivel_glucosa,
    observaciones
  } = req.body;

  console.log("BODY RECIBIDO:", req.body);

  if (!fecha || !hora || !id_medico || !id_momento || !id_paciente || !nivel_glucosa) {
    console.error("VALIDACIÓN FALLIDA", {
      fecha,
      hora,
      id_medico,
      id_momento,
      id_paciente,
      nivel_glucosa
    });
    await guardarLogCompleto(
      {
        id_usuario: null,
        modulo: 'glucosa',
        entidad: 'glucosa',
        accion: 'VALIDATION_ERROR',
        descripcion: 'Intento de registrar glucosa con campos incompletos',
        endpoint: req.originalUrl,
        metodo: req.method,
        codigo_http: 400,
        ip_origen: req.ip,
        user_agent: req.headers['user-agent'],
        fecha: new Date()
      },
      [
       
      ]
    );
    return response(res, 'error', 400, "Todos los campos (menos observaciones) deben estar llenados");
  }

  try {
    console.log("🧪 TIPOS:", {
      id_medico: typeof id_medico,
      id_paciente: typeof id_paciente,
      id_momento: typeof id_momento,
      nivel_glucosa: typeof nivel_glucosa
    });

    const payload = {
      id_paciente: parseInt(id_paciente),
      id_medico: parseInt(id_medico),
      id_momento: parseInt(id_momento),
      fecha,
      hora,
      nivel_glucosa: parseFloat(nivel_glucosa),
      observaciones: observaciones || null
    };

    console.log("📤 PAYLOAD A INSERTAR:", payload);

    // ✅ INSERT REGISTRO
    const { data: glucosaData, error: glucosaError } = await supabase
      .from("registro_glucosa")
      .insert([payload])
      .select();

    if (glucosaError) {
      console.error("💥 ERROR SUPABASE:", glucosaError);
      throw glucosaError;
    }

    const registro_glucosa = glucosaData[0];

    console.log("✅ REGISTRO INSERTADO:", registro_glucosa);

    // 🔎 OBTENER id_usuario REAL DESDE medico
    let id_usuario_real = null;

    const { data: medicoData, error: medicoError } = await supabase
      .from("medico")
      .select("id_usuario")
      .eq("id_medico", payload.id_medico)
      .single();

    if (medicoError || !medicoData) {
      console.warn("⚠️ No se pudo obtener id_usuario desde medico:", medicoError);
    } else {
      id_usuario_real = medicoData.id_usuario;
    }

    // 🧾 LOG APLICACION
    const logApp = {
      id_usuario: id_usuario_real,

      modulo: 'glucosa',
      entidad: 'registro_glucosa',
      accion: 'CREATE',
      id_registro: registro_glucosa.id_registro,

      descripcion: 'Registro de glucosa creado',

      endpoint: req.originalUrl,
      metodo: req.method,
      codigo_http: 201,

      ip_origen: req.ip,
      user_agent: req.headers['user-agent'],
      fecha: new Date()
    };

    // 🧾 LOG DETALLE
    const logDetalles = [
      {
        tipo: 'VALOR',
        campo: 'nivel_glucosa',
        valor_anterior: null,
        valor_entrante: payload.nivel_glucosa
      }
    ];

    // 🚀 GUARDAR LOG SIN BLOQUEAR
    guardarLogCompleto(logApp, logDetalles);

    // ✅ RESPUESTA
    return response(
      res,
      'success',
      201,
      "Registro de glucosa insertado correctamente",
      {
        id_registro: registro_glucosa.id_registro,
        registro: registro_glucosa
      }
    );

  } catch (error) {
    console.error("💥 ERROR GENERAL:", {
      message: error.message,
      stack: error.stack
    });
    setImmediate(() => {
      const logApp = {
        id_usuario: id_usuario_real,

        modulo: "glucosa",
        entidad: "registro_glucosa",
        accion: "CREATE",
        id_registro: registro_glucosa.id_registro,

        descripcion: `Error interno al intentar registrar glucosa: ${err.message}`,

        endpoint: req.originalUrl,
        metodo: req.method,
        codigo_http: 500,

        ip_origen: req.ip,
        user_agent: req.headers["user-agent"],
        fecha: new Date()
      };

      const logDetalles = [
        {
         
        }
      ];

      guardarLogCompleto(logApp, logDetalles);
    });
    return response(
      res,
      'error',
      500,
      "Error interno del servidor al registrar la medición de glucosa",
      error.message
    );
  }
};

const actualizarMedico = async (req, res) => {
  const { id_medico } = req.params;
  const { telefono, correo, departamento } = req.body;
  const carnetFile = req.file;

  try {
    // 🚫 Bloquear cambio de correo
    if (correo !== undefined) {
      console.warn("⚠️ Intento de modificar correo bloqueado");
    }

    // 1️⃣ Obtener id_usuario
    const { data: medico, error: medicoFetchError } = await supabase
      .from('medico')
      .select('id_usuario')
      .eq('id_medico', id_medico)
      .single();

    if (medicoFetchError || !medico) {
      return response(res, 'error', 404, 'Médico no encontrado en el sistema');
    }

    const { id_usuario } = medico;


    const { data: usuarioAntes } = await supabase
      .from('usuario')
      .select('*')
      .eq('id_usuario', id_usuario)
      .single();

    const { data: medicoAntes } = await supabase
      .from('medico')
      .select('*')
      .eq('id_medico', id_medico)
      .single();


    const usuarioUpdates = {};
    if (telefono !== undefined) usuarioUpdates["teléfono"] = telefono;

    const medicoUpdates = {};
    if (departamento !== undefined) medicoUpdates.departamento = departamento;

    // ================== 📁 ARCHIVO ==================

    if (carnetFile) {
      // 🔒 Validar tipo
      if (!carnetFile.mimetype.startsWith("image/")) {
        return response(res, 'error', 400, 'El archivo debe ser una imagen');
      }

      // 🔒 Validar tamaño (2MB)
      if (carnetFile.size > 2 * 1024 * 1024) {
        return response(res, 'error', 400, 'La imagen no debe superar 2MB');
      }

      const extension = carnetFile.originalname.split('.').pop();
      const fileName = `carnet-${id_usuario}-${Date.now()}.${extension}`;

      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('Carnets_IMG')
        .upload(fileName, carnetFile.buffer, {
          contentType: carnetFile.mimetype,
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase
        .storage
        .from('Carnets_IMG')
        .getPublicUrl(uploadData.path);

      medicoUpdates.carnet_profesional = urlData.publicUrl;
    }

    // 🚫 Validar que haya algo que actualizar
    if (
      Object.keys(usuarioUpdates).length === 0 &&
      Object.keys(medicoUpdates).length === 0
    ) {
      return response(res, 'error', 400, 'No hay datos para actualizar');
    }


    if (Object.keys(usuarioUpdates).length > 0) {
      const { error: errorUsuario } = await supabase
        .from('usuario')
        .update(usuarioUpdates)
        .eq('id_usuario', id_usuario);

      if (errorUsuario) throw errorUsuario;
    }


    if (Object.keys(medicoUpdates).length > 0) {
      const { error: errorMedico } = await supabase
        .from('medico')
        .update(medicoUpdates)
        .eq('id_medico', id_medico);

      if (errorMedico) throw errorMedico;
    }


    const cambios = [];

    if (telefono !== undefined && usuarioAntes.teléfono !== telefono) {
      cambios.push({
        tipo: "CAMBIO",
        campo: "telefono",
        valor_anterior: usuarioAntes.teléfono,
        valor_entrante: telefono
      });
    }

    if (departamento !== undefined && medicoAntes.departamento !== departamento) {
      cambios.push({
        tipo: "CAMBIO",
        campo: "departamento",
        valor_anterior: medicoAntes.departamento,
        valor_entrante: departamento
      });
    }

    if (medicoUpdates.carnet_profesional) {
      cambios.push({
        tipo: "CAMBIO",
        campo: "carnet_profesional",
        valor_anterior: medicoAntes.carnet_profesional,
        valor_entrante: medicoUpdates.carnet_profesional
      });
    }


    if (cambios.length > 0) {
      const logApp = {
        id_usuario,
        modulo: "medico",
        entidad: "perfil",
        accion: "UPDATE",
        id_registro: null,
        descripcion: "Actualización de datos del médico",
        endpoint: req.originalUrl,
        metodo: req.method,
        codigo_http: 200,
        ip_origen: req.ip,
        user_agent: req.headers["user-agent"],
        fecha: new Date()
      };

      guardarLogCompleto(logApp, cambios);
    } else {
      console.log("ℹ️ No hubo cambios, no se genera log");
    }

    // ================== ✅ RESPUESTA ==================

    return response(res, 'success', 200, 'Datos actualizados correctamente', {
      id_medico,
      actualizado_usuario: Object.keys(usuarioUpdates).length > 0,
      actualizado_perfil: Object.keys(medicoUpdates).length > 0,
      cambios_realizados: cambios.length,
      nueva_url_carnet: medicoUpdates.carnet_profesional || null
    });

  } catch (error) {
    console.error('💥 Error en actualizarMedico:', error);

    return response(
      res,
      'error',
      500,
      'Error al actualizar los datos del médico',
      error.message
    );
  }
};
// ✅ export correcto
module.exports = {
  verMedicos,
  perfilMedico,
  verPacientes,
  alertasActivas,
  alertasResueltas,
  retroalimentacionAlerta,
  registrarGlucosaMedico,
  actualizarMedico
};
