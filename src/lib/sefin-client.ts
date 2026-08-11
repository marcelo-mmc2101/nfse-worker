/**
 * SEFIN Nacional HTTP client — sends signed DPS via JSON GZip+Base64
 */
import * as https from "node:https";
import * as zlib from "node:zlib";
import { promisify } from "node:util";

const gzip = promisify(zlib.gzip);

const SEFIN_URLS = {
  producao: "https://sefin.nfse.gov.br",
  homologacao: "https://sefin.producaorestrita.nfse.gov.br",
};

export interface SefinResponse {
  tipoAmbiente: number;
  versaoAplicativo: string;
  dataHoraProcessamento: string;
  idDPS: string;
  chaveAcesso?: string;
  erros?: Array<{ Codigo: string; Descricao: string; Complemento?: string }>;
  alertas?: Array<{ Codigo: string; Descricao: string }>;
}

export async function postSefin(
  signedXml: string,
  agent: https.Agent,
  ambiente: "producao" | "homologacao" = "producao",
): Promise<SefinResponse> {
  const compressed = await gzip(Buffer.from(signedXml, "utf-8"));
  const b64 = compressed.toString("base64");
  const jsonBody = JSON.stringify({ dpsXmlGZipB64: b64 });

  const baseUrl = SEFIN_URLS[ambiente];
  const urlObj = new URL(`${baseUrl}/SefinNacional/nfse`);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "ERP-NFSE-WORKER/1.0",
        },
        agent,
        timeout: 30000,
      },
      (res) => {
        let body = "";
        res.on("data", (d: Buffer) => (body += d));
        res.on("end", () => {
          let parsed: SefinResponse;
          try {
            parsed = JSON.parse(body);
          } catch {
            return reject(new Error(`Resposta SEFIN invalida: ${body.substring(0, 200)}`));
          }

          if (parsed.erros && parsed.erros.length > 0) {
            const msg = parsed.erros
              .map((e) => `[${e.Codigo}] ${e.Descricao}${e.Complemento ? ` — ${e.Complemento}` : ""}`)
              .join("; ");
            return reject(new Error(msg));
          }

          resolve(parsed);
        });
      },
    );

    req.on("error", (e) => reject(new Error(`Conexao SEFIN falhou: ${e.message}`)));
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout SEFIN")); });
    req.write(jsonBody);
    req.end();
  });
}
