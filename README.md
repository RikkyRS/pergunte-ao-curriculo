# Pergunte ao meu currículo

RAG (Retrieval-Augmented Generation) que responde perguntas sobre a minha carreira **usando apenas o meu currículo**, citando a fonte e admitindo quando não sabe.

```
pergunta → embedding (Voyage AI) → busca vetorial (PostgreSQL + pgvector) → top 5 trechos → LLM com regras anti-alucinação → resposta + fontes
```

## Resultados (evals)
| Métrica | Resultado |
|---|---|
| Seção certa em 1º lugar na busca | **10/10** |
| Respostas honestas em perguntas fora do currículo | **2/2** |

Lição do projeto: com `qwen2.5:3b` a busca acertava, mas o modelo respondia "não encontrei" mesmo com o trecho certo; com `qwen2.5:7b` passou. Avaliar busca e geração **separadamente** mostrou qual metade falhava.

## Stack
TypeScript (Node 24, sem build) · PostgreSQL 17 + pgvector (Docker) · Voyage AI `voyage-3.5` (1024 dimensões) · Ollama `qwen2.5:7b` (local) · `pg`

## Rodar
```bash
cp .env.example .env          # preencha as senhas/chaves
docker compose up -d          # banco com pgvector
npm install
npm run ingerir               # currículo → chunks → embeddings → banco
npm run perguntar -- "ele já otimizou banco de dados?"
npm run web                   # interface em http://localhost:3333
npm run avaliar               # evals
```
Requer [Ollama](https://ollama.com) com `ollama pull qwen2.5:7b` e uma chave da [Voyage AI](https://voyageai.com).

## Decisões
Detalhadas em [`RESUMO-PARA-ENTREVISTA.md`](RESUMO-PARA-ENTREVISTA.md) e [`NOTAS-DA-CRIACAO.md`](NOTAS-DA-CRIACAO.md).
