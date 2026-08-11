# Deploy no Google Cloud Run (quase-grátis, scale-to-zero)

Alternativa à Railway para quem quer custo perto de zero. O Cloud Run **escala a zero** (não paga
quando ninguém emite) e o free tier cobre folgado o volume de uma PME. O custo é um **cold start**
de 1–2s na primeira emissão após ociosidade — aceitável para emissão sob demanda.

Requisito: uma conta Google Cloud com faturamento ativado (o free tier ainda exige cartão cadastrado,
mas não cobra dentro da franquia).

```bash
# 1. Autenticar e escolher o projeto
gcloud auth login
gcloud config set project SEU_PROJETO

# 2. Gerar a chave do worker
KEY=$(openssl rand -base64 32)
echo "Guarde esta chave: $KEY"

# 3. Build + deploy direto do fonte (Cloud Build usa o Dockerfile)
gcloud run deploy nfse-worker \
  --source . \
  --region southamerica-east1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --set-env-vars "NFSE_WORKER_API_KEY=$KEY"

# 4. A URL sai no fim do deploy: https://nfse-worker-xxxx.a.run.app
#    Cole essa URL + a KEY no app (Configurações → NFS-e → Servidor próprio).
curl "$(gcloud run services describe nfse-worker --region southamerica-east1 --format 'value(status.url)')/health"
```

`--min-instances 0` é o que mantém o custo baixo (escala a zero). Se quiser eliminar o cold start e
não se importar com um custo pequeno constante, use `--min-instances 1`.
