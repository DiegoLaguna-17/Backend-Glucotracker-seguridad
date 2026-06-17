const supabase = require('../../database'); // tu cliente Supabase
const bcrypt=require('bcrypt')
const {sendEmail}=require('../email/sendEmail')
const {getWelcomeAdminTemplate}=require('../email/templates')
const response = (res, status, code, message, data = null) => {
  return res.status(code).json({
    status,
    code,
    message,
    data
  });
};

const medicosCompletos= async (req, res) => {
  try {
    const { data: medicosBD, error } = await supabase
      .from('medico')
      .select(`
        id:id_medico,
        matricula:matricula_profesional,
        departamento,
        carnet:carnet_profesional,
        usuario!inner (
          id_usuario,
          nombre_completo,
          fecha_nac,
          telefono:teléfono,
          correo,
          estado
        ),
        administrador (
          usuario (
            nombre_completo
          )
        )
      `);

    if (error) {
      console.error('Error en consulta Supabase (medicosActivos):', error.message);
      throw error; // Lo mandamos al catch para un manejo unificado
    }

    // Si no hay médicos activos, devolvemos un arreglo vacío con éxito
    if (!medicosBD || medicosBD.length === 0) {
      return response(res, 'success', 200, 'No hay médicos activos en el sistema', []);
    }

    // Aplanamos el objeto para que coincida exactamente con tu interfaz del frontend
    const formateado = medicosBD.map(m => ({
      id: m.id,
      id_usuario:m.usuario?.id_usuario,
      estado:m.usuario?.estado,
      nombre: m.usuario?.nombre_completo,
      fechaNac: m.usuario?.fecha_nac,
      telefono: m.usuario?.telefono,
      correo: m.usuario?.correo,
      matricula: m.matricula,
      departamento: m.departamento,
      carnet: m.carnet,
      admitidoPor: m.administrador?.usuario?.nombre_completo
    }));

    // Respuesta exitosa estandarizada
    return response(res, 'success', 200, 'Lista de médicos activos obtenida correctamente', formateado);

  } catch (err) {
    console.error('Error interno en medicosActivos:', err.message);
    return response(res, 'error', 500, 'Error interno del servidor al procesar la lista de médicos', err.message);
  }
};
const medicosActivos = async (req, res) => {
  try {
    const { data: medicosBD, error } = await supabase
      .from('medico')
      .select(`
        id:id_medico,
        matricula:matricula_profesional,
        departamento,
        carnet:carnet_profesional,
        usuario!inner (
          nombre_completo,
          fecha_nac,
          telefono:teléfono,
          correo,
          estado
        ),
        administrador (
          usuario (
            nombre_completo
          )
        )
      `);

    if (error) {
      console.error('Error en consulta Supabase (medicosActivos):', error.message);
      throw error; // Lo mandamos al catch para un manejo unificado
    }

    // Si no hay médicos activos, devolvemos un arreglo vacío con éxito
    if (!medicosBD || medicosBD.length === 0) {
      return response(res, 'success', 200, 'No hay médicos activos en el sistema', []);
    }

    // Aplanamos el objeto para que coincida exactamente con tu interfaz del frontend
    const formateado = medicosBD.map(m => ({
      id: m.id,
      nombre: m.usuario?.nombre_completo,
      fechaNac: m.usuario?.fecha_nac,
      telefono: m.usuario?.telefono,
      correo: m.usuario?.correo,
      matricula: m.matricula,
      departamento: m.departamento,
      carnet: m.carnet,
      admitidoPor: m.administrador?.usuario?.nombre_completo
    }));

    // Respuesta exitosa estandarizada
    return response(res, 'success', 200, 'Lista de médicos activos obtenida correctamente', formateado);

  } catch (err) {
    console.error('Error interno en medicosActivos:', err.message);
    return response(res, 'error', 500, 'Error interno del servidor al procesar la lista de médicos', err.message);
  }
};
/*
const medicosSolicitantes = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medico')
      .select(`
        id:id_medico,
        matricula:matricula_profesional,
        departamento,
        carnet:carnet_profesional,
        usuario!inner (
          nombre:nombre_completo,
          fechaNac:fecha_nac,
          telefono:teléfono,
          correo,
          estado
        ),
        administrador (
          usuario (
            nombre:nombre_completo
          )
        )
      `)
      .eq('usuario.estado', false); // 👈 Filtramos por los que NO están activos

    if (error) {
      console.error('Error ejecutando consulta:', error);
      return res.status(400).json({ error: error.message });
    }

    // Aplanamos la estructura para que coincida con el retorno de tu función SQL
    const formateado = data.map(m => ({
      id: m.id,
      nombre: m.usuario?.nombre,
      fechaNac: m.usuario?.fechaNac,
      telefono: m.usuario?.telefono,
      correo: m.usuario?.correo,
      matricula: m.matricula,
      departamento: m.departamento,
      carnet: m.carnet,
      admitidoPor: m.administrador?.usuario?.nombre
    }));

    return res.status(200).json(formateado);

  } catch (err) {
    console.error('Error interno:', err);
    return res.status(500).json({ error: 'Error del servidor' });
  }
};*/
/*
const activarMedico = async (req, res) => {
  const idMedico = req.params.idMedico;
  const { idAdmin } = req.body;

  if (!idAdmin) {
    return res.status(400).json({ error: 'No hay administrador' });
  }
  console.log('BODY:', req.body);
console.log('PARAMS:', req.params);
  try {
    const { data: medicoData, error: medicoError } = await supabase
      .from('medico')
      .select('id_usuario')
      .eq('id_medico', idMedico)
      .single();

    if (medicoError || !medicoData) {
      return res.status(404).json({ error: 'Médico no encontrado' });
    }

    const idUsuario = medicoData.id_usuario;

    const { error: updateErrorMedico } = await supabase
      .from('medico')
      .update({
        administrador_id_admin: idAdmin
      })
      .eq('id_medico', idMedico);

    if (updateErrorMedico) {
      return res.status(400).json({ error: updateErrorMedico.message });
    }

    const { error: updateErrorUsuario } = await supabase
      .from('usuario')
      .update({ estado: true })
      .eq('id_usuario', idUsuario);

    if (updateErrorUsuario) {
      return res.status(400).json({ error: updateErrorUsuario.message });
    }

    res.json({ mensaje: 'Usuario activado correctamente' });

  } catch (err) {
    res.status(500).json({
      error: 'Error del servidor',
      detalles: err.message
    });
  }
};
*/
// controllers/pacientes.controller.js

