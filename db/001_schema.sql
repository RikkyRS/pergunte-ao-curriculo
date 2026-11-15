-- =====================================================================
-- Parte 1 do RAG: onde os pedaços (chunks) do currículo e seus vetores moram
-- =====================================================================

-- 1) Liga a extensão pgvector: ela cria o tipo de coluna "vector"
--    e os operadores de distância (<=> é a distância de cosseno).
create extension if not exists vector;

-- 2) Cada linha = um pedaço do currículo + o vetor que representa o significado dele.
create table if not exists chunks (
  id         bigserial primary key,
  fonte      text not null,          -- de qual arquivo veio: 'curriculo.pdf', 'cases/limper.md'
  secao      text,                   -- de qual seção: 'Experiência', 'Projetos'...
  conteudo   text not null,          -- o texto do pedaço (é isso que vai pro prompt)
  embedding  vector(1024) not null,  -- 1024 números = tamanho do vetor do modelo voyage-3.5
  criado_em  timestamptz not null default now()
);

-- 3) A busca: recebe o vetor da pergunta e devolve os pedaços mais parecidos.
--    <=> = distância de cosseno (0 = igual, 2 = oposto).
--    1 - distância = similaridade (1 = igual, perto de 0 = nada a ver).
create or replace function buscar_chunks(pergunta vector(1024), qtd int default 5)
returns table (id bigint, fonte text, secao text, conteudo text, similaridade float)
language sql stable
as $$
  select c.id, c.fonte, c.secao, c.conteudo,
         1 - (c.embedding <=> pergunta) as similaridade
  from chunks c
  order by c.embedding <=> pergunta   -- do mais parecido pro menos parecido
  limit qtd;
$$;

-- Obs: com poucas linhas (um currículo tem ~20 pedaços) o Postgres compara com todas
-- e é instantâneo. Com dezenas de milhares, criaríamos um índice HNSW:
--   create index on chunks using hnsw (embedding vector_cosine_ops);
