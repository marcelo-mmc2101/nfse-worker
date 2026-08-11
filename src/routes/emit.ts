import type { Request, Response } from "express";
import { loadCertFromBase64, createHttpsAgent } from "../lib/cert.js";
import { buildDpsXml, signDpsXml, buildIdDps, type EmitParams } from "../lib/dps-xml.js";
import { postSefin } from "../lib/sefin-client.js";

export async function handleEmit(req: Request, res: Response) {
  try {
    const {
      certBase64,
      certPassword,
      cnpjPrestador,
      inscricaoMunicipal,
      codigoMunicipio,
      competencia,
      serieDps,
      numeroDps,
      servico,
      tomador,
      valores,
      observacoes,
      optanteSimplesNacional,
      ambiente,
    } = req.body;

    // Validate required fields
    if (!certBase64 || !certPassword) {
      return res.status(400).json({ success: false, error: "Certificado digital nao informado" });
    }
    if (!cnpjPrestador || !codigoMunicipio || !competencia || !servico || !valores) {
      return res.status(400).json({ success: false, error: "Campos obrigatorios faltando" });
    }

    // Load certificate
    const { credentials, info: certInfo } = loadCertFromBase64(certBase64, certPassword);

    if (certInfo.daysLeft <= 0) {
      return res.status(400).json({ success: false, error: "Certificado digital expirado" });
    }

    // Verify CNPJ matches
    if (certInfo.cnpj && certInfo.cnpj !== cnpjPrestador) {
      return res.status(400).json({
        success: false,
        error: `CNPJ do certificado (${certInfo.cnpj}) difere do prestador (${cnpjPrestador})`,
      });
    }

    // Build DPS params
    const params: EmitParams = {
      cnpjPrestador,
      inscricaoMunicipal,
      codigoMunicipio,
      competencia,
      serieDps: serieDps || "1",
      numeroDps: String(numeroDps || "1"),
      servico: {
        codigoTribNac: servico.codigoTribNac,
        descricao: servico.descricao,
        codigoNbs: servico.codigoNbs,
      },
      tomador: tomador ? {
        cpfCnpj: tomador.cpfCnpj,
        razaoSocial: tomador.razaoSocial,
        email: tomador.email,
      } : { cpfCnpj: "", razaoSocial: "" },
      valores: { valorServicos: valores.valorServicos },
      observacoes,
      optanteSimplesNacional,
      ambiente: ambiente || "producao",
    };

    // Build and sign XML
    const xml = buildDpsXml(params);
    const signedXml = signDpsXml(xml, credentials);

    // Send to SEFIN
    const agent = createHttpsAgent(credentials);
    const result = await postSefin(signedXml, agent, ambiente || "producao");

    return res.json({
      success: true,
      idDPS: result.idDPS,
      chaveAcesso: result.chaveAcesso || null,
      dataHoraProcessamento: result.dataHoraProcessamento,
      ambiente: result.tipoAmbiente === 1 ? "producao" : "homologacao",
      alertas: result.alertas || [],
    });
  } catch (err: any) {
    console.error("[emit] Error:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
