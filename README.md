# TikTok Analytics Studio

Sistema completo de análise de vídeos TikTok com IA NVIDIA NIM, OCR de frames, transcrição de áudio e banco de dados simplificado.

## Funcionalidades

- **Banco de dados** com métricas públicas do TikTok: views, likes, comments, shares, saves, autor, duração, som, descrição, hashtags, data de publicação
- **OCR automático** do frame no segundo 2 (extrai título via Tesseract + ffmpeg)
- **Transcrição de áudio** via NVIDIA NIM Parakeet ASR (cloud) ou Whisper local (fallback)
- **IA NVIDIA NIM** com function calling: consulta, analisa, cria, modifica e exclui vídeos do banco
- **Análise profunda** de cada vídeo: taxas (likeRate, commentRate, shareRate), percentis vs banco, insights e recomendações
- **Jobs em lote** em background: processa todos os vídeos de uma conta do TikTok ou uma lista de URLs
- **Pipeline completo**: scrape → download .mp4 → OCR → transcrição → salva no banco → DELETA o .mp4

## Stack

- Next.js 16 (App Router, Turbopack)
- TypeScript 5
- Prisma ORM + SQLite
- Tailwind CSS 4 + shadcn/ui
- Playwright (scraping TikTok)
- Tesseract OCR + ffmpeg (frame extraction)
- NVIDIA NIM API (chat IA + ASR)
- Whisper local (fallback de transcrição)
- Node.js + npm (runtime + gerenciador de pacotes)

## Como rodar

### 1. Pré-requisitos

- Node.js 20+
- npm 10+ (vem com Node)
- Python 3.10+ (para Whisper local, opcional)
- ffmpeg + ffprobe instalados
- Tesseract OCR instalado

```bash
# Ubuntu/Debian
sudo apt install ffmpeg tesseract-ocr tesseract-ocr-por tesseract-ocr-eng

# macOS
brew install ffmpeg tesseract tesseract-lang
```

### 2. Instalar dependências

```bash
npm install
npx prisma generate
npx prisma db push
```

### 3. Configurar NVIDIA NIM API key (opcional, mas recomendado)

Pegue uma chave gratuita em https://build.nvidia.com:

```bash
# Edite .env
NVIDIA_NIM_API_KEY=nvapi-sua-chave-aqui
```

Sem a chave: chat IA não funciona, transcrição usa Whisper local (instale com `pip install openai-whisper`).

### 4. Instalar Chromium para o Playwright (scraping TikTok)

```bash
npx playwright install chromium
```

### 5. Rodar

```bash
# Dev server (porta 3000)
npm run dev

# Worker de jobs em lote (porta 3031) — em outro terminal
cd mini-services/scrape-worker
npm install
npm run dev
```

Acesse: http://localhost:3000

## Como usar

### Adicionar vídeos (3 formas)

1. **URL TikTok** — cola a URL, sistema faz scraping + download automático do .mp4 + OCR + transcrição
2. **Upload de arquivo** — seleciona .mp4/.mov/.webm do computador
3. **JSON manual** — cola JSON com métricas (útil quando você já tem os dados)

### Jobs em lote (aba "Jobs em lote")

- **Conta inteira**: digita `@username`, sistema descobre TODOS os vídeos públicos e processa em background
- **Lista de URLs**: cola várias URLs (uma por linha), processa em sequência

Você pode fechar a aba — o worker continua rodando. Volte depois e veja o progresso.

### Chat IA (aba "Chat IA")

Converse com a IA em texto puro (sem markdown). Ela pode:
- Consultar vídeos por qualquer métrica (views, likes, hashtags, autor, etc)
- Fazer análise profunda de um vídeo específico
- Criar roteiros de vídeo baseados no que performa bem no banco
- Inserir, modificar e excluir registros
- Comparar vídeos entre si

### Banco (aba "Banco")

- Tabela com todos os vídeos e métricas
- Filtros: busca textual, autor, views mín/máx, hashtag, duração, data
- Ordenação por qualquer campo
- Clique num vídeo para ver detalhes + análise profunda

## Schema do banco

Apenas os campos necessários (27 no total):

```prisma
model Video {
  id               String    @id @default(cuid())
  sourceId         String?   // ID do vídeo no TikTok
  videoUrl         String
  videoViews       Int?
  likes            Int?
  comments         Int?
  shares           Int?
  saves            Int?
  authorUsername   String?
  duration         Int?      // segundos
  soundName        String?
  description      String?
  hashtags         String?   // JSON array
  publishDate      DateTime?
  ocrTitle         String?   // texto do frame 2
  ocrConfidence    Float?
  transcript       String?
  transcriptEngine String?
  likeRate         Float?    // calculado: likes/views × 100
  commentRate      Float?    // calculado: comments/views × 100
  shareRate        Float?    // calculado: shares/views × 100
  processingStatus String
  processingError  String?
  source           String
  rawMetadata      String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}
```

## Estrutura

```
.
├── prisma/schema.prisma        # Schema do banco
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── videos/         # CRUD + deep-analysis
│   │   │   ├── jobs/           # Jobs em lote
│   │   │   ├── chat/           # Chat IA com function calling
│   │   │   ├── scrape/         # Testar scraper isolado
│   │   │   └── health/         # Health check (NIM key)
│   │   ├── page.tsx            # Página principal (4 abas)
│   │   └── layout.tsx
│   ├── components/             # UI (stats, table, chat, jobs, deep-analysis)
│   └── lib/
│       ├── tiktok.ts           # Fetcher principal (Playwright + oEmbed)
│       ├── tiktok-scraper.ts   # Scraper Playwright
│       ├── tiktok-account-scraper.ts  # Scrape de conta inteira
│       ├── ocr.ts              # OCR frame 2 + Tesseract
│       ├── transcribe.ts       # NIM ASR + Whisper fallback
│       ├── nvidia-nim.ts       # Client NIM (chat + ASR)
│       ├── deep-analysis.ts    # Análise profunda
│       ├── video.ts            # ffprobe + download + save
│       └── db.ts               # Prisma client
├── mini-services/
│   └── scrape-worker/          # Worker de jobs em lote (porta 3031)
├── scripts/                    # Scripts Python de migração/teste
└── .env                        # NVIDIA_NIM_API_KEY
```

## Limitações

- **Métricas privadas do criador** (reach, watch time, retention, audience) não são capturadas automaticamente — são privadas no TikTok. Só com input manual via JSON.
- **Scraping TikTok** pode ser bloqueado em algumas regiões (HK, Índia). Funciona em IPs brasileiros.
- **Transcrição NIM** requer API key. Sem ela, usa Whisper local (mais lento).

## Licença

MIT