const pacientesActivos = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('paciente')
      .select(`
        id:id_paciente,
        genero,
        peso,
        altura,
        foto_perfil,
        nombre_emergencia,
        numero_emergencia,
        usuario!inner (
          id_usuario,
          estado,
          nombre:nombre_completo,
          correo,
          fechaNac:fecha_nac,
          telefono:teléfono,
          estado
        ),
        nivel_actividad_fisica (
          descripcion
        ),
        medico (
          usuario (
            nombre_completo
          )
        ),
        administrador (
          usuario (
            nombre_completo
          )
        ),
        paciente_enfermedad (
          enfermedades_base (
            nombre_enfermedad
          )
        ),
        tratamiento_enfermedad (
          tratamientos (
            nombre_tratamiento,
            descripcion
          ),
          dosis
        )
      `)
      .eq('usuario.estado', true); // Filtra solo pacientes con usuario activo

    if (error) {
      console.error('Error al obtener pacientes en Supabase:', error);
      throw error;
    }

    // Si no hay datos, retornamos un arreglo vacío en lugar de un error
    if (!data || data.length === 0) {
      return response(res, 'success', 200, 'No hay pacientes activos en el sistema', []);
    }


    const formateado = data.map(p => {
      
     

      return {
        id: p.id,
        id_usuario:p.usuario?.id_usuario,
        estado:p.usuario?.estado,
        nombre: p.usuario?.nombre,
        ci: p.usuario?.correo, 
        fechaNac: p.usuario?.fechaNac, 
        genero: p.genero,
        peso: String(p.peso),
        altura: String(p.altura),
        actividadFisica: p.nivel_actividad_fisica?.descripcion,
        telefono: p.usuario?.telefono,
        correo: p.usuario?.correo,
        nombre_emergencia: p.nombre_emergencia,
        numero_emergencia: p.numero_emergencia,
        medico: p.medico?.usuario?.nombre_completo,
        foto_perfil: p.foto_perfil,
        afecciones: p.paciente_enfermedad?.map(pe => ({
          afeccion: pe.enfermedades_base?.nombre_enfermedad
        })) || [],
        tratamientos: p.tratamiento_enfermedad?.map(te => ({
          titulo: te.tratamientos?.nombre_tratamiento,
          desc: te.tratamientos?.descripcion,
          dosis: String(te.dosis)
        })) || [],
        admitidoPor: p.administrador?.usuario?.nombre_completo,
      };
    });

    // Retorno exitoso usando el formato estándar
    return response(res, 'success', 200, 'Pacientes obtenidos correctamente', formateado);

  } catch (err) {
    console.error('Error interno en pacientesActivos:', err);
    return response(res, 'error', 500, 'Error del servidor al intentar obtener los pacientes', err.message);
  }
};





const pacientesCompletos = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('paciente')
      .select(`
        id:id_paciente,
        genero,
        peso,
        altura,
        foto_perfil,
        nombre_emergencia,
        numero_emergencia,
        usuario!inner (
          id_usuario,
          estado,
          nombre:nombre_completo,
          correo,
          fechaNac:fecha_nac,
          telefono:teléfono,
          estado
        ),
        nivel_actividad_fisica (
          descripcion
        ),
        medico (
          usuario (
            nombre_completo
          )
        ),
        administrador (
          usuario (
            nombre_completo
          )
        ),
        paciente_enfermedad (
          enfermedades_base (
            nombre_enfermedad
          )
        ),
        tratamiento_enfermedad (
          tratamientos (
            nombre_tratamiento,
            descripcion
          ),
          dosis
        )
      `);

    if (error) {
      console.error('Error al obtener pacientes en Supabase:', error);
      throw error;
    }

    // Si no hay datos, retornamos un arreglo vacío en lugar de un error
    if (!data || data.length === 0) {
      return response(res, 'success', 200, 'No hay pacientes activos en el sistema', []);
    }


    const formateado = data.map(p => {
      
     

      return {
        id: p.id,
        id_usuario:p.usuario?.id_usuario,
        estado:p.usuario?.estado,
        nombre: p.usuario?.nombre,
        ci: p.usuario?.correo, 
        fechaNac: p.usuario?.fechaNac, 
        genero: p.genero,
        peso: String(p.peso),
        altura: String(p.altura),
        actividadFisica: p.nivel_actividad_fisica?.descripcion,
        telefono: p.usuario?.telefono,
        correo: p.usuario?.correo,
        nombre_emergencia: p.nombre_emergencia,
        numero_emergencia: p.numero_emergencia,
        medico: p.medico?.usuario?.nombre_completo,
        foto_perfil: p.foto_perfil,
        afecciones: p.paciente_enfermedad?.map(pe => ({
          afeccion: pe.enfermedades_base?.nombre_enfermedad
        })) || [],
        tratamientos: p.tratamiento_enfermedad?.map(te => ({
          titulo: te.tratamientos?.nombre_tratamiento,
          desc: te.tratamientos?.descripcion,
          dosis: String(te.dosis)
        })) || [],
        admitidoPor: p.administrador?.usuario?.nombre_completo,
      };
    });

    // Retorno exitoso usando el formato estándar
    return response(res, 'success', 200, 'Pacientes obtenidos correctamente', formateado);

  } catch (err) {
    console.error('Error interno en pacientesActivos:', err);
    return response(res, 'error', 500, 'Error del servidor al intentar obtener los pacientes', err.message);
  }
};

