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

## Parte 2: ingestão + teste da busca (15/11/2026) ✅

### O que foi feito
- `dados/curriculo.md`: versão **pública e limpa** do currículo (sem telefone, e-mail ou notas internas).
- `scripts/ingerir.ts` (`npm run ingerir`): lê `dados/*.md` → corta por seção `##` → gera embeddings na Voyage → salva em `chunks`. Resultado: 12 pedaços, 1.561 tokens.
- `scripts/buscar.ts` (`npm run buscar -- "pergunta"`): transforma a pergunta em vetor e mostra os 5 pedaços mais parecidos.

### Decisões e porquês
| Decisão | Por quê |
|---|---|
| Pasta `dados/` com currículo limpo, em vez de usar o `cv.md` do Coach Carter | Num RAG, **tudo que entra no banco pode sair na resposta**. O `cv.md` tinha "[CONFIRMAR]", divergências e link velho |
| Markdown em vez de PDF | Markdown já tem as seções marcadas com `##`; PDF exigiria extrair texto e adivinhar onde começa cada seção |
| Cabeçalho de contexto em cada pedaço (`nome + Seção: ...`) | Um pedaço solto "eliminou consultas N+1" não diz de quem nem de onde. Com o cabeçalho, o embedding carrega esse contexto |
| `input_type: "document"` na ingestão e `"query"` na pergunta | O modelo da Voyage otimiza diferente "o que é procurado" e "o que procura"; isso melhora a busca |
| `fetch` direto em vez de SDK da Voyage | É uma chamada só; menos dependência. O SDK só valeria se usássemos mais recursos |
| Transação (`begin`/`commit`/`rollback`) + `delete` antes de inserir | Rodar 2x não duplica, e erro no meio não deixa o banco pela metade |
| Node 24 rodando `.ts` direto | O Node 24 entende TypeScript sem compilar; menos ferramentas |

### Resultado do teste
| Pergunta | 1º lugar | similaridade |
|---|---|---|
| ele já otimizou banco de dados? | Experiência: Limper | 0.425 |
| sabe trabalhar com IA? | Experiência: Carmillion | 0.613 |
| onde ele estudou? | Formação | 0.413 |
| ele sabe fazer bolo de chocolate? | Formação (errado, mas baixo) | 0.352 |

**O que aprendi com isso:**
- Nos 3 primeiros, o 1º lugar foi o certo, mesmo sem palavras iguais ("otimizou" não aparece no texto; "N+1" e "subqueries" sim).
- Com embeddings reais, os números ficam entre ~0.3 e ~0.6, não perto de 1 como no exemplo da barba. **O que importa é a ordem e a distância entre o 1º e o resto**, não o valor absoluto.
- A busca SEMPRE devolve 5 pedaços, mesmo quando nada tem a ver (bolo). Quem tem que dizer "não sei" é o Claude, na Parte 3, olhando os trechos. Dá pra somar um **limite mínimo de similaridade** depois, mas só calibrando com testes (evals).

### Limite da conta grátis da Voyage
Sem cartão cadastrado: **3 requisições por minuto**. A cota grátis (200 milhões de tokens nos modelos Voyage 3) vale de qualquer jeito. Pra demo com pouca gente, 3/min pode travar; cadastrar cartão sobe o limite e continua usando a cota grátis.

---

## Parte 3: resposta com o Claude (próxima)
Pergunta → busca → monta o prompt com os trechos → Claude responde citando a fonte ou dizendo "não encontrei".

## Partes 3, 4 e 5: resposta, interface e evals (15/11/2026) ✅
- `src/rag.ts`: as 3 funções do RAG. Geração com **Ollama local** (grátis); trocar pro Claude = mudar só `gerarResposta`.
- `scripts/perguntar.ts` (terminal) e `scripts/servidor.ts` + `web/index.html` (web local, porta 3333).
- `scripts/avaliar.ts`: evals da busca (10 casos) e da honestidade (2 casos).
- **Problema:** `qwen2.5:3b` dizia "não encontrei" mesmo com o trecho certo. Ajustes de prompt não resolveram; `qwen2.5:7b` resolveu.
- **Resultado:** busca 10/10 em 1º lugar; honestidade 2/2.
- Resumo completo pra estudar: `RESUMO-PARA-ENTREVISTA.md`.
