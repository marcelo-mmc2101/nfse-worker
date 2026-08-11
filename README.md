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

## Deploy em 1 clique

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/nfse-worker)

O que acontece ao clicar:

1. **Login / criar conta** na Railway (pode entrar com o GitHub).
2. A Railway **gera sozinha** a `NFSE_WORKER_API_KEY` (variável `${{ secret(32) }}` no template) — você
   não digita nada.
3. **Deploy** automático via `Dockerfile` (build + healthcheck em `/health`).
4. Em **Settings → Networking → Generate Domain**, gere o domínio público
   (`https://SEU-worker.up.railway.app`).
5. Volte ao app do ERP → **Configurações → Integrações → NFS-e → Servidor próprio** e cole:
   - **URL do worker**: o domínio gerado acima
   - **Chave**: o valor de `NFSE_WORKER_API_KEY` (em Variables no painel da Railway)
   Clique em **Testar conexão** — o app bate em `/health` e confirma.

### ⚠️ Sobre custo (leia antes)

A Railway **não tem mais plano grátis permanente**: o trial expira e, para o worker **ficar de pé**
(emissão fiscal precisa responder na hora), é preciso o plano **Hobby (~US$5/mês) com cartão**.
Isso é intrínseco a "ter o seu próprio servidor" — nenhum provedor mantém um serviço sempre ligado
de graça. Alternativas:

- **Railway Hobby** — US$5/mês, o botão acima, experiência mais simples. **Recomendado.**
- **Google Cloud Run** — escala a zero e fica praticamente grátis no free tier para volume de PME
  (paga só quando emite), mas o setup é mais técnico. Veja [DEPLOY-CLOUDRUN.md](DEPLOY-CLOUDRUN.md).
- **Render / Fly.io** — equivalentes (também exigem cartão para não hibernar).
- **Não quero servidor** — use a via **provedor** no app (Focus NFe / PlugNotas), paga por nota.

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
