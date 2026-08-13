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
  // A NFS-e autorizada volta aqui (gzip+base64) quando o SEFIN gera o documento.
  nfseXmlGZipB64?: string;
  erros?: Array<{ Codigo: string; Descricao: string; Complemento?: string }>;
  alertas?: Array<{ Codigo: string; Descricao: string }>;
}

/** Descomprime um campo gzip+base64 devolvido pelo SEFIN (ex.: a NFS-e autorizada). */
export function gunzipB64(b64: string): string {
  return zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf-8");
}

export interface SefinEventoResponse {
  tipoAmbiente?: number;
  dataHoraProcessamento?: string;
  idEvento?: string;
  chaveAcesso?: string;
  // O XML do evento registrado volta aqui (gzip+base64) quando o SEFIN o gera.
  nfseEventoXmlGZipB64?: string;
  erros?: Array<{ Codigo: string; Descricao: string; Complemento?: string }>;
  alertas?: Array<{ Codigo: string; Descricao: string }>;
}

/**
 * Registra um evento (ex.: cancelamento) sobre uma NFS-e já autorizada.
 * POST /SefinNacional/nfse/{chaveAcesso}/eventos com o pedido gzip+base64.
 */
export async function postSefinEvento(
  chaveAcesso: string,
  signedEventXml: string,
  agent: https.Agent,
  ambiente: "producao" | "homologacao" = "producao",
): Promise<SefinEventoResponse> {
  const compressed = await gzip(Buffer.from(signedEventXml, "utf-8"));
  const b64 = compressed.toString("base64");
  const jsonBody = JSON.stringify({ pedidoRegistroEventoXmlGZipB64: b64 });

  const baseUrl = SEFIN_URLS[ambiente];
  const urlObj = new URL(`${baseUrl}/SefinNacional/nfse/${chaveAcesso}/eventos`);

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
          "User-Agent": "ERP-NFSE-WORKER/1.1",
        },
        agent,
        timeout: parseInt(process.env.SEFIN_TIMEOUT_MS || "25000", 10),
      },
      (res) => {
        let body = "";
        res.on("data", (d: Buffer) => (body += d));
        res.on("end", () => {
          let parsed: SefinEventoResponse;
          try {
            parsed = JSON.parse(body);
          } catch {
            return reject(new Error(`Resposta SEFIN (evento) invalida: ${body.substring(0, 200)}`));
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
    req.on("error", (e) => reject(new Error(`Conexao SEFIN (evento) falhou: ${e.message}`)));
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout SEFIN (evento)")); });
    req.write(jsonBody);
    req.end();
  });
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
        // O Ambiente Nacional é SÍNCRONO: esta requisição só retorna quando o
        // SEFIN termina de processar e devolve a NFS-e autorizada. Em plataformas
        // com teto curto (ex.: Netlify free ~10s), reduza via SEFIN_TIMEOUT_MS para
        // falhar antes do teto e devolver um erro claro em vez de um 502 opaco.
        timeout: parseInt(process.env.SEFIN_TIMEOUT_MS || "25000", 10),
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
