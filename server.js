
const express = require('express');
const supabase = require('./database');
const bcrypt = require('bcrypt');
require('dotenv').config();
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const crypto = require('crypto');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });
app.use(express.json());
//Correccion de vulnerabilidad CSP POLITICAS DE CABECERA DE SEGURIDAD NO CONFIGURADAS: correcion de vulnerabilidad sobre que recursos puede cargar
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy",
    "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'; font-src 'none'; frame-ancestors 'none'; form-action 'none'");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
const { sendEmail } = require('./src/email/sendEmail');
const { getOtpTemplate } = require('./src/email/templates');
const { setOTP } = require("./otpCache")
const loginPrueba = require('./src/controllers/auth.controller')
//Correccion de vulnerabilidad CSP RIESGO MEDIO:  PARA QUE NINGUN DOMINIO PUEDA HACER PETICIONES A LA API ELIMINANDO EL ORIGIN *
app.use(cors({
  origin: ['http://localhost:4200', 'https://frontend-glucotracker-seguridad.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));



// // Endpoint POST para login
// app.post('/api/login', async (req, res) => {
//     const { correo, contrasena } = req.body;

//     const { data: usuarioData, error: usuarioError } = await supabase
//         .from("usuario")
//         .select("id_usuario, correo, contrasena, rol")
//         .eq("correo", correo)
//         .eq("estado", true);

//     if (usuarioError) throw usuarioError;

//     // VALIDACIÓN CORRECTA
//     if (!usuarioData || usuarioData.length === 0) {
//         return res.status(401).json({ error: `No se encontró ningún usuario con correo: ${correo}` });
//     }

//     const usuario = usuarioData[0];

//     const id_usuario = usuario.id_usuario;
//     const rol = usuario.rol;
//     let id_rol = 0;

//     if (rol === "administrador") {
//         const { data: adminData, error: adminError } = await supabase
//             .from("administrador")
//             .select("id_admin")
//             .eq("id_usuario", id_usuario)
//             .single();

//         if (adminError) throw adminError;
//         id_rol = adminData.id_admin;

//     } else if (rol === "medico") {
//         const { data: medicoData, error: medicoError } = await supabase
//             .from("medico")
//             .select("id_medico")
//             .eq("id_usuario", id_usuario)
//             .single();

//         if (medicoError) throw medicoError;
//         id_rol = medicoData.id_medico;

//     } else {
//         const { data: pacienteData, error: pacienteError } = await supabase
//             .from("paciente")
//             .select("id_paciente")
//             .eq("id_usuario", id_usuario)
//             .single();

//         if (pacienteError) throw pacienteError;
//         id_rol = pacienteData.id_paciente;
//     }

//     const isMatch = await bcrypt.compare(String(contrasena), usuario.contrasena);

//     if (!isMatch) {
//         return res.status(401).json({ error: 'Contraseña incorrecta' });
//     }

//     res.status(200).json({
//         message: "Credenciales correctas, login exitoso",
//         id_usuario: id_usuario,
//         id_rol: id_rol,
//         rol: rol
//     });
// });



const guardarLogSeguridad = async (logData) => {
  try {
    const { error } = await supabase
      .from('logs_seguridad')
      .insert([logData]);

    if (error) throw error;
  } catch (err) {
    console.error("💥 Error guardando log de seguridad:", err.message);
  }
};



const auditoriaEndpoint = require('./src/middlewares/auditoria.login');

const cookieParser = require('cookie-parser');
app.use(cookieParser());
const response = (res, status, code, message, data = null) => {
  return res.status(code).json({
    status,
    code,
    message,
    data
  });
};


app.post('/api/prueba/login', loginPrueba)
app.post('/api/login', auditoriaEndpoint(), async (req, res) => {
  const { correo, contrasena } = req.body;
  const MENSAJE_ERROR_AUTH = 'Correo o contraseña incorrectos';

  // 1️⃣ Validación preventiva
  if (!correo || !contrasena) {
    return response(res, 'error', 400, 'El correo y la contraseña son obligatorios');
  }

  try {
    // 2️⃣ Buscar usuario
    const { data: usuarioData, error: usuarioError } = await supabase
      .from("usuario")
      .select("id_usuario, correo, contrasena, rol, estado, intentos_fallidos, bloqueado_hasta, fecha_cambio_contrasena")
      .eq("correo", correo)
      .single();

    // 🔴 LOG: Si el correo no existe en la BD
    if ((usuarioError && usuarioError.code === 'PGRST116') || !usuarioData) {
      console.log(`[LOGIN FALLIDO] Correo inexistente: ${correo}`);
      
      await guardarLogSeguridad({
        id_usuario: null,
        evento: 'LOGIN_FALLIDO',
        descripcion: 'Intento de login con correo inexistente',
        email_intento: correo,
        ip_origen: req.ip,
        user_agent: req.headers['user-agent'],
        exito: false
      });

      return response(res, 'error', 401, MENSAJE_ERROR_AUTH);
    }

    if (usuarioError) throw usuarioError;
    const usuario = usuarioData;

    // 3️⃣ Verificar si la cuenta general está inactiva o bloqueada
    if (usuario.estado === false) {
      let descripcionInactividad = 'Intento de login en cuenta inactiva';
      
      if (usuario.intentos_fallidos >= 3) {
        descripcionInactividad = 'Intento de login rechazado: cuenta bloqueada por múltiples intentos fallidos.';
        console.log(`[LOGIN RECHAZADO] Cuenta bloqueada por intentos: ${correo}`);
      } else {
        console.log(`[LOGIN RECHAZADO] Cuenta inactiva: ${correo}`);
      }

      await guardarLogSeguridad({
        id_usuario: usuario.id_usuario,
        evento: 'LOGIN_FALLIDO',
        descripcion: descripcionInactividad,
        email_intento: correo,
        ip_origen: req.ip,
        user_agent: req.headers['user-agent'],
        exito: false
      });

      if (usuario.intentos_fallidos >= 3) {
        return response(res, 'error', 403, 'Cuenta bloqueada por múltiples intentos fallidos.', { code: 'UNLOCK_REQUIRED', id_usuario: usuario.id_usuario });
      }
      return response(res, 'error', 403, 'Tu cuenta está inactiva. Por favor contacta a soporte.');
    }

    // 4️⃣ Verificar contraseña de forma segura
    const isMatch = await bcrypt.compare(String(contrasena), usuario.contrasena);

    if (!isMatch) {
      // 🔸 Incrementar intentos fallidos
      const nuevosIntentos = (usuario.intentos_fallidos || 0) + 1;
      let updateData = { intentos_fallidos: nuevosIntentos };
      
      let tipoEvento = 'LOGIN_FALLIDO';
      let descripcionEvento = `Contraseña incorrecta. Intento ${nuevosIntentos}/3.`;

      if (nuevosIntentos >= 3) {
        updateData.estado = false;
        const fechaDesbloqueo = new Date();
        fechaDesbloqueo.setFullYear(fechaDesbloqueo.getFullYear() + 100); 
        updateData.bloqueado_hasta = fechaDesbloqueo.toISOString();

        tipoEvento = 'CUENTA_BLOQUEADA';
        descripcionEvento = 'Cuenta bloqueada automáticamente por exceder límite de intentos fallidos (3).';
      }

      await supabase.from("usuario").update(updateData).eq("id_usuario", usuario.id_usuario);

      await guardarLogSeguridad({
        id_usuario: usuario.id_usuario,
        evento: tipoEvento,
        descripcion: descripcionEvento,
        email_intento: correo,
        ip_origen: req.ip,
        user_agent: req.headers['user-agent'],
        exito: false
      });

      const mensaje = nuevosIntentos >= 3 ? 'Cuenta bloqueada por múltiples intentos fallidos.' : MENSAJE_ERROR_AUTH;
      console.log(`[LOGIN FALLIDO] Intento ${nuevosIntentos} fallido para: ${correo}`);
      
      if (nuevosIntentos === 3) {
        return response(res, 'error', 401, mensaje, { code: 'CUENTA_BLOQUEADA' });
      }
      return response(res, 'error', 401, mensaje);
    }

    // --- HASTA AQUÍ LAS CREDENCIALES SON 100% CORRECTAS ---

    // 5️⃣ Reiniciar intentos fallidos tras éxito
    if (usuario.intentos_fallidos > 0) {
      await supabase.from("usuario").update({ intentos_fallidos: 0, bloqueado_hasta: null }).eq("id_usuario", usuario.id_usuario);
    }

    // 6️⃣ SIEMPRE VALIDAR EL ROL Y EL ESTADO ACTIVO EN `usuario_rol`
    // Buscamos el registro en la tabla pivote para este usuario
    const { data: usuarioRolData, error: usuarioRolError } = await supabase
      .from('usuario_rol')
      .select('activo, id_rol')
      .eq('id_usuario', usuario.id_usuario)
      .maybeSingle();

    if (usuarioRolError) throw usuarioRolError;

    // Si el usuario obligatoriamente debe tener un rol asignado en la tabla usuario_rol:
    if (!usuarioRolData) {
      return response(res, 'error', 403, 'El usuario no tiene un rol asignado en el sistema.');
    }

    // Cortamos el flujo INMEDIATAMENTE si el rol está marcado como inactivo o expirado
    if (usuarioRolData.activo === false) {
      console.log(`[LOGIN RECHAZADO] Rol inactivo/expirado para el usuario: ${correo}`);
      
      await guardarLogSeguridad({
        id_usuario: usuario.id_usuario,
        evento: 'LOGIN_FALLIDO',
        descripcion: `Intento de acceso rechazado: El rol asignado al usuario está inactivo o expirado.`,
        email_intento: correo,
        ip_origen: req.ip,
        user_agent: req.headers['user-agent'],
        exito: false
      });

      return response(res, 'error', 403, 'Tu acceso o rol en el sistema ha expirado o se encuentra inactivo.');
    }

    // 7️⃣ Verificar vigencia de contraseña (3 meses)
    const { data: historialData } = await supabase
      .from('historial_contrasena')
      .select('created_at')
      .eq('usuario_id_usuario', usuario.id_usuario)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let fechaCambio = usuario.fecha_cambio_contrasena;
    if (historialData && historialData.created_at) {
      fechaCambio = historialData.created_at;
    }

    if (fechaCambio) {
      const tresMesesAtras = new Date();
      tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);
      if (new Date(fechaCambio) < tresMesesAtras) {
        return res.status(403).json({
          error: 'Tu contraseña ha caducado (más de 3 meses). Por favor, actualízala.',
          code: 'PASSWORD_EXPIRED',
          data: { id_usuario: usuario.id_usuario }
        });
      }
    }

    // 8️⃣ Buscar el ID del Perfil del Usuario en su tabla respectiva
    const rolMap = {
      administrador: 'id_admin',
      soporte: 'id_admin',
      paciente: 'id_paciente',
      medico: 'id_medico',
      auditor: 'id_admin',
    };

    let tablaRol = usuario.rol ? usuario.rol.toLowerCase() : '';
    if (tablaRol === "soporte" || tablaRol.includes("auditor")) {
      tablaRol = "administrador"; 
    }
    if (tablaRol.includes("medico")) {
      tablaRol = "medico"; 
    }

    const columnaIdPerfil = rolMap[usuario.rol] || rolMap[tablaRol];

    if (!columnaIdPerfil) {
        throw new Error(`Rol desconocido o no mapeado: ${usuario.rol}`);
    }

    const { data: perfilData, error: perfilError } = await supabase
      .from(tablaRol)
      .select(columnaIdPerfil)
      .eq("id_usuario", usuario.id_usuario)
      .single();

    if (perfilError || !perfilData) {
      throw new Error(`Inconsistencia en BD: No se encontró registro en tabla '${tablaRol}' para usuario ${usuario.id_usuario}`);
    }

    const id_perfil_especifico = perfilData[columnaIdPerfil]; 

    // 9️⃣ Generar y enviar OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await setOTP(usuario.id_usuario, otp, 5 * 60 * 1000); 

    const { subject, html } = getOtpTemplate({
      nombreUsuario: usuario.correo,
      codigo: otp
    });

    await sendEmail(usuario.correo, subject, html);
    console.log(`[LOGIN EXITOSO] OTP enviado a: ${correo}`);

    // 🟢 LOG: Credenciales correctas y OTP enviado
    await guardarLogSeguridad({
      id_usuario: usuario.id_usuario,
      evento: 'LOGIN_CREDENCIALES_VALIDAS',
      descripcion: 'Credenciales validadas correctamente. Esperando validación OTP.',
      email_intento: correo,
      ip_origen: req.ip,
      user_agent: req.headers['user-agent'],
      exito: true
    });

    // 🔟 Respuesta final estandarizada
    return response(res, 'success', 200, 'Credenciales correctas. OTP enviado al correo.', {
      id_usuario: usuario.id_usuario,
      id_rol: id_perfil_especifico 
    });

  } catch (error) {
    console.error(`[ERROR CRÍTICO LOGIN] ${correo} - IP: ${req.ip} - Motivo:`, error.message);
    return response(res, 'error', 500, 'Ocurrió un error interno del servidor al procesar tu solicitud. Intenta nuevamente.');
  }
});

// Importación de la rama de seguridad (asegúrate de que la ruta sea correcta)
const { esContrasenaRobusta } = require('./src/utils/security');

app.put('/api/usuario/:id_usuario/password', async (req, res) => {
  const { id_usuario } = req.params;
  const { contrasena } = req.body;

  try {
    // 1️⃣ Obtener datos del usuario actual PRIMERO
    const { data: usuario, error: userError } = await supabase
      .from('usuario')
      .select('correo, contrasena')
      .eq('id_usuario', id_usuario)
      .single();

    if (userError || !usuario) {
      // 🔴 LOG: Usuario no encontrado
      await guardarLogSeguridad({
        id_usuario: id_usuario || null,
        evento: 'CAMBIO_CONTRASENA_FALLIDO',
        descripcion: 'Intento de cambio de contraseña para usuario inexistente.',
        email_intento: null,
        ip_origen: req.ip,
        user_agent: req.headers['user-agent'],
        exito: false
      });
      return response(res, 'error', 404, 'Usuario no encontrado en el sistema.');
    }

    const correo = usuario.correo;

    // 2️⃣ Validar robustez de la contraseña
    const validacion = esContrasenaRobusta(contrasena);
    if (!validacion.valida) {
      await guardarLogSeguridad({
        id_usuario: id_usuario,
        evento: 'CAMBIO_CONTRASENA_FALLIDO',
        descripcion: `Cambio rechazado por política de seguridad: ${validacion.mensaje}`,
        email_intento: correo,
        ip_origen: req.ip,
        user_agent: req.headers['user-agent'],
        exito: false
      });
      return response(res, 'error', 400, validacion.mensaje);
    }

    // 3️⃣ Revisar historial de contraseñas
    const { data: historial } = await supabase
      .from('historial_contrasena')
      .select('contrasena_hash')
      .eq('usuario_id_usuario', id_usuario);

    let hashUsado = false;

    if (historial && historial.length > 0) {
      for (let rec of historial) {
        if (await bcrypt.compare(String(contrasena), rec.contrasena_hash)) {
          hashUsado = true;
          break;
        }
      }
    }

    if (!hashUsado) {
      hashUsado = await bcrypt.compare(String(contrasena), usuario.contrasena);
    }

    if (hashUsado) {
      // 🔴 LOG: Fallo por reutilización de contraseña
      await guardarLogSeguridad({
        id_usuario: id_usuario,
        evento: 'CAMBIO_CONTRASENA_FALLIDO',
        descripcion: 'Cambio rechazado: la contraseña ya fue utilizada anteriormente.',
        email_intento: correo,
        ip_origen: req.ip,
        user_agent: req.headers['user-agent'],
        exito: false
      });
      return response(res, 'error', 400, 'La contraseña no puede ser igual a una utilizada anteriormente.');
    }

    // 4️⃣ Hashear la nueva contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);

    // 5️⃣ Guardar en historial
    await supabase.from('historial_contrasena').insert({
      usuario_id_usuario: id_usuario,
      contrasena_hash: hashedPassword
    });

    // 6️⃣ Actualizar usuario
    const { data, error } = await supabase
      .from('usuario')
      .update({
        contrasena: hashedPassword,
        fecha_cambio_contrasena: new Date().toISOString(),
        intentos_fallidos: 0,
        bloqueado_hasta: null
      })
      .eq('id_usuario', id_usuario)
      .select('id_usuario, nombre_completo, correo');

    if (error) throw error;

    // 🟢 LOG: Cambio de contraseña exitoso
    await guardarLogSeguridad({
      id_usuario: id_usuario,
      evento: 'CAMBIO_CONTRASENA_EXITOSO',
      descripcion: 'Contraseña actualizada correctamente desde el perfil. Se restablecieron los intentos fallidos si los hubiera.',
      email_intento: correo,
      ip_origen: req.ip,
      user_agent: req.headers['user-agent'],
      exito: true
    });

    return response(res, 'success', 200, 'Contraseña actualizada correctamente.', data[0]);

  } catch (err) {
    console.error('Error al actualizar contraseña:', err.message);
    
    // 🔴 LOG: Error interno del servidor
    const correoError = typeof usuario !== 'undefined' && usuario ? usuario.correo : null;
    await guardarLogSeguridad({
      id_usuario: id_usuario || null,
      evento: 'ERROR_CAMBIO_CONTRASENA',
      descripcion: `Error interno al intentar actualizar la contraseña: ${err.message}`,
      email_intento: correoError,
      ip_origen: req.ip,
      user_agent: req.headers['user-agent'],
      exito: false
    });

    return response(res, 'error', 500, 'Error interno del servidor al actualizar la contraseña.');
  }
});


const { getOTP, deleteOTP } = require('./otpCache');
const { generateToken } = require('./src/utils/auth');
app.post('/api/verify-otp', auditoriaEndpoint(), async (req, res) => {
  const { id_usuario, codigo } = req.body;

  try {
    // 1️⃣ Obtener usuario PRIMERO (para tener su correo disponible para los logs)
    const { data: usuario, error: usuarioError } = await supabase
      .from("usuario")
      .select("id_usuario, correo, rol")
      .eq("id_usuario", id_usuario)
      .single();

    if (usuarioError || !usuario) {
      // Si mandan un ID falso que ni existe
      return response(res, 'error', 404, 'Usuario no encontrado en el sistema');
    }

    // 2️⃣ Validar OTP
    const cachedOTP = getOTP(id_usuario);

    if (!cachedOTP || cachedOTP !== codigo) {
      // 🔴 LOG: Intento fallido de OTP (¡Ahora sí guardamos el correo!)
      await guardarLogSeguridad({
        id_usuario: usuario.id_usuario,
        evento: 'OTP_FALLIDO',
        descripcion: 'Código OTP incorrecto o expirado.',
        email_intento: usuario.correo, 
        ip_origen: req.ip,
        user_agent: req.headers['user-agent'],
        exito: false
      });

      return response(res, 'error', 401, 'Código incorrecto o expirado');
    }

    deleteOTP(id_usuario);

    // 3️⃣ Normalizar rol base
    if (usuario.rol == "soporte") {
      usuario.rol = "administrador";
    }
    if(usuario.rol.includes('medico')){
      usuario.rol='medico';
    }

    // 4️⃣ Configuración por rol
    const rolMap = {
      administrador: { tabla: "administrador", campos: ["id_admin", "cargo"] },
      medico: { tabla: "medico", campos: ["id_medico"] },
      paciente: { tabla: "paciente", campos: ["id_paciente"] }
    };

    const config = rolMap[usuario.rol];

    if (!config) {
      return response(res, 'error', 400, 'Rol de usuario inválido o no reconocido');
    }

    // 5️⃣ Obtener datos específicos del rol
    const { data: rolData, error: rolError } = await supabase
      .from(config.tabla)
      .select(config.campos.join(", "))
      .eq("id_usuario", id_usuario)
      .single();

    if (rolError || !rolData) {
      return response(res, 'error', 404, 'Información del perfil no encontrada');
    }

    // 6️⃣ Extraer id_rol y cargo
    let id_rol;
    let cargo = null;

    if (usuario.rol === "administrador") {
      id_rol = rolData.id_admin;
      cargo = rolData.cargo;
    } else if (usuario.rol === "medico") {
      id_rol = rolData.id_medico;
    } else {
      id_rol = rolData.id_paciente;
    }
    const { data: rolesData, error: rolesError } = await supabase
  .from("usuario_rol")
  .select(`
    id_rol,
    fecha_fin,
    activo,
    roles (
      nombre_rol
    )
  `)
  .eq("id_usuario", id_usuario)
  .eq("activo", true);


  if (!rolesData || rolesData.length === 0) {
  return response(res, 'error', 403, 'Usuario sin roles activos');
}

// 🔥 rol principal (no auditor)
const rolPrincipalObj = rolesData.find(r => 
  !r.roles.nombre_rol.toLowerCase().includes('auditor')
) || rolesData[0];

let nombreRol = rolPrincipalObj.roles.nombre_rol.toLowerCase();

// 🔥 detectar auditor
const auditorObj = rolesData.find(r =>
  r.roles.nombre_rol.toLowerCase().includes('auditor')
);

const esAuditor = !!auditorObj;
const fecha_fin = auditorObj?.fecha_fin || null;
    // 7️⃣ Obtener permisos
    const { data: permisosData, error: errorPermisos } = await supabase
      .from("rol_permiso")
      .select(`
        permiso!inner (
          nombre
        )
      `)
      .eq("id_rol", id_rol)
      .eq("activo", true);
      
    const permisos = permisosData?.map(p => p.permiso.nombre) || [];
    
    // 8️⃣ Generar JWT Token
    const token = generateToken({
      id_usuario: usuario.id_usuario,
      correo: usuario.correo,
      rol: usuario.rol,
      id_rol,
      permisos
    });

    // 9️⃣ Establecer Cookie de seguridad
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 5 * 60 * 60 * 1000 // 5 horas
    });

    // 🟢 LOG: Autenticación completa exitosa
    await guardarLogSeguridad({
      id_usuario: usuario.id_usuario,
      evento: 'LOGIN_EXITOSO',
      descripcion: 'Autenticación en dos pasos (OTP) completada. Sesión iniciada.',
      email_intento: usuario.correo, 
      ip_origen: req.ip,
      user_agent: req.headers['user-agent'],
      exito: true
    });

    // 🔟 Respuesta final estandarizada
    return response(res, 'success', 200, 'Autenticación exitosa', {
      usuario: {
        id_usuario: usuario.id_usuario,
        rol: nombreRol,
        id_rol,
        ...(cargo ? { cargo } : {}), // 👈 SOLO ADMIN
        permisos
      }
    });

  } catch (error) {
    console.error("Error en verify-otp:", error.message);
    
    // 🔴 LOG: Error de servidor (Aquí tampoco será null si falló después de consultar al usuario)
    // Extraemos el correo con encadenamiento opcional por si el error ocurrió antes de consultar el usuario
    const correoError = typeof usuario !== 'undefined' && usuario ? usuario.correo : null;

    await guardarLogSeguridad({
      id_usuario: id_usuario || null,
      evento: 'OTP_ERROR',
      descripcion: `Error interno al verificar OTP: ${error.message}`,
      email_intento: correoError,
      ip_origen: req.ip,
      user_agent: req.headers['user-agent'],
      exito: false
    });

    return response(res, 'error', 500, 'Error interno del servidor durante la verificación', error.message);
  }
});


app.put('/usuario/:id_usuario/password', async (req, res) => {
  const { id_usuario } = req.params;
  const { contrasena } = req.body;

  const validacion = esContrasenaRobusta(contrasena);
  if (!validacion.valida) {
    return res.status(400).json({ error: validacion.mensaje });
  }

  try {
    const { data: usuario, error: userError } = await supabase
      .from('usuario')
      .select('contrasena')
      .eq('id_usuario', id_usuario)
      .single();

    if (userError || !usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const { data: historial } = await supabase
      .from('historial_contrasena')
      .select('contrasena_hash')
      .eq('usuario_id_usuario', id_usuario);

    let hashUsado = false;
    if (historial && historial.length > 0) {
      for (let rec of historial) {
        if (await bcrypt.compare(String(contrasena), rec.contrasena_hash)) {
          hashUsado = true; break;
        }
      }
    }
    if (!hashUsado) {
      hashUsado = await bcrypt.compare(String(contrasena), usuario.contrasena);
    }

    if (hashUsado) {
      return res.status(400).json({ error: 'La contraseña no puede ser igual a una utilizada anteriormente.' });
    }

    // Hashear la nueva contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);

    await supabase.from('historial_contrasena').insert({
      usuario_id_usuario: id_usuario,
      contrasena_hash: hashedPassword
    });

    // Actualizar en Supabase
    const { data, error } = await supabase
      .from('usuario')
      .update({
        contrasena: hashedPassword,
        fecha_cambio_contrasena: new Date().toISOString(),
        intentos_fallidos: 0,
        bloqueado_hasta: null
      })
      .eq('id_usuario', id_usuario)
      .select('id_usuario, nombre_completo, correo');

    if (error) {
      throw error;
    }

    res.json({ message: 'Contraseña actualizada correctamente.', usuario: data[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});






const solicitudRoutes = require('./src/routes/solicitud.routes');
app.use('/api/solicitudes', solicitudRoutes);

const medicoRoutes = require('./src/routes/medico.routes');
app.use('/api/medicos', medicoRoutes);

const pacienteRoutes = require('./src/routes/pacientes.routes');
app.use('/api/pacientes', pacienteRoutes);

const adminRoutes = require('./src/routes/admin.routes');
app.use('/api/administradores', adminRoutes);

const registroRoutes = require('./src/routes/registro.routes');
app.use('/api/registro', registroRoutes);

const generalRoutes = require('./src/routes/general.routes');
app.use('/api/general', generalRoutes);

const pdfRoute = require('./src/routes/patientPDF.routes');
const { loginAuth } = require('./src/controllers/auth.controller');
const securityRoutes = require('./src/routes/security.routes');
app.use("/api", pdfRoute);
app.use("/api/seguridad", securityRoutes);

const usuarioRoutes=require('./src/routes/usuarios.routes');
app.use("/api/usuarios",usuarioRoutes);


// Manejador de rutas no encontradas (404) con headers de seguridad
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejador de errores global (500) con headers de seguridad
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});