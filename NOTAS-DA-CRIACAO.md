# Pergunte ao meu currículo: notas da criação

Projeto pra aprender RAG na prática. Explicação completa do conceito em
`Desktop\coach-carter-linkedin\knowledge\estudo\01-rag-busca-vetorial.md`.

---

## Parte 1: o banco de vetores (15/11/2026) ✅

### O que foi feito
- `docker-compose.yml`: sobe um PostgreSQL 17 com a extensão **pgvector** no Docker, na porta **5433**.
- `db/001_schema.sql`: liga a extensão, cria a tabela `chunks` e a função `buscar_chunks`.
- `db/002_demo_barba.sql`: tabela de estudo com vetores de 2 números (exemplo da barba).
- `.env`: senha do banco local, gerada aleatoriamente (fica fora do git). `.env.example` mostra o formato.

### Decisões e porquês
| Decisão | Por quê |
|---|---|
| **Banco local no Docker** em vez de já criar no Supabase | Aprender sem depender de conta/internet; o Supabase usa o mesmo Postgres + pgvector, então o SQL é o mesmo quando formos publicar |
| Imagem `pgvector/pgvector:pg17` | Imagem oficial do pgvector, já vem com a extensão instalada |
| Porta **5433** | A 5432 já é do PostgreSQL 18 do Windows (Limper) |
| `vector(1024)` | É o tamanho do vetor que o modelo de embedding `voyage-3.5` devolve. **Se trocar o modelo, tem que mudar esse número e refazer os embeddings** |
| Colunas `fonte` e `secao` | Metadados: é o que permite a resposta citar de onde tirou a informação |
| Função `buscar_chunks` no banco | A lógica de busca fica num lugar só; o app só chama a função passando o vetor da pergunta |
| Sem índice HNSW por enquanto | Currículo = ~20 linhas; comparar com todas é instantâneo. Índice só compensa com dezenas de milhares |

### Conceitos que apareceram
- `<=>` = **distância de cosseno**: 0 = mesmo significado, 2 = oposto.
- `1 - distância` = **similaridade**: 1 = igual, perto de 0 = nada a ver.
- `order by embedding <=> pergunta` = ordena do mais parecido pro menos parecido.

### Teste feito (prova de que funciona)
Pergunta "aparar a barba" = `[0.9, 0.1]`:

| texto | distância | similaridade |
|---|---|---|
| Barba completa R$45 | 0.009 | **0.991** |
| Corte + barba R$110 | 0.043 | 0.957 |
| Horário de funcionamento | 0.780 | **0.220** |

Bateu com a conta feita à mão (0,99 e 0,22).

### Comandos úteis
```bash
docker compose up -d        # liga o banco
docker compose down         # desliga (os dados ficam guardados no volume)
docker exec -it curriculo-db psql -U postgres -d curriculo   # abre o terminal SQL
```

---

## Parte 2: ingestão (próxima)
Ler o currículo e os cases → cortar por seção → gerar embeddings → salvar na tabela `chunks`.