/*
const pacientesSolicitantes = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('paciente')
      .select(`
        id:id_paciente,
        genero,
        peso,
        altura,
        foto_perfil,
        nombre_emergencia,
        numero_emergencia,
        usuario!inner (
          nombre:nombre_completo,
          correo,
          fechaNac:fecha_nac,
          telefono:teléfono,
          estado
        ),
        nivel_actividad_fisica (
          descripcion
        ),
        medico (
          usuario (
            nombre_completo
          )
        ),
        administrador (
          usuario (
            nombre_completo
          )
        ),
        paciente_enfermedad (
          enfermedades_base (
            nombre_enfermedad
          )
        ),
        tratamiento_enfermedad (
          tratamientos (
            nombre_tratamiento,
            descripcion
          ),
          dosis
        )
      `)
      .eq('usuario.estado', false); // Filtra solo pacientes con usuario activo

    if (error) {
      console.error('Error al obtener pacientes:', error);
      return res.status(400).json({ error: error.message });
    }

    // Mapeo manual para limpiar la estructura y que quede idéntica a tu función SQL
    const formateado = data.map(p => ({
      id: p.id,
      nombre: p.usuario?.nombre,
      ci: p.usuario?.correo, // Según tu SQL usas correo como CI
      fechaNac: p.usuario?.fechaNac, 
      genero: p.genero,
      peso: String(p.peso),
      altura: String(p.altura),
      actividadFisica: p.nivel_actividad_fisica?.descripcion,
      telefono: p.usuario?.telefono,
      correo: p.usuario?.correo,
      nombre_emergencia: p.nombre_emergencia,
      numero_emergencia: p.numero_emergencia,
      medico: p.medico?.usuario?.nombre_completo,
      foto_perfil: p.foto_perfil,
      afecciones: p.paciente_enfermedad?.map(pe => ({
        afeccion: pe.enfermedades_base?.nombre_enfermedad
      })) || [],
      tratamientos: p.tratamiento_enfermedad?.map(te => ({
        titulo: te.tratamientos?.nombre_tratamiento,
        desc: te.tratamientos?.descripcion,
        dosis: String(te.dosis)
      })) || [],
      admitidoPor: p.administrador?.usuario?.nombre_completo
    }));

    return res.status(200).json(formateado);

  } catch (err) {
    console.error('Error interno:', err);
    return res.status(500).json({ error: 'Error del servidor' });
  }
};
*/

/*
const activarPaciente= async (req, res) => {
  const idPaciente = req.params.idPaciente;
    const { idAdmin } = req.body;
    if (!idAdmin) {
    return res.status(400).json({ error: 'No hay administrador' });
  }
  try {
    // 1. Obtener id_usuario desde medico
    const { data: pacienteData, error: pacienteError } = await supabase
      .from('paciente')
      .select('id_usuario')
      .eq('id_paciente', idPaciente)
      .single();

    if (pacienteError) {
      return res.status(400).json({ error: medicoError.message });
    }

    if (!pacienteData) {
      return res.status(404).json({ error: 'Medico no encontrado' });
    }

    const idUsuario = pacienteData.id_usuario;
    const { error: updateErrorPaciente } = await supabase
      .from('paciente')
      .update({
        administrador_id_admin: idAdmin
      })
      .eq('id_paciente', idPaciente);

    if (updateErrorPaciente) {
      return res.status(400).json({ error: updateErrorPaciente.message });
    }
    // 2. Actualizar estado del usuario
    const { data: updateData, error: updateError } = await supabase
      .from('usuario')
      .update({ estado: true })
      .eq('id_usuario', idUsuario);

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    res.json({ mensaje: 'Usuario activado correctamente', usuario: updateData });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor', detalles: err.message });
  }
};
*/

const perfilAdmin = async (req, res) => {
  try {
    const idUsuario = parseInt(req.params.idUsuario);

    // 1️⃣ Validación básica
    if (isNaN(idUsuario)) {
      return response(res, 'error', 400, 'El ID de usuario proporcionado no es válido');
    }

    // 2️⃣ Consulta Relacional con Supabase (Reemplazo del RPC)
    const { data: adminData, error } = await supabase
      .from('administrador')
      .select(`
        id_admin,
        cargo,
        fecha_ingreso,
        usuario!inner (
          nombre_completo,
          correo,
          fecha_nac,
          teléfono
        ),
        administrador ( 
          usuario ( nombre_completo ) 
        )
      `)
      .eq('id_usuario', idUsuario)
      .single();

    if (error) {
      console.error('Error en consulta Supabase (perfilAdmin):', error.message);
      // Supabase lanza 'PGRST116' si el .single() no encuentra registros
      if (error.code === 'PGRST116') {
        return response(res, 'error', 404, 'No se encontró el perfil del administrador');
      }
      throw error;
    }

    // 3️⃣ Formateo manual de fechas (Replicando to_char 'DD/MM/YYYY' de PostgreSQL)
    const formatearFecha = (fechaOriginal) => {
      if (!fechaOriginal) return null;
      const [year, month, day] = fechaOriginal.split('-');
      return `${day}/${month}/${year}`;
    };

    // 4️⃣ Construcción del objeto JSON final (Misma estructura de la tabla temporal SQL)
    const perfilFormateado = {
      id: adminData.id_admin,
      nombre: adminData.usuario?.nombre_completo,
      correo: adminData.usuario?.correo,
      fechaNac: formatearFecha(adminData.usuario?.fecha_nac),
      telefono: adminData.usuario?.teléfono,
      cargo: adminData.cargo,
      fechaIn: formatearFecha(adminData.fecha_ingreso),
      // COALESCE(ua.nombre_completo, 'No') replicado con el operador OR lógico
      admitidoPor: adminData.administrador?.usuario?.nombre_completo || 'No'
    };

    // 5️⃣ Respuesta exitosa estandarizada
    return response(res, 'success', 200, 'Perfil de administrador obtenido correctamente', perfilFormateado);

  } catch (err) {
    console.error('Error interno en perfilAdmin:', err.message);
    return response(res, 'error', 500, 'Error del servidor al intentar obtener el perfil del administrador');
  }
};


