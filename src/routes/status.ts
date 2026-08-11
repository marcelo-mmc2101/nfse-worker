import type { Request, Response } from "express";
import * as https from "node:https";
import { loadCertFromBase64, createHttpsAgent } from "../lib/cert.js";

export async function handleStatus(req: Request, res: Response) {
  try {
    const { certBase64, certPassword } = req.body;

    if (!certBase64 || !certPassword) {
      return res.status(400).json({ success: false, error: "Certificado nao informado" });
    }

    const { credentials, info } = loadCertFromBase64(certBase64, certPassword);
    const agent = createHttpsAgent(credentials);

    // Test ADN connectivity
    const adnOk = await new Promise<boolean>((resolve) => {
      const req = https.request(
        {
          hostname: "adn.nfse.gov.br",
          port: 443,
          path: "/contribuintes/DFe/0",
          method: "GET",
          headers: { Accept: "application/xml" },
          agent,
          timeout: 10000,
        },
        (res) => {
          let body = "";
          res.on("data", (d: Buffer) => (body += d));
          res.on("end", () => resolve(res.statusCode === 200));
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
      req.end();
    });

    return res.json({
      success: true,
      adnDisponivel: adnOk,
      certificado: {
        valido: info.daysLeft > 0,
        diasRestantes: info.daysLeft,
        expiraEm: info.expiresAt.toISOString(),
        cnpj: info.cnpj,
        razaoSocial: info.razaoSocial,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
