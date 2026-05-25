const supabase = require('../../database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../email/sendEmail');
const { getOtpTemplate, getRecuperacionTemplate, getDesbloqueoTemplate } = require('../email/templates');
const { setOTP, getOTP, deleteOTP } = require('../../otpCache');
const { esContrasenaRobusta } = require('../utils/security');

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

// 1. Solicitar recuperación de contraseña (envía OTP)
const solicitarRecuperacion = async (req, res) => {
    const { correo } = req.body;
    try {
        const { data: usuario, error } = await supabase
            .from("usuario")
            .select("id_usuario, correo")
            .eq("correo", correo)
            .single();

        if (error || !usuario) {
            // 🔴 LOG: Intento de recuperar contraseña de correo inexistente
            await guardarLogSeguridad({
                id_usuario: null,
                evento: 'SOLICITUD_RECUPERACION_CONTRASENA_FALLIDO',
                descripcion: 'Solicitud de recuperación para correo inexistente.',
                email_intento: correo,
                ip_origen: req.ip,
                user_agent: req.headers['user-agent'],
                exito: false
            });
            // Por simplicidad en este backend, devolvemos 404
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        setOTP(`recuperacion_${usuario.correo}`, otp, 10 * 60 * 1000); // 10 min

        const { subject, html } = getRecuperacionTemplate({
            nombreUsuario: usuario.correo,
            codigo: otp
        });

        await sendEmail(usuario.correo, `Recuperación de contraseña - ${subject}`, html);

        // 🟢 LOG: Solicitud de recuperación exitosa (OTP enviado)
        await guardarLogSeguridad({
            id_usuario: usuario.id_usuario,
            evento: 'SOLICITUD_RECUPERACION_CONTRASENA',
            descripcion: 'Solicitud de recuperación de contraseña. OTP enviado al correo.',
            email_intento: correo,
            ip_origen: req.ip,
            user_agent: req.headers['user-agent'],
            exito: true
        });

        res.status(200).json({ message: 'Correo de recuperación enviado.' });
    } catch (err) {
        console.error(err);
        await guardarLogSeguridad({
            id_usuario: null,
            evento: 'SOLICITUD_RECUPERACION_CONTRASENA_FALLIDO',
            descripcion: `Error interno al solicitar recuperación: ${err.message}`,
            email_intento: correo,
            ip_origen: req.ip,
            user_agent: req.headers['user-agent'],
            exito: false
        });
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// 1.5 Verificar código OTP y emitir JWT
const verificarCodigoRecuperacion = async (req, res) => {
    const { correo, codigo } = req.body;
    try {
        // Obtenemos el usuario primero para tener su ID para los logs
        const { data: usuario } = await supabase
            .from("usuario")
            .select("id_usuario, correo")
            .eq("correo", correo)
            .single();

        const id_usuario = usuario ? usuario.id_usuario : null;

        const cachedOTP = getOTP(`recuperacion_${correo}`);
        if (!cachedOTP || cachedOTP !== codigo) {
            // 🔴 LOG: OTP de recuperación inválido
            await guardarLogSeguridad({
                id_usuario: id_usuario,
                evento: 'RECUPERACION_CONTRASENA_OTP_FALLIDO',
                descripcion: 'Código OTP de recuperación inválido o expirado.',
                email_intento: correo,
                ip_origen: req.ip,
                user_agent: req.headers['user-agent'],
                exito: false
            });
            return res.status(400).json({ error: 'Código inválido o expirado.' });
        }

        // Eliminar OTP
        deleteOTP(`recuperacion_${correo}`);

        // Generar JWT temporal (15 min)
        const token = jwt.sign(
            { correo, tipo: 'recuperacion', id_usuario: id_usuario }, // Agregamos el id_usuario al payload
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        // 🟢 LOG: OTP verificado con éxito, Token de cambio emitido
        await guardarLogSeguridad({
            id_usuario: id_usuario,
            evento: 'RECUPERACION_CONTRASENA_OTP_EXITOSO',
            descripcion: 'Validación OTP de recuperación exitosa. Token temporal emitido.',
            email_intento: correo,
            ip_origen: req.ip,
            user_agent: req.headers['user-agent'],
            exito: true
        });

        res.status(200).json({ message: 'Código verificado exitosamente.', token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
// 2. Cambiar contraseña usando JWT temporal
const cambiarContrasena = async (req, res) => {
    const { nueva_contrasena } = req.body;
    
    // Obtener JWT del header
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Se requiere token de autorización.' });
    }

    let correo;
    let id_usuario_token;
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.tipo !== 'recuperacion') {
            return res.status(403).json({ error: 'Token inválido para esta operación.' });
        }
        correo = decoded.correo;
        id_usuario_token = decoded.id_usuario;
    } catch (error) {

        await guardarLogSeguridad({
            id_usuario: null, 
            evento: 'RECUPERACION_CONTRASENA_FALLIDO',
            descripcion: 'Intento de cambio de contraseña con JWT inválido o expirado.',
            email_intento: null, 
            ip_origen: req.ip,
            user_agent: req.headers['user-agent'],
            exito: false
        });
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }

    try {
        const { data: usuario, error: userError } = await supabase
            .from("usuario")
            .select("id_usuario, contrasena")
            .eq("correo", correo)
            .single();

        if (userError || !usuario) return res.status(404).json({ error: 'Usuario no encontrado' });


        const validacion = esContrasenaRobusta(nueva_contrasena);
        if (!validacion.valida) {
            await guardarLogSeguridad({
                id_usuario: usuario.id_usuario,
                evento: 'RECUPERACION_CONTRASENA_FALLIDO',
                descripcion: `Intento de cambio fallido: ${validacion.mensaje}`,
                email_intento: correo,
                ip_origen: req.ip,
                user_agent: req.headers['user-agent'],
                exito: false
            });
            return res.status(400).json({ error: validacion.mensaje });
        }

        // Verificar historial de contraseñas
        const { data: historial } = await supabase
            .from('historial_contrasena')
            .select('contrasena_hash')
            .eq('usuario_id_usuario', usuario.id_usuario);

        let hashUsado = false;
        if (historial && historial.length > 0) {
            for (let rec of historial) {
                const isMatch = await bcrypt.compare(String(nueva_contrasena), rec.contrasena_hash);
                if (isMatch) {
                    hashUsado = true;
                    break;
                }
            }
        }
        
        if (!hashUsado) {
           hashUsado = await bcrypt.compare(String(nueva_contrasena), usuario.contrasena);
        }

        if (hashUsado) {
             // 🔴 LOG: Fallo por usar contraseña antigua
             await guardarLogSeguridad({
                id_usuario: usuario.id_usuario,
                evento: 'RECUPERACION_CONTRASENA_FALLIDO',
                descripcion: 'Intento de cambio fallido: la contraseña ya fue utilizada anteriormente.',
                email_intento: correo,
                ip_origen: req.ip,
                user_agent: req.headers['user-agent'],
                exito: false
            });
            return res.status(400).json({ error: 'La nueva contraseña no puede ser igual a una utilizada anteriormente.' });
        }

        // Hashear y actualizar
        const hashedPassword = await bcrypt.hash(nueva_contrasena, 10);

        // Guardar en historial
        await supabase.from('historial_contrasena').insert({
            usuario_id_usuario: usuario.id_usuario,
            contrasena_hash: hashedPassword
        });

        // Actualizar usuario (y limpiar bloqueos)
        await supabase.from('usuario').update({
            contrasena: hashedPassword,
            fecha_cambio_contrasena: new Date().toISOString(),
            intentos_fallidos: 0,
            bloqueado_hasta: null
        }).eq('id_usuario', usuario.id_usuario);

        // 🟢 LOG: Cambio de contraseña exitoso
        await guardarLogSeguridad({
            id_usuario: usuario.id_usuario,
            evento: 'RECUPERACION_CONTRASENA_EXITOSO',
            descripcion: 'Contraseña cambiada exitosamente. Se restablecieron los intentos fallidos.',
            email_intento: correo,
            ip_origen: req.ip,
            user_agent: req.headers['user-agent'],
            exito: true
        });

        res.status(200).json({ message: 'Contraseña cambiada exitosamente.' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// 3. Solicitar desbloqueo de cuenta
const solicitarDesbloqueo = async (req, res) => {
    const { correo } = req.body;
    try {
        const { data: usuario, error } = await supabase
            .from("usuario")
            .select("id_usuario, correo, intentos_fallidos")
            .eq("correo", correo)
            .single();

        if (error || !usuario) {
            // 🔴 LOG: Intento de desbloqueo de correo inexistente
            await guardarLogSeguridad({
                id_usuario: null,
                evento: 'SOLICITUD_DESBLOQUEO_FALLIDO',
                descripcion: 'Solicitud de desbloqueo para correo inexistente.',
                email_intento: correo,
                ip_origen: req.ip,
                user_agent: req.headers['user-agent'],
                exito: false
            });
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        if (usuario.intentos_fallidos < 3) {
            // 🔴 LOG: Intento de desbloquear cuenta suspendida manualmente por un admin
            await guardarLogSeguridad({
                id_usuario: usuario.id_usuario,
                evento: 'SOLICITUD_DESBLOQUEO_FALLIDO',
                descripcion: 'Intento de desbloqueo rechazado. Cuenta suspendida administrativamente.',
                email_intento: correo,
                ip_origen: req.ip,
                user_agent: req.headers['user-agent'],
                exito: false
            });
            return res.status(403).json({ error: 'Tu cuenta ha sido suspendida por un administrador. Contacta a soporte para más información.' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        setOTP(`desbloqueo_${usuario.correo}`, otp, 15 * 60 * 1000); // 15 min

        const { subject, html } = getDesbloqueoTemplate({
            nombreUsuario: usuario.correo,
            codigo: otp
        });

        await sendEmail(usuario.correo, `Código para desbloquear cuenta - ${subject}`, html);

        // 🟢 LOG: Solicitud de desbloqueo exitosa (OTP enviado)
        await guardarLogSeguridad({
            id_usuario: usuario.id_usuario,
            evento: 'SOLICITUD_DESBLOQUEO',
            descripcion: 'Solicitud de desbloqueo generada. OTP enviado al correo.',
            email_intento: correo,
            ip_origen: req.ip,
            user_agent: req.headers['user-agent'],
            exito: true
        });

        res.status(200).json({ message: 'Código de desbloqueo enviado al correo.' });
    } catch (err) {
        console.error(err);
        
        // 🔴 LOG: Error interno
        await guardarLogSeguridad({
            id_usuario: null,
            evento: 'SOLICITUD_DESBLOQUEO_FALLIDO',
            descripcion: `Error interno al solicitar desbloqueo: ${err.message}`,
            email_intento: correo,
            ip_origen: req.ip,
            user_agent: req.headers['user-agent'],
            exito: false
        });
        
        res.status(500).json({ error: 'Error interno.' });
    }
};
const confirmarDesbloqueo = async (req, res) => {
    const { correo, codigo } = req.body;
    try {
        // 1️⃣ Obtener el usuario PRIMERO para poder registrar su ID si falla el OTP
        const { data: usuario } = await supabase
            .from("usuario")
            .select("id_usuario, correo")
            .eq("correo", correo)
            .single();
            
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // 2️⃣ Validar el código OTP
        const cachedOTP = getOTP(`desbloqueo_${correo}`);
        if (!cachedOTP || cachedOTP !== codigo) {
            // 🔴 LOG: Código inválido o expirado
            await guardarLogSeguridad({
                id_usuario: usuario.id_usuario,
                evento: 'DESBLOQUEO_OTP_FALLIDO',
                descripcion: 'Código de confirmación de desbloqueo inválido o expirado.',
                email_intento: correo,
                ip_origen: req.ip,
                user_agent: req.headers['user-agent'],
                exito: false
            });
            
            return res.status(400).json({ error: 'Código de desbloqueo inválido o expirado.' });
        }

        deleteOTP(`desbloqueo_${correo}`);

  
        await supabase.from('usuario').update({
            intentos_fallidos: 0,
            estado: true,
            bloqueado_hasta: null 
        }).eq('id_usuario', usuario.id_usuario);

        await guardarLogSeguridad({
            id_usuario: usuario.id_usuario,
            evento: 'CUENTA_DESBLOQUEADA',
            descripcion: 'Cuenta desbloqueada exitosamente mediante validación OTP.',
            email_intento: correo,
            ip_origen: req.ip,
            user_agent: req.headers['user-agent'],
            exito: true
        });

        res.status(200).json({ message: 'Cuenta desbloqueada exitosamente.' });
    } catch (err) {
        console.error(err);
        

        const correoError = typeof usuario !== 'undefined' && usuario ? usuario.correo : correo;
        await guardarLogSeguridad({
            id_usuario: null,
            evento: 'DESBLOQUEO_CUENTA_FALLIDO',
            descripcion: `Error interno al confirmar desbloqueo: ${err.message}`,
            email_intento: correoError,
            ip_origen: req.ip,
            user_agent: req.headers['user-agent'],
            exito: false
        });
        
        res.status(500).json({ error: 'Error interno.' });
    }
};




module.exports = {
    solicitarRecuperacion,
    verificarCodigoRecuperacion,
    cambiarContrasena,
    solicitarDesbloqueo,
    confirmarDesbloqueo
};