const agregarAdmin = async (req, res) => {
  const {
    nombre,
    correo,
    contrasena,
    fechaNacimiento,
    telefono,
    fecha_registro,
    administrador_id_admin
  } = req.body;

  // 1. Validación de campos obligatorios
  if (!nombre || !correo || !contrasena || !fechaNacimiento || !fecha_registro || !telefono || !administrador_id_admin) {
    return response(res, 'error', 400, 'Todos los campos deben ser llenados obligatoriamente');
  }

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);
    
    const cargoFijo = 'soporte';

    // 2. Inserción en la tabla 'usuario'
    const { data: usuarioData, error: usuarioError } = await supabase
      .from('usuario')
      .insert([
        {
          nombre_completo: nombre,
          correo: correo,
          contrasena: hashedPassword,
          rol: cargoFijo,
          fecha_nac: fechaNacimiento,
          teléfono: telefono,
          estado: true, // Activación inmediata
        },
      ])
      .select();

    if (usuarioError) throw usuarioError;
    const usuario_insertado = usuarioData[0];

    // 3. Inserción en la tabla 'administrador'
    const { data: adminData, error: adminError } = await supabase
      .from("administrador")
      .insert([
        {
          id_usuario: usuario_insertado.id_usuario,
          cargo: cargoFijo,
          fecha_ingreso: fecha_registro,
          administrador_id_admin: administrador_id_admin
        }
      ])
      .select();

    if (adminError) throw adminError;

    // 4. Asignación de Rol en RBAC
    const { data: rolData, error: rolError } = await supabase
      .from('roles')
      .select('id_rol')
      .ilike('nombre_rol', 'soporte')
      .single();

    if (rolError) throw new Error('No se encontró el rol de soporte en el catálogo del sistema.');

    const { error: usuRolError } = await supabase
      .from('usuario_rol')
      .upsert(
        [
          {
            id_usuario: usuario_insertado.id_usuario,
            id_rol: rolData.id_rol
          }
        ], 
        { onConflict: 'id_usuario,id_rol', ignoreDuplicates: true }
      );

    if (usuRolError) throw usuRolError;

    // ------------------------------------------------------------
    // 5. ENVÍO DE CORREO ELECTRÓNICO (Notificación de Credenciales)
    // ------------------------------------------------------------
    try {
      const template = getWelcomeAdminTemplate({
        nombreAdmin: nombre,
        correo: correo,
        contrasena: contrasena // Enviamos la contraseña plana original
      });

      await sendEmail(correo, template.subject, template.html);
    } catch (mailError) {
      // Logeamos el error del correo pero no detenemos la respuesta, 
      // ya que el admin ya fue creado en la base de datos.
      console.error("Error al enviar correo de bienvenida:", mailError.message);
    }

    // 6. Respuesta exitosa
    return response(res, 'success', 201, 'Personal de soporte registrado y correo enviado correctamente', {
      usuario: usuario_insertado,
      detalle_admin: adminData[0]
    });

  } catch (error) {
    console.error("Error en agregarAdmin: ", error.message);
    return response(res, 'error', 500, 'Error interno al registrar el administrador', error.message);
  }
};

const obtenerAdmins = async (req, res) => {
  try {
    // 1. Recibimos el código público desde la URL
    const { idAdmin } = req.params;

    if (!idAdmin) {
      return response(res, 'error', 400, 'El ID de administrador solicitante es requerido');
    }

    // 2. Ejecutamos 1 sola consulta emulando los JOINs
    const { data, error } = await supabase
      .from('administrador')
      .select(`
        id_admin,
        cargo,
        fecha_ingreso,
        usuario!inner (
          id_usuario,
          nombre_completo,
          correo,
          fecha_nac,
          teléfono,
          estado
        ),
        administrador (
          usuario (
            nombre_completo
          )
        )
      `)
      .neq('id_admin', 1)
      .neq('usuario.id_usuario', idAdmin);

    if (error) {
      console.error('Error en consulta Supabase (obtenerAdmins):', error.message);
      throw error; // Lo enviamos al catch
    }

    // Validación por si no hay más administradores
    if (!data || data.length === 0) {
      return response(res, 'success', 200, 'No hay otros administradores registrados en el sistema', []);
    }

    // 3. Mapeamos (aplanamos) los resultados para Angular
    const adminsFormateados = data.map((a) => {
      return {

        id_admin: a.id_admin,
        id_usuario: a.usuario?.id_usuario,
        nombre: a.usuario?.nombre_completo,
        correo: a.usuario?.correo,
        fechaNac: a.usuario?.fecha_nac,
        telefono: a.usuario?.teléfono,
        cargo: a.cargo,
        fechaIn: a.fecha_ingreso,
        // Optional Chaining (?.): Si 'administrador' o 'usuario' no existen, devuelve null automáticamente
        admitidoPor: a.administrador?.usuario?.nombre_completo || null,
        estado: a.usuario?.estado
      };
    });

    // 4. Devolvemos el JSON limpio en el formato estandarizado
    return response(res, 'success', 200, 'Lista de administradores obtenida correctamente', adminsFormateados);

  } catch (err) {
    console.error('Error interno en obtenerAdmins:', err.message);
    return response(res, 'error', 500, 'Error interno del servidor al procesar la solicitud', err.message);
  }
};
/*
const actualizarPermisosAdmins = async (req, res) => {
  try {
    const admins = req.body;

    for (const admin of admins) {
      const id_admin = admin.id;

      // 1. Obtener permisos actuales
      const { data: actuales, error } = await supabase
        .from('admin_permiso')
        .select('id_permiso')
        .eq('id_admin', id_admin);

      if (error) throw error;

      const actualesIds = actuales.map(p => p.id_permiso);

      // 2. Convertir permisos nuevos a IDs
      const nuevosIds = [];

      if (admin.permisos.editar) nuevosIds.push(1);
      if (admin.permisos.eliminar) nuevosIds.push(2);
      if (admin.permisos.ver) nuevosIds.push(3);
      if (admin.permisos.agregar) nuevosIds.push(4);

      // 3. Calcular diferencias
      const aInsertar = nuevosIds.filter(id => !actualesIds.includes(id));
      const aEliminar = actualesIds.filter(id => !nuevosIds.includes(id));

      // 4. Insertar nuevos
      if (aInsertar.length > 0) {
        const nuevosPermisos = aInsertar.map(id_permiso => ({
          id_admin,
          id_permiso
        }));

        await supabase
          .from('admin_permiso')
          .insert(nuevosPermisos);
      }

      // 5. Eliminar los que ya no están
      if (aEliminar.length > 0) {
        await supabase
          .from('admin_permiso')
          .delete()
          .eq('id_admin', id_admin)
          .in('id_permiso', aEliminar);
      }
    }

    res.json({ mensaje: 'Permisos actualizados inteligentemente ' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando permisos' });
  }
};*/

