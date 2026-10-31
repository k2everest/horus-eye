# Manual de execução no GCP (Cloud Run) — Aegis Flow Validation Gateway MVP

Este guia coloca o `validation-gateway` no ar no Google Cloud usando **Cloud Run** com logs estruturados no **Cloud Logging**.

## 1) Pré-requisitos

- Projeto GCP ativo.
- Permissões mínimas:
  - Cloud Run Admin
  - Artifact Registry Writer
  - Service Account User
- `gcloud` instalado e autenticado.

## 2) Variáveis de ambiente (ajuste antes de executar)

```bash
export PROJECT_ID="SEU_PROJECT_ID"
export REGION="us-central1"
export REPO="aegis"
export IMAGE="validation-gateway"
export SERVICE="aegis-validation-gateway"
```

## 3) Habilitar APIs

```bash
gcloud config set project "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  logging.googleapis.com
```

## 4) Criar repositório de imagens (Artifact Registry)

```bash
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Aegis Flow images"
```

> Se já existir, este comando pode falhar com `ALREADY_EXISTS`; pode ignorar.

## 5) Build e push da imagem

Execute a partir da raiz do repositório:

```bash
cd aegis-flow/services/validation-gateway

gcloud builds submit \
  --tag "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE:latest" \
  .
```

## 6) Deploy no Cloud Run

```bash
gcloud run deploy "$SERVICE" \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE:latest" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --cpu 1
```

## 7) Testar endpoint

```bash
SERVICE_URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')

curl -s "$SERVICE_URL/healthz"

curl -s -X POST "$SERVICE_URL/validate" \
  -H 'content-type: application/json' \
  -d '{"tx_blob":"0123456789abcdef0123456789abcdef","request_id":"req-gcp-1"}'
```

## 8) Ver logs no Cloud Logging

### CLI
```bash
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE" \
  --limit=50 \
  --format='value(textPayload)'
```

### Console
- Acesse: Cloud Run → Serviço `$SERVICE` → aba **Logs**.
- Você verá linhas JSON com `request_id`, `method`, `status_code`, `latency_ms`, `tx_id_hash`.

## 9) Segurança mínima recomendada para produção

- Trocar `--allow-unauthenticated` por autenticação via IAM.
- Restringir entrada via Load Balancer + Cloud Armor.
- Ativar métricas e alertas por erro (`status_code != OK`).
- Garantir que payloads sensíveis nunca sejam logados (já aplicado no MVP por `tx_id_hash`).

## 10) Rollback rápido

```bash
gcloud run revisions list --service "$SERVICE" --region "$REGION"

gcloud run services update-traffic "$SERVICE" \
  --region "$REGION" \
  --to-revisions REVISAO_ESTAVEL=100
```
