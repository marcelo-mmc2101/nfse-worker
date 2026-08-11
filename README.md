# NFS-e Worker — emissor próprio (Ambiente Nacional / SEFIN)

Micro-serviço que assina o DPS e transmite a NFS-e ao **Ambiente Nacional** (SEFIN/ADN) usando
**mTLS com o certificado A1** da sua empresa. Existe porque a assinatura mTLS com certificado
digital **não roda em edge functions** (Deno/Supabase) — precisa de um processo Node dedicado.

É **stateless**: não tem banco, não guarda nada. Recebe o certificado + os dados da nota numa
requisição autenticada, assina, transmite e devolve o resultado. Cada empresa roda **o seu próprio**
worker, na sua própria conta — o certificado nunca sai do seu ambiente.

> Esta é a via **"servidor próprio"**: você paga só a hospedagem (~US$5/mês) e emite **notas
> ilimitadas sem custo por nota**. Se preferir não manter servidor, o app também oferece a via
> **"provedor"** (emissão via SaaS, paga por nota, sem servidor).

---

## Deploy em 1 clique — escolha pela fricção

Este worker roda de **dois jeitos** com o mesmo código: como **função serverless** (acorda sob
demanda, cabe no free tier — sem cartão) ou como **servidor sempre-ligado** (Docker). Emissão de
NFS-e é sob demanda, então serverless é suficiente para a maioria.

### Opção A — Netlify (menor fricção: grátis, sem cartão) ⭐

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/MindOpsTeam/nfse-worker)

- **Sem cartão** no plano free; **uso comercial permitido** dentro dos limites (125k execuções/mês).
- Roda como Netlify Function (Node/Lambda) — mTLS com o A1 funciona (`https.Agent`).
- Ao clicar: login/criar conta → conecta o repo → deploy. Depois, em **Site settings →
  Environment variables**, crie **`NFSE_WORKER_API_KEY`** com uma chave forte
  (ex.: rode `openssl rand -base64 32`).
- Sua URL fica `https://SEU-site.netlify.app`. Cole essa URL + a chave no app.
- **Limite a saber:** função síncrona no free tem teto de **~10s**. Cobre uma emissão normal; se
  você emite em picos lentos ou alto volume, prefira Cloud Run/Railway.

### Opção B — Railway (servidor sempre-ligado, ~US$5/mês)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/nfse-worker)

- A Railway **gera sozinha** a `NFSE_WORKER_API_KEY` (`${{ secret(32) }}`) — você não digita chave.
- Deploy via `Dockerfile` + healthcheck `/health`; gere o domínio em **Settings → Networking**.
- **Exige cartão** (Hobby ~US$5/mês) porque fica de pé 24/7. Sem limite de 10s, melhor para volume.

### Opção C — Google Cloud Run (quase-grátis, mais headroom)

Escala a zero, praticamente grátis no free tier para volume de PME, timeout até 60s. Cadastro GCP
exige cartão (mas não cobra dentro da franquia) e o setup é mais técnico. Veja
[DEPLOY-CLOUDRUN.md](DEPLOY-CLOUDRUN.md).

### Não quero manter servidor nenhum

Use a via **provedor** no app (Focus NFe / PlugNotas): emissão via SaaS, paga por nota, sem servidor.

| Opção | Cartão? | Uso comercial | Modelo | Teto de tempo | Melhor para |
|---|---|---|---|---|---|
| **Netlify** | Não | Sim | serverless | ~10s | menor fricção, começar sem gastar |
| **Cloud Run** | Cadastro | Sim | serverless (scale-to-zero) | 60s | volume, quase de graça |
| **Railway** | Sim (~US$5/mês) | Sim | sempre-ligado | sem teto | volume alto, deploy mais simples |
| **Provedor (SaaS)** | — | Sim | sem servidor | — | não quer manter infra (paga por nota) |

Depois de qualquer opção: no app → **Configurações → Integrações → NFS-e → Servidor próprio**,
cole a **URL** + a **chave** e clique em **Testar servidor** (bate em `/health`).

---

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET`  | `/health` | Liveness. Não exige auth. `{ "status": "ok" }` |
| `POST` | `/status` | Testa o certificado (validade, CNPJ) e a conectividade com o ADN. |
| `POST` | `/emit`   | Assina o DPS e transmite a NFS-e ao SEFIN Nacional. |
| `POST` | `/cancel` | Cancelamento (em implementação). |

Toda rota (exceto `/health`) exige o header **`X-API-Key: <NFSE_WORKER_API_KEY>`**. Sem a chave
setada, o worker recusa tudo (fail-closed).

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NFSE_WORKER_API_KEY` | ✅ | Chave compartilhada entre o app e o worker. Gerada pelo template. |
| `PORT` | — | Porta HTTP (default `3000`; a Railway injeta automaticamente). |

O certificado A1 (`.pfx` base64 + senha) **não** é variável de ambiente: chega em cada requisição
`/emit` ou `/status`, vindo do app. O worker não persiste o certificado.

## Rodar local

```bash
npm ci
npm run build
NFSE_WORKER_API_KEY=dev npm start   # sobe em :3000
curl localhost:3000/health
```

## Segurança

- Stateless: sem banco, sem disco; o certificado só existe em memória durante a requisição.
- `X-API-Key` obrigatório; recusa tudo se a chave não estiver setada.
- mTLS com `rejectUnauthorized: true`, TLS 1.2+.
- Rode **um worker por empresa** — não compartilhe uma instância entre CNPJs distintos.

## Licença

MIT.
