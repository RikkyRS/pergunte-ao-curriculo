// =====================================================================
// O RAG inteiro em 3 funções:
//   1. vetorDaPergunta()  → a pergunta vira vetor (Voyage, input_type "query")
//   2. buscarTrechos()    → o banco devolve os pedaços mais parecidos (pgvector)
//   3. gerarResposta()    → um modelo de linguagem escreve a resposta com base neles
//
// Hoje o passo 3 usa o Ollama (modelo local, grátis). Pra trocar pelo Claude,
// só esta função muda: o resto do RAG continua igual.
// =====================================================================
import pg from "pg";

export type Trecho = { fonte: string; secao: string; conteudo: string; similaridade: number };

const MODELO_LOCAL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
const QTD_TRECHOS = 5;

// ---------------------------------------------------------------------
// 1) Pergunta → vetor
// ---------------------------------------------------------------------
export async function vetorDaPergunta(pergunta: string): Promise<number[]> {
  const r = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    // "query": é algo que PROCURA (na ingestão usamos "document")
    body: JSON.stringify({ input: [pergunta], model: "voyage-3.5", input_type: "query" }),
  });
  if (r.status === 429) throw new Error("Limite da Voyage (3 perguntas/min na conta grátis). Espere uns segundos.");
  if (!r.ok) throw new Error(`Voyage ${r.status}: ${await r.text()}`);
  return ((await r.json()) as { data: { embedding: number[] }[] }).data[0].embedding;
}

// ---------------------------------------------------------------------
// 2) Vetor → trechos mais parecidos
// ---------------------------------------------------------------------
export async function buscarTrechos(vetor: number[]): Promise<Trecho[]> {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query(
      "select fonte, secao, conteudo, similaridade from buscar_chunks($1::vector, $2)",
      [JSON.stringify(vetor), QTD_TRECHOS],
    );
    return rows;
  } finally {
    await db.end();
  }
}

// ---------------------------------------------------------------------
// 3) Trechos + pergunta → resposta (o "G" do RAG)
// ---------------------------------------------------------------------
// O prompt é a parte que segura a alucinação: regras claras + trechos numerados.
export function montarPrompt(pergunta: string, trechos: Trecho[]) {
  const sistema = [
    "Você responde perguntas de recrutadores sobre a carreira do Henrique Otta Rodrigues.",
    "Regras:",
    "1. Use APENAS as informações dos trechos fornecidos. Não use conhecimento próprio.",
    "2. Os trechos podem descrever a mesma coisa com palavras diferentes da pergunta. Leia pelo significado, não pela palavra exata.",
    '3. Só se NENHUM trecho tiver relação com a pergunta, responda exatamente: "Não encontrei isso no currículo do Henrique."',
    "4. Não invente datas, empresas, tecnologias nem números.",
    "5. Responda em português, em no máximo 4 frases, falando do Henrique na terceira pessoa.",
    "6. No final, escreva 'Fontes:' e os números dos trechos usados, ex: Fontes: [1], [3].",
  ].join("\n");

  const contexto = trechos
    .map((t, i) => `[${i + 1}] (${t.fonte} – ${t.secao})\n${t.conteudo}`)
    .join("\n\n");

  // A pergunta vai antes E depois dos trechos: modelos pequenos "esquecem" o que
  // leram no começo quando o texto é longo, então repetir no fim ajuda.
  const usuario =
    `Pergunta: ${pergunta}\n\n<trechos>\n${contexto}\n</trechos>\n\n` +
    `Primeiro identifique qual trecho fala do assunto da pergunta, depois responda.\nPergunta: ${pergunta}`;
  return { sistema, usuario };
}

export async function gerarResposta(pergunta: string, trechos: Trecho[]): Promise<string> {
  const { sistema, usuario } = montarPrompt(pergunta, trechos);
  const r = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO_LOCAL,
      stream: false,
      options: { temperature: 0 }, // 0 = menos "criatividade", menos invenção
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: usuario },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${await r.text()} (o Ollama está aberto?)`);
  return ((await r.json()) as { message: { content: string } }).message.content.trim();
}

// ---------------------------------------------------------------------
// O fluxo completo
// ---------------------------------------------------------------------
export async function perguntar(pergunta: string) {
  const inicio = Date.now();
  const vetor = await vetorDaPergunta(pergunta);
  const trechos = await buscarTrechos(vetor);
  const resposta = await gerarResposta(pergunta, trechos);
  return { resposta, trechos, segundos: (Date.now() - inicio) / 1000 };
}
