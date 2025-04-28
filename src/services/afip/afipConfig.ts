// src/services/afip/afipConfig.ts
import Afip from "@afipsdk/afip.js";
import fs from "fs";
import path from "path";

// Rutas absolutas basadas en el cwd del servidor
const certPath = process.env.CERT
  ? path.resolve(process.cwd(), process.env.CERT)
  : path.resolve(process.cwd(), "src/certs/test/certificate.pem");

const keyPath = process.env.KEY
  ? path.resolve(process.cwd(), process.env.KEY)
  : path.resolve(process.cwd(), "src/certs/test/private.key");

const agencyCUIT = parseInt(process.env.AGENCY_CUIT || "0", 10);

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath) || !agencyCUIT) {
  throw new Error(
    `Faltan configuraciones en las variables de entorno o no se encontraron los archivos de certificado.\n` +
      `Cert: ${certPath}\nKey: ${keyPath}\nCUIT: ${agencyCUIT}`,
  );
}

const afip = new Afip({
  CUIT: agencyCUIT,
  cert: fs.readFileSync(certPath, "utf8"),
  key: fs.readFileSync(keyPath, "utf8"),
  access_token: process.env.ACCESS_TOKEN,
  production: true,
});

export default afip;
