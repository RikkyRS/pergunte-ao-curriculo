# Pergunte ao meu currículo: resumo completo pra explicar em entrevista

## Em uma frase
É um **RAG**: o recrutador pergunta algo sobre mim, o sistema **busca por significado** os trechos certos do meu currículo num banco vetorial e uma IA **responde só com base neles**, citando a fonte, ou diz "não encontrei" quando a informação não existe.

## Pitch de 30 segundos
> "Fiz um RAG do zero pra aprender busca vetorial na prática. Meu currículo é dividido em seções, cada seção vira um embedding na Voyage AI e fica no PostgreSQL com pgvector. Quando chega uma pergunta, ela também vira vetor, e o banco devolve as 5 seções mais parecidas por similaridade de cosseno. Um modelo de linguagem recebe esses trechos com regras pra não inventar e responde citando a fonte. Medi com evals: a busca acerta a seção em 1º lugar em 10 de 10 perguntas, e o modelo admite que não sabe nas 2 perguntas fora do currículo. Também aprendi que a qualidade depende do modelo: o de 3 bilhões de parâmetros errava mesmo com o trecho certo; o de 7 bilhões acertou."

---

## Como funciona (as 2 fases)

### Fase 1: Ingestão (roda uma vez, ou quando o currículo muda) — `npm run ingerir`
```
dados/curriculo.md
  → corta por seção "##" (12 pedaços)
  → coloca um cabeçalho em cada pedaço ("Henrique... Seção: Formação")
  → Voyage AI transforma cada pedaço em um vetor de 1024 números (input_type "document")
  → salva no PostgreSQL: fonte | seção | texto | vetor
```

### Fase 2: Consulta (a cada pergunta) — `npm run perguntar` ou `npm run web`
```
pergunta
  → Voyage transforma em vetor (input_type "query")
  → função SQL buscar_chunks: os 5 pedaços mais parecidos (operador <=>, distância de cosseno)
  → monta o prompt: regras + trechos numerados + pergunta
  → modelo de linguagem (Ollama, qwen2.5:7b, local) escreve a resposta com "Fontes: [n]"
```

---

## Arquivos (o que cada um faz)
| Arquivo | Papel |
|---|---|
| `docker-compose.yml` | Sobe o PostgreSQL 17 com pgvector no Docker (porta 5433) |
| `db/001_schema.sql` | Liga o pgvector, cria a tabela `chunks` e a função `buscar_chunks` |
| `db/002_demo_barba.sql` | Exemplo didático com vetores de 2 números |
| `dados/curriculo.md` | Currículo limpo e público (é o que o RAG "sabe") |
| `scripts/ingerir.ts` | Fase 1: chunking + embeddings + gravação (com transação) |
| `src/rag.ts` | Fase 2: as 3 funções do RAG (vetor da pergunta, busca, geração) |
| `scripts/perguntar.ts` | Pergunta pelo terminal |
| `scripts/servidor.ts` + `web/index.html` | Interface web local em http://localhost:3333 |
| `scripts/buscar.ts` | Testa só a busca, sem o modelo |
| `scripts/avaliar.ts` | Evals: mede a busca e a honestidade das respostas |
| `NOTAS-DA-CRIACAO.md` | Diário de cada parte com as decisões |

---

