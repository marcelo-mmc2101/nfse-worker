/**
 * Certificate management — loads PFX, extracts PEM key+cert, creates HTTPS agent
 */
import * as fs from "node:fs";
import * as https from "node:https";
import forge from "node-forge";

export interface TlsCredentials {
  cert: string; // PEM (client cert + chain)
  key: string;  // PEM
}

export interface CertInfo {
  cnpj: string | null;
  razaoSocial: string | null;
  expiresAt: Date;
  daysLeft: number;
}

export function loadCertFromBase64(pfxBase64: string, password: string): {
  credentials: TlsCredentials;
  info: CertInfo;
} {
  const pfxBuffer = Buffer.from(pfxBase64, "base64");
  const pfxBinary = pfxBuffer.toString("binary");

  const pfxAsn1 = forge.asn1.fromDer(pfxBinary);
  const p12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password);

  // Extract private key
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
  if (!keyBag || keyBag.length === 0 || !keyBag[0].key) {
    throw new Error("Certificado .pfx nao contem chave privada");
  }
  const privateKey = keyBag[0].key;

  // Extract certificate
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag];
  if (!certBag || certBag.length === 0 || !certBag[0].cert) {
    throw new Error("Certificado .pfx nao contem certificado X.509");
  }
  const cert = certBag[0].cert;

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(privateKey);

  // Chain (intermediate CAs)
  const chainPems: string[] = [];
  if (certBag.length > 1) {
    for (let i = 1; i < certBag.length; i++) {
      if (certBag[i].cert) {
        chainPems.push(forge.pki.certificateToPem(certBag[i].cert!));
      }
    }
  }

  // Parse CN for CNPJ
  const cn = cert.subject.getField("CN")?.value || "";
  let cnpj: string | null = null;
  let razaoSocial: string | null = null;
  const cnMatch = cn.match(/^(.+?):(\d{14})$/);
  if (cnMatch) {
    razaoSocial = cnMatch[1].trim();
    cnpj = cnMatch[2];
  }

  const notAfter = cert.validity.notAfter;
  const daysLeft = Math.floor((notAfter.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return {
    credentials: {
      cert: chainPems.length > 0 ? certPem + "\n" + chainPems.join("\n") : certPem,
      key: keyPem,
    },
    info: { cnpj, razaoSocial, expiresAt: notAfter, daysLeft },
  };
}

export function createHttpsAgent(creds: TlsCredentials): https.Agent {
  return new https.Agent({
    cert: creds.cert,
    key: creds.key,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
  });
}
