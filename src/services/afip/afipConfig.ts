// src/services/afip/afipConfig.ts

import Afip from "@afipsdk/afip.js";
import fs from "fs";
import path from "path";

const certPath = path.resolve(
  process.env.CERT || "src/certs/test/certificate.pem"
);
const keyPath = path.resolve(
  `${process.env.KEY}` || "src/certs/test/private.key"
);
const agencyCUIT = parseInt(`${process.env.AGENCY_CUIT}` || "0");

if (!certPath || !keyPath || !agencyCUIT) {
  throw new Error("Faltan configuraciones en las variables de entorno.");
}

const afip = new Afip({
  CUIT: agencyCUIT,
  cert: fs.readFileSync(certPath, "utf8"),
  key: fs.readFileSync(keyPath, "utf8"),
  production: false,
});

export default afip;