const obtenerRoles = async (req, res) => {
  try {
    const { data: roles, error } = await supabase
      .from("roles")
      .select("*")
      .eq('activo', true)
      .neq('nombre_rol','administrador')
      .neq('nombre_rol','pendiente');

    // ❌ error en la consulta
    if (error) {
      return response(res, "error", 500, "Error al consultar roles", null);
    }

    // ✅ éxito pero sin datos
    if (!roles || roles.length === 0) {
      return response(res, "success", 200, "No se encontraron roles", []);
    }

    // ✅ éxito con datos
    return response(res, "success", 200, "Roles obtenidos correctamente", roles);

  } catch (err) {
    console.error(err);
    return response(res, "error", 500, "Error interno del servidor", null);
  }
};



const insertarRoles = async (req, res) => {
  const { nombre_rol } = req.body;
  if (!nombre_rol) {
    return response(res, "error", 400, "El nombre del nuevo rol es requerido", null);
  }
  if (nombre_rol.length < 5) {
    return response(res, "error", 400, "El nombre del nuevo rol debe tener más de 4 caracteres", null);
  }
  try {
    const { data, error } = await supabase
      .from("roles")
      .insert([{ nombre_rol }])
      .select(); 
    if (error) {
      return response(res, "error", 500, "Error al insertar el rol", null);
    }
    return response(res, "success", 201, "Rol creado correctamente", data);
  } catch (err) {
    console.error(err);
    return response(res, "error", 500, "Error interno del servidor", null);
  }
};


/*

// controlador de permisos
const actualizarPermisosPacientes = async (req, res) => {
  try {
    const { correo, permisos_activos } = req.body;

    // Validación básica
    if (!correo || !Array.isArray(permisos_activos)) {
      return res.status(400).json({ error: 'Faltan datos o formato incorrecto' });
    }

    // 1. Buscar el id_usuario usando el correo estandarizado
    const { data: usuario, error: errUsu } = await supabase
      .from('usuario')
      .select('id_usuario')
      .eq('correo', correo)
      .single();

    if (errUsu || !usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const idUsuario = usuario.id_usuario;

    // 2. Buscar los IDs numéricos de los permisos enviados
    let permisosInsertar = [];
    
    if (permisos_activos.length > 0) {
      const { data: listaPermisos, error: errPerm } = await supabase
        .from('permiso')
        .select('id_permiso, nombre')
        .in('nombre', permisos_activos); // Busca todos los nombres de golpe

      if (errPerm) throw new Error('Error buscando el catálogo de permisos');

      // Armamos el arreglo listo para insertar en la tabla pivote
      permisosInsertar = listaPermisos.map(p => ({
        id_usuario: idUsuario,
        id_permiso: p.id_permiso
      }));
    }

    // 3. Borrar todos los permisos anteriores (Limpiar la pizarra)
    const { error: errDel } = await supabase
      .from('usuario_permiso')
      .delete()
      .eq('id_usuario', idUsuario);

    if (errDel) throw new Error('Error limpiando permisos anteriores');

    // 4. Insertar los nuevos permisos (si es que dejó alguno marcado)
    if (permisosInsertar.length > 0) {
      const { error: errIns } = await supabase
        .from('usuario_permiso')
        .insert(permisosInsertar);

      if (errIns) throw new Error('Error asignando los nuevos permisos');
    }

    // Respuesta de éxito
    return res.status(200).json({ mensaje: 'Permisos actualizados correctamente' });

  } catch (err) {
    console.error('Error al actualizar permisos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};*/

// FUNCIONIES PARA GESTIÓN DE LOS ROLES

const obtenerRolesPermisos = async (req, res) => {
  try {
    // 1. Obtenemos primero el catálogo maestro de todos los permisos del sistema
    const { data: todosLosPermisos, error: errP } = await supabase
  .from('permiso')
  .select('id_permiso, nombre')
  .gt('id_permiso', 4); // 👈 excluye 1–4
    if (errP) throw errP;

    // 2. Consultamos los roles (excluyendo administrador) y sus relaciones actuales
    const { data: rolesData, error: errR } = await supabase
      .from('roles')
      .select(`
        id_rol,
        nombre_rol,
        activo,
        rol_permiso (
          id_permiso,
          activo
        )
      `)
      .neq('nombre_rol', 'administrador')
      .neq('nombre_rol', 'pendiente')
      .order('id_rol', { ascending: true });

    if (errR) throw errR;

    // 3. Cruzamos los datos para devolver la matriz completa (true/false)
    const rolesFormateados = rolesData.map(rol => {
      
      const matrizPermisos = todosLosPermisos.map(p => {
        // Buscamos si existe el registro en la tabla puente rol_permiso
        const relacion = rol.rol_permiso.find(rp => rp.id_permiso === p.id_permiso);
        
        return {
          id_permiso: p.id_permiso,
          nombre: p.nombre,
          // Si el registro existe, usamos su valor real. Si no existe, es false por defecto.
          activo: relacion ? relacion.activo : false
        };
      });

      return {
        id_rol: rol.id_rol,
        nombre_rol: rol.nombre_rol,
        activo: rol.activo,
        permisos: matrizPermisos
      };
    });

    return res.status(200).json(rolesFormateados);

  } catch (error) {
    console.error('Error en obtenerRolesPermisos:', error);
    return res.status(500).json({ error: 'Error al cargar la matriz de accesos' });
  }
};

