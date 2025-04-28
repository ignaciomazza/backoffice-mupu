// src/services/afip/afipConfig.ts

import Afip from "@afipsdk/afip.js";
import fs from "fs";
import path from "path";

// 1) Validar que exista el CUIT
const agencyCUIT = parseInt(process.env.AGENCY_CUIT || "0", 10);
if (!agencyCUIT) {
  throw new Error("Falta AGENCY_CUIT en las variables de entorno.");
}

// 2) Cargar certificado (.crt)
let cert: string;
if (process.env.AFIP_CERT_BASE64) {
  // Producción: decodifica Base64
  cert = Buffer.from(process.env.AFIP_CERT_BASE64, "base64").toString("utf8");
} else {
  // Dev/test: lee desde filesystem
  const certPath = path.resolve(
    process.cwd(),
    process.env.CERT || "src/certs/test/certificate.pem",
  );
  if (!fs.existsSync(certPath)) {
    throw new Error(`Cert no encontrado en ruta: ${certPath}`);
  }
  cert = fs.readFileSync(certPath, "utf8");
}

// 3) Cargar clave privada (.key)
let key: string;
if (process.env.AFIP_KEY_BASE64) {
  // Producción: decodifica Base64
  key = Buffer.from(process.env.AFIP_KEY_BASE64, "base64").toString("utf8");
} else {
  // Dev/test: lee desde filesystem
  const keyPath = path.resolve(
    process.cwd(),
    process.env.KEY || "src/certs/test/private.key",
  );
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Key no encontrada en ruta: ${keyPath}`);
  }
  key = fs.readFileSync(keyPath, "utf8");
}

// 4) Inicializar SDK de AFIP
const afip = new Afip({
  CUIT: agencyCUIT,
  cert,
  key,
  access_token: process.env.ACCESS_TOKEN,
  production: process.env.AFIP_ENV === "production",
});

export default afip;
