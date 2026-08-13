import type { Request, Response } from "express";
import { loadCertFromBase64, createHttpsAgent } from "../lib/cert.js";
import { buildCancelEventXml, signCancelEventXml, type CancelParams } from "../lib/dps-xml.js";
import { postSefinEvento, gunzipB64 } from "../lib/sefin-client.js";

/**
 * Cancela uma NFS-e Nacional já autorizada, registrando o evento e101101
 * (Cancelamento) no Ambiente Nacional via mTLS com o certificado A1.
 *
 * Body: { certBase64, certPassword, chaveAcesso, motivo, codigoMotivo?, ambiente? }
 */
export async function handleCancel(req: Request, res: Response) {
  try {
    const { certBase64, certPassword, chaveAcesso, motivo, codigoMotivo, ambiente } = req.body ?? {};

    if (!certBase64 || !certPassword) {
      return res.status(400).json({ success: false, error: "Certificado digital nao informado" });
    }
    const chave = String(chaveAcesso ?? "").replace(/\D/g, "");
    if (chave.length !== 50) {
      return res.status(400).json({ success: false, error: "Chave de acesso da NFS-e invalida (esperado 50 digitos)" });
    }
    // O SEFIN exige justificativa; abaixo de 15 caracteres costuma ser rejeitada.
    if (!motivo || String(motivo).trim().length < 15) {
      return res.status(400).json({ success: false, error: "Informe o motivo do cancelamento (minimo 15 caracteres)" });
    }

    const { credentials, info: certInfo } = loadCertFromBase64(certBase64, certPassword);
    if (certInfo.daysLeft <= 0) {
      return res.status(400).json({ success: false, error: "Certificado digital expirado" });
    }
    // O autor do evento é o prestador (dono do certificado).
    const cnpjAutor = certInfo.cnpj || "";
    if (!cnpjAutor) {
      return res.status(400).json({ success: false, error: "Nao foi possivel extrair o CNPJ do certificado" });
    }

    const params: CancelParams = {
      cnpjAutor,
      chaveAcesso: chave,
      motivo: String(motivo).trim(),
      codigoMotivo: (["1", "2", "9"].includes(String(codigoMotivo)) ? String(codigoMotivo) : "9") as "1" | "2" | "9",
      ambiente: ambiente === "homologacao" ? "homologacao" : "producao",
    };

    const xml = buildCancelEventXml(params);
    const signedXml = signCancelEventXml(xml, credentials);

    const agent = createHttpsAgent(credentials);
    const result = await postSefinEvento(chave, signedXml, agent, params.ambiente);

    let eventoXml: string | null = null;
    if (result.nfseEventoXmlGZipB64) {
      try { eventoXml = gunzipB64(result.nfseEventoXmlGZipB64); } catch { eventoXml = null; }
    }

    return res.json({
      success: true,
      chaveAcesso: chave,
      idEvento: result.idEvento ?? null,
      dataHoraProcessamento: result.dataHoraProcessamento ?? null,
      ambiente: result.tipoAmbiente === 1 ? "producao" : params.ambiente,
      alertas: result.alertas ?? [],
      pedidoEventoXml: signedXml,
      eventoXml,
    });
  } catch (err: any) {
    console.error("[cancel] Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