const actualizarMatrizRoles = async (req, res) => {
  try {
    const rolesModificados = req.body; // Recibe el arreglo de roles que tuvieron cambios

    if (!Array.isArray(rolesModificados) || rolesModificados.length === 0) {
      return res.status(400).json({ error: 'No se recibieron cambios válidos para actualizar' });
    }

    // 1. Aplanamos la estructura jerárquica para que encaje exacto con las columnas de tu BD
    const dataParaUpsert = [];

    rolesModificados.forEach(rol => {
      if (rol.permisos && Array.isArray(rol.permisos)) {
        rol.permisos.forEach(permiso => {
          dataParaUpsert.push({
            id_rol: rol.id_rol,
            id_permiso: permiso.id_permiso,
            activo: permiso.activo
          });
        });
      }
    });

    // Validamos que después de aplanar realmente haya datos
    if (dataParaUpsert.length === 0) {
      return res.status(400).json({ error: 'La estructura de permisos estaba vacía.' });
    }

    // 2. Ejecutamos el upsert masivo en Supabase.
    // Si la tupla (id_rol, id_permiso) ya existe, actualiza 'activo'. Si no, crea la fila.
    const { error } = await supabase
      .from('rol_permiso')
      .upsert(dataParaUpsert, { onConflict: 'id_rol, id_permiso' });

    if (error) {
      console.error('Error en Supabase guardando el delta de permisos:', error);
      throw error;
    }

    return res.status(200).json({ message: 'Matriz de accesos actualizada con éxito' });

  } catch (error) {
    console.error('Error en actualizarMatrizRoles:', error);
    return res.status(500).json({ error: 'Error interno al procesar la actualización' });
  }
};

const cambiarEstadoRol = async (req, res) => {
  try {
    const { id_rol } = req.params;

    // 1. Buscar el estado actual del rol
    const { data: rol, error: errBuscar } = await supabase
      .from('roles')
      .select('id_rol, nombre_rol, activo')
      .eq('id_rol', id_rol)
      .single();

    if (errBuscar || !rol) {
      return response(res, 'error', 404, 'Rol no encontrado', null);
    }
    
    // 2. Alternar el valor de activo (toggle)
    const nuevoEstado = !rol.activo;

    const { error: errUpdate } = await supabase
      .from('roles')
      .update({ activo: nuevoEstado })
      .eq('id_rol', id_rol);

    if (errUpdate) throw errUpdate;

    return response(
      res,
      'success',
      200,
      `Rol "${rol.nombre_rol}" ${nuevoEstado ? 'activado' : 'desactivado'} correctamente`,
      { id_rol: rol.id_rol, activo: nuevoEstado }
    );

  } catch (error) {
    console.error('Error en cambiarEstadoRol:', error);
    return response(res, 'error', 500, 'Error interno del servidor', null);
  }
};



const obtenerSolicitudesPendientes = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usuario')
      .select('id_usuario, nombre_completo, correo, telefono:teléfono, fecha_registro')
      .eq('estado', false)
      .eq('rol', 'pendiente')
      .eq('email_verificado',true)
      .order('fecha_registro', { ascending: false });

    if (error) {
      console.error('Error en Supabase obteniendo solicitudes:', error);
      throw error;
    }

    // Respuesta exitosa utilizando tu helper
    return response(
      res, 
      'success', 
      200, 
      'Solicitudes pendientes obtenidas correctamente', 
      data
    );

  } catch (error) {
    console.error('Error en obtenerSolicitudesPendientes:', error.message);
    
    // Respuesta de error utilizando tu helper
    return response(
      res, 
      'error', 
      500, 
      'Error interno del servidor al cargar las solicitudes'
    );
  }
};

const { v4: uuidv4 } = require('uuid'); // Para nombres de archivos únicos (opcional, o usa Date.now)

// Helper de respuestas que creamos antes


