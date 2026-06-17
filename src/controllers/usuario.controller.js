const bcrypt = require('bcrypt');
const supabase = require('../../database');
const crypto =require("crypto");
const { sendEmail } = require('../email/sendEmail');

const response = (res, status, code, message, data = null) => {
  return res.status(code).json({ status, code, message, data });
};

function generarContrasenaTemporal(longitud = 12) {
  const mayus = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const minus = 'abcdefghijklmnopqrstuvwxyz';
  const nums = '0123456789';
  const especiales = '!@#$%^&*()_+|;:,.?';

  const todos = mayus + minus + nums + especiales;

  // Asegurar al menos uno de cada tipo
  let contrasena = [
    mayus[Math.floor(Math.random() * mayus.length)],
    minus[Math.floor(Math.random() * minus.length)],
    nums[Math.floor(Math.random() * nums.length)],
    especiales[Math.floor(Math.random() * especiales.length)]
  ];

  const randomBytes = crypto.randomBytes(longitud);
  for (let i = contrasena.length; i < longitud; i++) {
    const index = randomBytes[i] % todos.length;
    contrasena.push(todos[index]);
  }

  return contrasena
    .sort(() => 0.5 - Math.random())
    .join('');
}

const listarUsuarios=async (req, res)=>{
    
    try{
        const {data,error}=await supabase
            .from('usuario')
            .select('*')
            .order('id_usuario',{ascending:true});
        if (error) {
            console.error('Error al obtener usuarios en Supabase:', error);
            throw error;
        }
        if (!data || data.length === 0) {
            return response(res, 'success', 200, 'No hay usuarios activos en el sistema', []);
        }
        const formateado= data.map(p=>{
            return{
                id_usuario:p.id_usuario,
                estado:p.estado,
                nombre_completo: p.nombre_completo,
                fecha_nac: p.fecha_nac, 
                telefono: p.teléfono,
                correo: p.correo,
                fecha_registro: p.fecha_registro,
                email_verificado: p.email_verificado
            }
        });
        return response(res, 'success', 200, 'Pacientes obtenidos correctamente', formateado);

    }catch(err){
        console.error('Error interno en listar usuarios:', err);
        return response(res, 'error', 500, 'Error del servidor al intentar obtener los usuarios', err.message);
    }
}

const eliminarUsuario = async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);

  if (isNaN(id_usuario)) {
    return response(res, 'error', 400, 'El ID de usuario proporcionado no es válido');
  }

  try {
    const { data, error } = await supabase
      .from('usuario')
      .update({ estado: false })
      .eq('id_usuario', id_usuario)
      .select('id_usuario, nombre_completo, estado')
      .single();

    if (error) {
      console.error('Error en Supabase (suspenderUsuario):', error.message);
      throw error;
    }

    if (!data) {
      return response(res, 'error', 404, 'No se encontró el usuario que intentas suspender');
    }

    return response(
      res, 
      'success', 
      200, 
      `El usuario ${data.nombre_completo} ha sido suspendido correctamente`, 
      data
    );

  } catch (err) {
    console.error('Error interno al suspender usuario:', err.message);
    return response(
      res, 
      'error', 
      500, 
      'Error interno del servidor al procesar la suspensión del usuario', 
      err.message
    );
  }
};

const reactivarUsuario = async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);

  if (isNaN(id_usuario)) {
    return response(res, 'error', 400, 'El ID de usuario proporcionado no es válido');
  }

  try {
    const { data, error } = await supabase
      .from('usuario')
      .update({ estado: true })
      .eq('id_usuario', id_usuario)
      .select('id_usuario, nombre_completo, estado,correo')
      .single();

    if (error) {
      console.error('Error en Supabase (activarUsuario):', error.message);
      throw error;
    }

    if (!data) {
      return response(res, 'error', 404, 'No se encontró el usuario que intentas activar');
    }

    return response(
      res, 
      'success', 
      200, 
      `La cuenta de ${data.correo} ha sido reactivada con éxito`, 
      data
    );

  } catch (err) {
    console.error('Error interno al activar usuario:', err.message);
    return response(
      res, 
      'error', 500, 
      'Error interno del servidor al procesar la activación del usuario', 
      err.message
    );
  }
};

const editarUsuario = async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);
  const { nombre_completo, teléfono } = req.body;

  if (isNaN(id_usuario)) {
    return response(res, 'error', 400, 'El ID de usuario no es válido');
  }

  // 🔒 Validaciones backend
  if (nombre_completo) {
    const regexNombre = /^[A-Za-zÁÉÍÓÚáéíóúñÑ\s]+$/;

    if (
      !regexNombre.test(nombre_completo) ||
      nombre_completo.trim().split(' ').length < 2
    ) {
      return response(res, 'error', 400, 'Nombre inválido: debe tener al menos 2 palabras y solo letras');
    }
  }

  if (teléfono) {
    if (!/^\d{8,}$/.test(teléfono)) {
      return response(res, 'error', 400, 'Teléfono inválido: solo números y mínimo 8 dígitos');
    }
  }

  try {
    // 🧠 Construir objeto dinámico (solo lo que venga)
    const updateData = {};

    if (nombre_completo !== undefined) {
      updateData.nombre_completo = nombre_completo;
    }

    if (teléfono !== undefined) {
      updateData.teléfono = teléfono; // ⚠️ revisa si en tu BD es teléfono o telefono
    }

    if (Object.keys(updateData).length === 0) {
      return response(res, 'error', 400, 'No se enviaron campos para actualizar');
    }

    const { data, error } = await supabase
      .from('usuario')
      .update(updateData)
      .eq('id_usuario', id_usuario)
      .select('id_usuario, nombre_completo, teléfono')
      .single();

    if (error) {
      console.error('Error en Supabase (editarUsuario):', error.message);
      throw error;
    }

    if (!data) {
      return response(res, 'error', 404, 'Usuario no encontrado');
    }

    return response(
      res,
      'success',
      200,
      'Usuario actualizado correctamente',
      data
    );

  } catch (err) {
    console.error('Error interno al editar usuario:', err.message);
    return response(
      res,
      'error',
      500,
      'Error del servidor al actualizar usuario',
      err.message
    );
  }
};




module.exports={listarUsuarios,eliminarUsuario,reactivarUsuario,editarUsuario}