const express = require("express");
const router = express.Router();
const { generatePatientPDF } = require("../pdf/makePatientPDF");

router.post("/paciente/pdf", async (req, res) => {
  try {
    const paciente = req.body;

    if (!paciente) {
      return res.status(400).json({ error: "Debes enviar el objeto paciente" });
    }

    const pdfBuffer = await generatePatientPDF(paciente);
    //correcion de vulnerabilidad de RUTA TRANSVERSAL RIESGO ALTO: VERIFICA QUE SI EL ID CONTIENE ALGO QUE NO SEA UN NUMERO LO CONVIERTE EN UN GUION BAJO PARA EVITAR QUE MANIPULEN EL SERVIDOR MODIFICANDO EL NOMBRE DE ARCHIVO PDF QUE SE DESCARGA
    const safeId = String(paciente.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=paciente_${safeId}.pdf`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generando PDF:", error);
    return res.status(500).json({ error: "Error generando PDF" });
  }
});

module.exports = router;
