const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const supabase = require('../../database');

const { sendEmail } = require('../email/sendEmail');
const { getVerificacionCorreoTemplate } = require('../email/templates');

const JWT_SECRET = process.env.JWT_SECRET;

// 🔹 Response estándar
const response = (res, status, code, message, data = null) => {
  return res.status(code).json({ status, code, message, data });
};

// 🔹 Generar token JWT para verificación
const generateTokenValidacionCorreo = (usuario) => {
  const payload = {
    id_usuario: usuario.id_usuario,
    correo: usuario.correo
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};


const solicitarRegistro = async (req, res) => {
  const { nombre, correo, contrasena, fechaNac, telefono } = req.body;

  if (!nombre || !correo || !contrasena || !fechaNac || !telefono) {
    return response(res, 'error', 400, 'Todos los campos son obligatorios');
  }

  try {
    const hashedPassword = await bcrypt.hash(contrasena, 10);

    const { data, error } = await supabase
      .from('usuario')
      .insert([{
        nombre_completo: nombre,
        correo: correo,
        contrasena: hashedPassword,
        fecha_nac: fechaNac,
        teléfono: telefono,
        estado: false,
        rol: 'pendiente',
        email_verificado: false
      }])
      .select();

    if (error) {
      if (error.code === '23505') {
        return response(res, 'error', 409, 'El correo ya está registrado');
      }
      throw error;
    }

    const usuario = data[0];

    const token = generateTokenValidacionCorreo(usuario);

    const { subject, html } = getVerificacionCorreoTemplate({
      nombreUsuario: nombre,
      token
    });

    // 🔥 Enviar correo
    await sendEmail(correo, subject, html);

    return response(
      res,
      'success',
      201,
      'Registro exitoso. Revisa tu correo para verificar tu cuenta.',
      { usuario_id: usuario.id_usuario }
    );

  } catch (error) {
    console.error('Error en solicitarRegistro:', error.message);
    return response(res, 'error', 500, 'Error interno del servidor', error.message);
  }
};


const verifyEmail = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return response(res, 'error', 400, 'Token requerido');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { id_usuario, correo } = decoded;

    const { data, error } = await supabase
      .from('usuario')
      .select('*')
      .eq('id_usuario', id_usuario)
      .eq('correo', correo)
      .single();

    if (error || !data) {
      return response(res, 'error', 404, 'Usuario no encontrado');
    }

    if (data.email_verificado) {
      return response(res, 'error', 400, 'El correo ya fue verificado');
    }

    // 🔥 Actualizar usuario
    const { error: updateError } = await supabase
      .from('usuario')
      .update({
        email_verificado: true,
      })
      .eq('id_usuario', id_usuario);

    if (updateError) throw updateError;

    return response(res, 'success', 200, 'Correo verificado correctamente');

  } catch (error) {
    console.error('Error en verifyEmail:', error.message);
    return response(res, 'error', 400, 'Token inválido o expirado');
  }
};

module.exports = {
  solicitarRegistro,
  verifyEmail
};