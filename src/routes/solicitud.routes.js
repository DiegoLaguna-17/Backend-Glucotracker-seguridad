const express = require('express');
const router = express.Router();
const {solicitarRegistro,verifyEmail}=require('../controllers/solicitud.controller');

router.post('/solicitarRegistro',solicitarRegistro);
router.get('/verificarCorreo',verifyEmail);
module.exports=router;
