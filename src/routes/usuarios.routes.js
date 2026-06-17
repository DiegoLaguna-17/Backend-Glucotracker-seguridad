const express = require('express');
const router = express.Router();
const {listarUsuarios,eliminarUsuario,reactivarUsuario,editarUsuario}=require('../controllers/usuario.controller')
const verificarToken = require('../utils/verificarToken'); // La funcion para verificar un token
const {getPermisos}=require("../utils/getPermisos");
const verificarPermiso=require("../utils/verifcarPermisos")

router.get('/listar',verificarToken,getPermisos,verificarPermiso('VER_USUARIOS'),listarUsuarios);

router.delete('/eliminar/:id_usuario',verificarToken,getPermisos,verificarPermiso('ELIMINAR_USUARIOS'),eliminarUsuario);
router.patch('/reactivar/:id_usuario',verificarToken,getPermisos,verificarPermiso('REACTIVAR_USUARIOS'),reactivarUsuario);
router.patch('/editar/:id_usuario',verificarToken,getPermisos,verificarPermiso('EDITAR_USUARIOS'), editarUsuario);
module.exports=router;