const activarCuenta = async (req, res) => {
  try {
    const { 
      id_usuario, 
      rol_seleccionado, 
      id_rol,
      fecha_fin,
      administrador_id_admin = 1
    } = req.body;

    if (!id_usuario || !rol_seleccionado || !id_rol) {
      return response(res, 'error', 400, 'Faltan datos críticos');
    }

    const idRolNum = Number(id_rol);
    const esPaciente = idRolNum === 3;
  const esAuditorPaciente = idRolNum === 6;
  const esMedico = idRolNum === 4;
  const esAuditorMedico=idRolNum===7;

    // Obtener rol desde BD
    const { data: rolDB, error: rolError } = await supabase
      .from('roles')
      .select('nombre_rol')
      .eq('id_rol', idRolNum)
      .single();

    if (rolError || !rolDB) {
      throw new Error('Rol no válido');
    }

    const nombreRol = rolDB.nombre_rol.toLowerCase();
    const esAuditor = nombreRol.includes('auditor');

    console.log('ROL:', nombreRol);
    console.log('ES AUDITOR:', esAuditor);
    console.log('FECHA FIN:', fecha_fin);

    // ==========================================
    // PACIENTE
    // ==========================================
    if (esPaciente || esAuditorPaciente){

      const { 
        id_medico, id_actividad, genero, peso, altura,
        enfermedad_id, tratamiento_id, dosis_,
        nombre_emergencia, numero_emergencia,
        embarazada, semanas
      } = req.body;

      const imgFiles = req.files?.foto_perfil;
      if (!imgFiles) {
        return response(res, 'error', 400, 'Falta foto de perfil');
      }

      const img = imgFiles[0];
      const path = `imgs/${Date.now()}_${img.originalname}`;

      const { error: uploadError } = await supabase.storage
        .from('perfiles_pacientes')
        .upload(path, img.buffer, { contentType: img.mimetype });

      if (uploadError) throw uploadError;

      const imgUrl = supabase.storage
        .from('perfiles_pacientes')
        .getPublicUrl(path).data.publicUrl;

      const { data: pacienteData, error: pacienteError } = await supabase
        .from('paciente')
        .insert([{
          id_usuario: parseInt(id_usuario),
          id_medico: parseInt(id_medico),
          id_nivel_actividad: parseInt(id_actividad),
          genero,
          peso: parseFloat(peso),
          altura: parseFloat(altura),
          embarazo: embarazada === 'true',
          nombre_emergencia,
          numero_emergencia,
          foto_perfil: imgUrl,
          administrador_id_admin: parseInt(administrador_id_admin)
        }])
        .select();

      if (pacienteError) throw pacienteError;

      const id_paciente = pacienteData[0].id_paciente;

      if (embarazada === 'true' && semanas) {
        await supabase.from('seguimiento_embarazo').insert({
          id_paciente,
          semanas_embarazo: parseInt(semanas)
        });
      }

      if (enfermedad_id && tratamiento_id) {
        await supabase.from('paciente_enfermedad').insert({
          id_paciente,
          id_enfermedad: parseInt(enfermedad_id)
        });

        await supabase.from('tratamiento_enfermedad').insert({
          id_paciente,
          id_tratamiento: parseInt(tratamiento_id),
          dosis: dosis_
        });
      }
    }

    // ==========================================
    // MEDICO
    // ==========================================
    else if (esMedico || esAuditorMedico) {

      const { id_especialidad, departamento } = req.body;

      const pdfFiles = req.files?.matriculaProfesional;
      const carnetFiles = req.files?.carnetProfesional;

      if (!pdfFiles || !carnetFiles) {
        return response(res, 'error', 400, 'Faltan documentos');
      }

      const pdfPath = `pdfs/${Date.now()}_${pdfFiles[0].originalname}`;
      const imgPath = `imgs/${Date.now()}_${carnetFiles[0].originalname}`;

      const { error: pdfError } = await supabase.storage
        .from('Matriculas_PDF')
        .upload(pdfPath, pdfFiles[0].buffer, { contentType: pdfFiles[0].mimetype });

      const { error: imgError } = await supabase.storage
        .from('Carnets_IMG')
        .upload(imgPath, carnetFiles[0].buffer, { contentType: carnetFiles[0].mimetype });

      if (pdfError || imgError) throw pdfError || imgError;

      const pdfUrl = supabase.storage.from('Matriculas_PDF').getPublicUrl(pdfPath).data.publicUrl;
      const imgUrl = supabase.storage.from('Carnets_IMG').getPublicUrl(imgPath).data.publicUrl;

      await supabase.from('medico').insert([{
        id_usuario: parseInt(id_usuario),
        id_especialidad: parseInt(id_especialidad),
        departamento,
        matricula_profesional: pdfUrl,
        carnet_profesional: imgUrl,
        administrador_id_admin: parseInt(administrador_id_admin)
      }]);
    }

    // ==========================================
    // ASIGNAR ROL (AQUÍ VA TODO EL TEMA AUDITOR)
    // ==========================================
    const { error: rolInsertError } = await supabase
      .from('usuario_rol')
      .upsert([{
        id_usuario: parseInt(id_usuario),
        id_rol: idRolNum,
        fecha_fin: esAuditor ? fecha_fin : null,
        activo: true
      }], { onConflict: 'id_usuario' });

    if (rolInsertError) throw rolInsertError;

    // ==========================================
    // ACTIVAR USUARIO
    // ==========================================
    const { error: updateError } = await supabase
      .from('usuario')
      .update({
        estado: true,
        rol: rol_seleccionado
      })
      .eq('id_usuario', parseInt(id_usuario));

    if (updateError) throw updateError;

    return response(
      res,
      'success',
      200,
      `Cuenta activada como ${esAuditor ? 'AUDITOR ' : ''}${rol_seleccionado.toUpperCase()}`
    );

  } catch (error) {
    console.error("❌ Error en activarCuenta:", error);
    return response(
      res,
      'error',
      500,
      'Error interno: ' + error.message
    );
  }
};