## Decisões técnicas (e por quê) — o que mais cai em entrevista
| Decisão | Por quê | Alternativa descartada |
|---|---|---|
| **pgvector no PostgreSQL** | É o banco que já uso; busca vetorial vira SQL normal; Supabase tem igual | Pinecone/Qdrant: mais um serviço e outra conta |
| **Docker pro banco local** | Banco isolado, não mexe no Postgres da Limper; mesmo SQL do Supabase | Instalar pgvector no Postgres do Windows |
| **Chunk por seção** | O currículo já é dividido por assunto | Tamanho fixo: cortaria "Experiência" no meio (usaria em texto sem estrutura, tipo conversas) |
| **Cabeçalho de contexto em cada chunk** | Um pedaço solto não diz de quem é nem de onde veio; com o cabeçalho, o vetor carrega esse contexto | Chunk "cru" |
| **`input_type` document vs query** | O modelo de embedding otimiza diferente o que é procurado e o que procura | Usar o mesmo tipo pros dois |
| **Mesmo modelo de embedding nos dois lados** | Vetores de modelos diferentes não se comparam (são "mapas" diferentes) | — |
| **5 trechos (k=5)** | Documento pequeno; 5 cobre sem encher o prompt | k=1 (pode faltar), k=20 (caro e confunde) |
| **Transação + delete antes de inserir** | Rodar 2x não duplica; erro no meio não deixa o banco pela metade | Inserir direto |
| **Prompt com regras + "Não encontrei"** | Segura a alucinação; melhor dizer que não sabe do que inventar experiência | Deixar o modelo livre |
| **`temperature: 0`** | Menos criatividade = menos invenção | Valor padrão |
| **Pergunta antes e depois dos trechos** | Modelos pequenos esquecem o começo de textos longos | Pergunta só no fim |
| **Modelo local (Ollama) agora, Claude depois** | Custo zero pra aprender; a troca é só a função `gerarResposta` | Pagar a API já |
| **Evals separados: busca e resposta** | Se der errado, sei qual metade falhou | Testar só "a resposta parece boa" |

---

## Resultados medidos (evals) — `npm run avaliar`
- **Busca:** a seção certa veio em **1º lugar em 10/10** perguntas (100%).
- **Honestidade:** perguntas fora do currículo ("bolo de chocolate", "certificação AWS") → **2/2** responderam "Não encontrei".
- **Tempo:** ~30–90 s por resposta com o modelo local no processador (sem placa de vídeo).

## O que deu errado e como resolvi (ótimo pra entrevista: mostra que eu testo)
1. **Modelo pequeno literal demais.** Com o `qwen2.5:3b`, a busca trazia o trecho certo da Limper, mas o modelo dizia "não encontrei", porque procurava a palavra "otimizou", que não aparece no texto.
   - Tentei melhorar o prompt (ler pelo significado; repetir a pergunta no fim) → **não resolveu**.
   - Troquei pro `qwen2.5:7b` → **resolveu**.
   - **Lição:** RAG tem duas metades. Medindo separado, vi que a busca estava 100% e o problema era o modelo.
2. **Limite da conta grátis da Voyage** (3 requisições/minuto) → no eval, mandei todas as perguntas numa chamada só (a API aceita lista).
3. **Números de similaridade baixos** (0,3–0,6) com vetores reais → o que importa é a **ordem**, não o valor absoluto.

## Próximos passos (se perguntarem "o que você melhoraria?")
- Trocar o modelo local pelo **Claude** (resposta em segundos e melhor qualidade) e publicar online.
- Usar o recurso nativo de **citações** da API do Claude em vez de pedir no prompt.
- **Busca híbrida** (vetor + palavra-chave) pra termos exatos como siglas.
- **Limite mínimo de similaridade** calibrado pelos evals, pra nem chamar o modelo quando nada é relevante.
- Quando "não encontrei", não listar fontes (hoje ele lista todas).
- Mais casos no eval (20–50) e rodar no GitHub Actions a cada mudança.

## Perguntas que podem fazer, com resposta curta
- **O que é RAG?** Buscar trechos relevantes e passar pro modelo junto com a pergunta, pra ele responder com dados que não conhece, sem retreinar.
- **O que é embedding?** Um vetor que representa o significado do texto; textos parecidos ficam perto.
- **Por que cosseno?** Mede se os vetores apontam pra mesma direção, independente do tamanho; é o padrão pra embeddings de texto.
- **Quando você criaria índice?** Com dezenas de milhares de linhas: índice HNSW (`vector_cosine_ops`). Com 12 linhas, comparar com todas é instantâneo.
- **Como evitou alucinação?** Regras no prompt, temperatura 0, "não encontrei" como resposta válida, citação obrigatória e evals medindo isso.
- **Como sabe que funciona?** Evals: 10 perguntas com a seção esperada (busca) e 2 fora do currículo (honestidade).
