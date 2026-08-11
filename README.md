# NFS-e Worker — emissor próprio (Ambiente Nacional / SEFIN)

Micro-serviço que assina o DPS e transmite a NFS-e ao **Ambiente Nacional** (SEFIN/ADN) usando
**mTLS com o certificado A1** da sua empresa. Existe porque a assinatura mTLS com certificado
digital **não roda em edge functions** (Deno/Supabase) — precisa de um processo Node dedicado.

É **stateless**: não tem banco, não guarda nada. Recebe o certificado + os dados da nota numa
requisição autenticada, assina, transmite e devolve o resultado. Cada empresa roda **o seu próprio**
worker, na sua própria conta — o certificado nunca sai do seu ambiente.

> Esta é a via **"servidor próprio"**: você paga só a hospedagem (de graça a ~US$5/mês) e emite
> **notas ilimitadas sem custo por nota**. Se preferir não manter servidor, o app também oferece a
> via **"provedor"** (emissão via SaaS, paga por nota, sem servidor).

---

## Como funciona

```
App (Supabase Edge)  ──POST──▶  Worker  ──mTLS (cert A1)──▶  SEFIN Nacional
  X-API-Key: <chave>            (aqui)      https.request        (síncrono)
  { cert, dados da nota }                                        devolve a NFS-e
```

1. O app manda para o worker o certificado (.pfx em base64), a senha e os dados da nota, numa
   requisição HTTPS autenticada pelo header **`X-API-Key`**.
2. O worker carrega o certificado **em memória** (não grava nada), monta o XML do DPS e **assina**
   digitalmente com o A1.
3. O worker abre uma conexão **mTLS** (apresentando o certificado) para o SEFIN e faz o POST.
4. **O SEFIN é síncrono:** ele valida e, na mesma resposta, devolve a **chave de acesso (50 dígitos)
   e a NFS-e já autorizada**. Não é "enviar e consultar depois" — o worker fica esperando essa
   resposta dentro da mesma requisição. Por isso o **teto de tempo da hospedagem importa** (veja a
   comparação abaixo).

### Que "chave" é essa? (`NFSE_WORKER_API_KEY`)

É a **senha de acesso ao seu worker** — NÃO tem nada a ver com o certificado nem com a Receita.
Serve só para garantir que **apenas o seu app** consegue mandar o worker emitir. Toda rota (menos
`/health`) exige o header `X-API-Key` com esse valor; sem a chave setada, o worker recusa tudo
(fail-closed). Você define esse valor **uma vez**, igual nos dois lugares:

- no **worker** (variável de ambiente `NFSE_WORKER_API_KEY`);
- no **app** (campo "Chave do worker" em Configurações → NFS-e).

É uma string aleatória qualquer (ex.: `openssl rand -base64 32`). No Railway o template **gera
sozinho**; no Netlify/Cloud Run você cria a variável e cola o mesmo valor no app. Se vazar, é só
trocar nos dois lados — o certificado nunca é exposto por ela.

---

## Deploy em 1 clique — escolha pela fricção

Este worker roda de **dois jeitos** com o mesmo código: como **função serverless** (acorda sob
demanda, cabe no free tier) ou como **servidor sempre-ligado** (Docker). Como a emissão é síncrona
ao SEFIN, o que separa as opções é o **teto de tempo por chamada** e o custo.

**Recomendação rápida:** produção com volume → **Cloud Run** (timeout de minutos, quase grátis);
testar/homologar ou baixo volume sem cartão → **Netlify**; deploy mais simples e tanto faz US$5 →
**Railway**.

### Opção A — Netlify (sem cartão, ótimo para testar / baixo volume)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/MindOpsTeam/nfse-worker)

- **Sem cartão** no plano free; **uso comercial permitido** dentro dos limites (125k execuções/mês).
- Roda como Netlify Function (Node/Lambda) — mTLS com o A1 funciona (`https.Agent`).
- Ao clicar: login/criar conta → conecta o repo → deploy. Depois, em **Site settings →
  Environment variables**, crie **`NFSE_WORKER_API_KEY`** com uma chave forte
  (ex.: rode `openssl rand -base64 32`).
- Sua URL fica `https://SEU-site.netlify.app`. Cole essa URL + a chave no app.
- **Limite que importa:** função síncrona no free tem teto de **~10s** por chamada. Como a emissão
  espera a resposta do SEFIN (síncrona), isso cobre o caso normal (o SEFIN costuma responder em
  poucos segundos), mas **num pico de lentidão do SEFIN a chamada pode estourar** e a nota falha
  com timeout. Para produção com volume, prefira Cloud Run. (Pro do Netlify sobe para 26s.)

### Opção B — Google Cloud Run (recomendado para produção) ⭐

[![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run/?git_repo=https://github.com/MindOpsTeam/nfse-worker)

- **Timeout de request até 60 min** (default 5 min) — folga de sobra para a resposta síncrona do
  SEFIN, mesmo em pico. É o que resolve a preocupação com os 10s.
- **Escala a zero** e é praticamente grátis no free tier (2 mi de requisições/mês) — você paga
  só quando emite. Uso comercial permitido.
- Cadastro GCP exige cartão (mas **não cobra** dentro da franquia). Deploy pelo botão (abre o Cloud
  Shell) ou por CLI — passo a passo em [DEPLOY-CLOUDRUN.md](DEPLOY-CLOUDRUN.md). Defina
  `NFSE_WORKER_API_KEY` no deploy.

### Opção C — Railway (servidor sempre-ligado, ~US$5/mês)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/nfse-worker)

- A Railway **gera sozinha** a `NFSE_WORKER_API_KEY` (`${{ secret(32) }}`) — você não digita chave.
- Deploy via `Dockerfile` + healthcheck `/health`; gere o domínio em **Settings → Networking**.
- **Sem teto de tempo** (fica de pé 24/7). Exige cartão (Hobby ~US$5/mês). O deploy mais simples.

### Não quero manter servidor nenhum

Use a via **provedor** no app (Focus NFe / PlugNotas): emissão via SaaS, paga por nota, sem servidor.

| Opção | Cartão? | Uso comercial | Modelo | Teto por chamada | Melhor para |
|---|---|---|---|---|---|
| **Cloud Run** | cadastro (não cobra no free) | Sim | serverless (scale-to-zero) | **até 60 min** (default 5 min) | **produção**, quase de graça |
| **Netlify** | Não | Sim | serverless | ~10s (Pro: 26s) | testar/homologar, baixo volume, sem cartão |
| **Railway** | Sim (~US$5/mês) | Sim | sempre-ligado | sem teto | deploy mais simples |
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
| `NFSE_WORKER_API_KEY` | ✅ | Senha de acesso ao worker (header `X-API-Key`). Mesmo valor no app. No Railway é gerada pelo template. |
| `PORT` | — | Porta HTTP (default `3000`; Railway/Cloud Run injetam automaticamente). |
| `SEFIN_TIMEOUT_MS` | — | Tempo máximo de espera pela resposta do SEFIN (default `25000`). Em hospedagem com teto curto (Netlify ~10s), baixe para ~`9000` para falhar com erro claro antes do teto da plataforma. |

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
