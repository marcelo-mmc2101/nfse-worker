/**
 * Builds and signs the DPS XML for NFS-e Nacional (SEFIN)
 */
import { SignedXml } from "xml-crypto";
import { XMLBuilder } from "fast-xml-parser";
import type { TlsCredentials } from "./cert.js";

const NS = "http://www.sped.fazenda.gov.br/nfse";

export interface EmitParams {
  cnpjPrestador: string;
  inscricaoMunicipal?: string;
  codigoMunicipio: string;
  competencia: string; // YYYY-MM
  serieDps: string;
  numeroDps: string;
  servico: {
    codigoTribNac: string;
    descricao: string;
    codigoNbs?: string;
  };
  tomador: {
    cpfCnpj: string;
    razaoSocial?: string;
    email?: string;
  };
  valores: {
    valorServicos: number;
  };
  observacoes?: string;
  optanteSimplesNacional?: boolean;
  regimeEspecial?: string;
  naturezaTributacao?: string;
  ambiente?: "producao" | "homologacao";
}

export function buildIdDps(p: EmitParams): string {
  const tpInscFed = p.cnpjPrestador.length === 14 ? "2" : "1";
  return `DPS${p.codigoMunicipio}${tpInscFed}${p.cnpjPrestador}${p.serieDps.padStart(5, "0")}${p.numeroDps.padStart(15, "0")}`;
}

function formatDateTimeBRT(date: Date): string {
  const offset = -3;
  const local = new Date(date.getTime() + offset * 60 * 60 * 1000);
  const iso = local.toISOString().replace(/\.\d{3}Z$/, "");
  return `${iso}-03:00`;
}

function fmt(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

export function buildDpsXml(p: EmitParams): string {
  const dps: Record<string, unknown> = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    DPS: {
      "@_xmlns": NS,
      "@_versao": "1.00",
      infDPS: {
        "@_Id": buildIdDps(p),
        tpAmb: p.ambiente === "homologacao" ? "2" : "1",
        dhEmi: formatDateTimeBRT(new Date()),
        verAplic: "ERP-NFSE-WORKER-1.0",
        serie: p.serieDps,
        nDPS: p.numeroDps,
        dCompet: `${p.competencia}-01`,
        tpEmit: "1",
        cLocEmi: p.codigoMunicipio,
        prest: {
          CNPJ: p.cnpjPrestador,
          ...(p.inscricaoMunicipal ? { IM: p.inscricaoMunicipal } : {}),
          regTrib: {
            opSimpNac: p.optanteSimplesNacional ? "3" : "1",
            regEspTrib: p.regimeEspecial || "0",
          },
        },
        ...(p.tomador ? {
          toma: {
            ...(p.tomador.cpfCnpj.length === 14 ? { CNPJ: p.tomador.cpfCnpj } : { CPF: p.tomador.cpfCnpj }),
            ...(p.tomador.razaoSocial ? { xNome: p.tomador.razaoSocial } : {}),
            ...(p.tomador.email ? { email: p.tomador.email } : {}),
          },
        } : {}),
        serv: {
          locPrest: { cLocPrestacao: p.codigoMunicipio },
          cServ: {
            cTribNac: p.servico.codigoTribNac.replace(/\./g, ""),
            xDescServ: p.servico.descricao,
            ...(p.servico.codigoNbs ? { cNBS: p.servico.codigoNbs } : {}),
          },
        },
        valores: {
          vServPrest: { vServ: fmt(p.valores.valorServicos) },
          trib: {
            tribMun: {
              tribISSQN: p.naturezaTributacao || "1",
              tpRetISSQN: "1",
            },
            totTrib: { indTotTrib: "0" },
          },
        },
        ...(p.observacoes ? { infCompl: { xInfComp: p.observacoes } } : {}),
      },
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
    suppressEmptyNode: true,
    format: false,
  });

  return builder.build(dps) as string;
}

export function signDpsXml(xml: string, credentials: TlsCredentials): string {
  const idDps = xml.match(/Id="([^"]+)"/)?.[1] || "";

  const certPemMatch = credentials.cert.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
  if (!certPemMatch) throw new Error("Certificado PEM nao encontrado");
  const certPem = certPemMatch[0];
  const certDerB64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s/g, "");

  const sig = new SignedXml({
    privateKey: credentials.key,
    publicCert: certPem,
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certDerB64}</X509Certificate></X509Data>`,
  });

  sig.addReference({
    xpath: `//*[@Id='${idDps}']`,
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
  });

  sig.computeSignature(xml, {
    location: { reference: "//*[local-name()='infDPS']", action: "after" },
  });

  return sig.getSignedXml();
}
