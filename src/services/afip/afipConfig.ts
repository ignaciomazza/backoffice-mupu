// src/services/afip/afipConfig.ts

import Afip from "@afipsdk/afip.js";
import fs from "fs";
import path from "path";

// Si no existen las variables de entorno, se usan los defaults para testing.
const certPath = path.resolve(
  process.env.CERT ? process.env.CERT : "src/certs/test/certificate.pem",
);
const keyPath = path.resolve(
  process.env.KEY ? process.env.KEY : "src/certs/test/private.key",
);
const agencyCUIT = parseInt(process.env.AGENCY_CUIT || "0", 10);

if (!certPath || !keyPath || !agencyCUIT) {
  throw new Error("Faltan configuraciones en las variables de entorno.");
}

const afip = new Afip({
  CUIT: agencyCUIT,
  cert: fs.readFileSync(certPath, "utf8"),
  key: fs.readFileSync(keyPath, "utf8"),
  // access_token: process.env.ACCESS_TOKEN,
  production: false,
});

export default afip;