const suspenderUsuario = async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);

  // 1️⃣ Validación del ID
  if (isNaN(id_usuario)) {
    return response(res, 'error', 400, 'El ID de usuario proporcionado no es válido');
  }

  try {
    // 2️⃣ Ejecutar la actualización en Supabase
    const { data, error } = await supabase
      .from('usuario')
      .update({ estado: false })
      .eq('id_usuario', id_usuario)
      .select('id_usuario, nombre_completo, estado')
      .single();

    // 3️⃣ Manejo de errores de base de datos
    if (error) {
      console.error('Error en Supabase (suspenderUsuario):', error.message);
      throw error;
    }

    // 4️⃣ Verificar si el usuario existía
    if (!data) {
      return response(res, 'error', 404, 'No se encontró el usuario que intentas suspender');
    }

    // 5️⃣ Respuesta exitosa estandarizada
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

  // 1️⃣ Validación del ID
  if (isNaN(id_usuario)) {
    return response(res, 'error', 400, 'El ID de usuario proporcionado no es válido');
  }

  try {
    // 2️⃣ Ejecutar la actualización en Supabase
    const { data, error } = await supabase
      .from('usuario')
      .update({ estado: true })
      .eq('id_usuario', id_usuario)
      .select('id_usuario, nombre_completo, estado')
      .single();

    // 3️⃣ Manejo de errores de base de datos
    if (error) {
      console.error('Error en Supabase (activarUsuario):', error.message);
      throw error;
    }

    // 4️⃣ Verificar si el usuario existía
    if (!data) {
      return response(res, 'error', 404, 'No se encontró el usuario que intentas activar');
    }

    // 5️⃣ Respuesta exitosa estandarizada
    return response(
      res, 
      'success', 
      200, 
      `La cuenta de ${data.nombre_completo} ha sido reactivada con éxito`, 
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

const obtenerLogsAplicacion = async (req, res) => {
  try {
    // 1. Logs principales + JOIN con la tabla usuario
    const { data: logs, error: errorLogs } = await supabase
      .from('logs_aplicacion')
      // Traemos todo de logs y solo el correo de la tabla usuario relacionada
      .select('*, usuario(correo)') 
      .order('fecha', { ascending: false });

    if (errorLogs) {
      return res.status(500).json({
        success: false,
        message: 'Error obteniendo logs_aplicacion',
        error: errorLogs.message
      });
    }

    // 2. Detalles
    const { data: detalles, error: errorDetalles } = await supabase
      .from('logs_detalle')
      .select('*');

    if (errorDetalles) {
      return res.status(500).json({
        success: false,
        message: 'Error obteniendo logs_detalle',
        error: errorDetalles.message
      });
    }

    // 3. Agrupar detalles por log
    const detallesPorLog = detalles.reduce((acc, d) => {
      const idLog = d.id_log_aplicacion;

      if (!acc[idLog]) acc[idLog] = [];

      acc[idLog].push({
        tipo: d.tipo,
        campo: d.campo,
        valor_anterior: d.valor_anterior,
        valor_entrante: d.valor_entrante
      });

      return acc;
    }, {});

    // 4. Construir respuesta final
    const resultado = logs.map(l => ({
      id: l.id,
      // 🛑 CAMBIO: Extraemos el correo del objeto anidado que nos da Supabase
      // Si el id_usuario era null (por ejemplo, en un error de validación), dirá 'Sistema / No registrado'
      correo: l.usuario?.correo || 'Sistema / No registrado',
      modulo: l.modulo,
      entidad: l.entidad,
      accion: l.accion,
      id_registro: l.id_registro,
      descripcion: l.descripcion,
      endpoint: l.endpoint,
      metodo: l.metodo,
      codigo_http: l.codigo_http,
      ip_origen: l.ip_origen,
      user_agent: l.user_agent,
      fecha: l.fecha,
      detalles: detallesPorLog[l.id] || []
    }));

    return res.status(200).json({
      success: true,
      message: 'Logs de aplicación obtenidos correctamente',
      total: resultado.length,
      data: resultado
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};


const obtenerLogsSeguridad = async (req, res) => {
  try {
    // 1. Consultar logs_seguridad con JOIN a la tabla usuario
    const { data: logs, error } = await supabase
      .from('logs_seguridad')
      // Traemos todos los campos del log, y de la tabla usuario traemos nombre y rol
      .select('*, usuario(nombre_completo, rol)')
      .order('fecha', { ascending: false }); // Los más recientes primero

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Error en la base de datos al obtener los logs de seguridad.',
        error: error.message
      });
    }

    // 2. Mapear y limpiar los datos para el frontend
    const resultado = logs.map(log => {
      // Determinar el nombre del responsable (si no hay usuario, fue un usuario no identificado/anónimo)
      const nombre_usuario = log.usuario 
        ? log.usuario.nombre_completo 
        : 'Usuario no registrado';

      // Determinar el rol (si no hay usuario, lo marcamos como N/A)
      const rol_usuario = log.usuario 
        ? log.usuario.rol 
        : 'N/A';

      return {
        id: log.id,
        id_usuario: log.id_usuario,
        nombre_usuario: nombre_usuario,
        rol: rol_usuario,
        email_intento: log.email_intento || 'No capturado',
        evento: log.evento,
        descripcion: log.descripcion,
        ip_origen: log.ip_origen,
        user_agent: log.user_agent,
        exito: log.exito,
        fecha: log.fecha
      };
    });

    // 3. Respuesta estructurada (Idéntica al formato de logs de aplicación)
    return res.status(200).json({
      success: true,
      message: 'Logs de seguridad obtenidos correctamente',
      total: resultado.length,
      data: resultado
    });

  } catch (error) {
    console.error('Error interno al obtener logs de seguridad:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor.',
      error: error.message
    });
  }
};

const obtenerRolesTipo = async (req, res) => {
  const { tipo } = req.query; // medico | paciente

  try {
    let query = supabase.from('roles').select('*');

    if (tipo) {
      query = query.ilike('nombre_rol', `%${tipo}%`);
    }

    const { data, error } = await query;

    if (error) {
      return response(res, "error", 500, "Error al obtener roles", null);
    }

    return response(res, "success", 200, "Roles obtenidos", data);
  } catch (err) {
    console.error(err);
    return response(res, "error", 500, "Error interno", null);
  }
};


module.exports={medicosActivos,/*medicosSolicitantes,activarMedico,*/pacientesActivos, pacientesCompletos,/*pacientesSolicitantes,
  activarPaciente,*/perfilAdmin,agregarAdmin,obtenerAdmins, /*actualizarPermisosAdmins, */obtenerRoles,insertarRoles,
   /*actualizarPermisosPacientes,*/obtenerRolesPermisos,actualizarMatrizRoles,cambiarEstadoRol,obtenerSolicitudesPendientes,activarCuenta,
   suspenderUsuario,reactivarUsuario,medicosCompletos, obtenerLogsAplicacion,obtenerLogsSeguridad,obtenerRolesTipo};