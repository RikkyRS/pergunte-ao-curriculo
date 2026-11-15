// =====================================================================
// Parte 2 do RAG: INGESTÃO
// Lê os arquivos de dados/ → corta em pedaços por seção → gera o embedding
// de cada pedaço na Voyage AI → salva tudo na tabela chunks.
//
// Rodar:  npm run ingerir
// Roda de novo sempre que o currículo mudar (ele apaga e recria os pedaços).
// =====================================================================
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const PASTA_DADOS = "dados";
const MODELO_EMBEDDING = "voyage-3.5"; // devolve vetores de 1024 números (bate com vector(1024))

type Chunk = { fonte: string; secao: string; conteudo: string };

// ---------------------------------------------------------------------
// 1) CHUNKING: cortar o markdown em pedaços, um por seção "## Título"
// ---------------------------------------------------------------------
function cortarPorSecao(fonte: string, markdown: string): Chunk[] {
  const linhas = markdown.split(/\r?\n/);
  const tituloDoc = (linhas.find((l) => l.startsWith("# ")) ?? fonte).replace(/^#\s+/, "");

  const chunks: Chunk[] = [];
  let secaoAtual = "";
  let corpo: string[] = [];

  const fecharSecao = () => {
    const texto = corpo.join("\n").trim();
    if (secaoAtual && texto) {
      chunks.push({
        fonte,
        secao: secaoAtual,
        // Cabeçalho de contexto: o pedaço "sabe" de quem é e de que seção veio.
        // Sem isso, um pedaço "Eliminou consultas N+1..." não diz de quem nem onde.
        conteudo: `${tituloDoc}\nSeção: ${secaoAtual}\n\n${texto}`,
      });
    }
    corpo = [];
  };

  for (const linha of linhas) {
    if (linha.startsWith("## ")) {
      fecharSecao();
      secaoAtual = linha.replace(/^##\s+/, "").trim();
    } else if (!linha.startsWith("# ")) {
      corpo.push(linha);
    }
  }
  fecharSecao();
  return chunks;
}

// ---------------------------------------------------------------------
// 2) EMBEDDINGS: mandar os textos pra Voyage e receber os vetores
// ---------------------------------------------------------------------
async function gerarEmbeddings(textos: string[]): Promise<number[][]> {
  const resposta = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: textos,
      model: MODELO_EMBEDDING,
      // "document" = isto é conteúdo pra ser ENCONTRADO.
      // Na hora da pergunta usaremos "query". O modelo otimiza cada lado
      // de um jeito, e isso melhora a busca.
      input_type: "document",
    }),
  });
  if (!resposta.ok) {
    throw new Error(`Voyage respondeu ${resposta.status}: ${await resposta.text()}`);
  }
  const json = (await resposta.json()) as {
    data: { index: number; embedding: number[] }[];
    usage: { total_tokens: number };
  };
  console.log(`   Voyage: ${json.usage.total_tokens} tokens usados`);
  // A API devolve com "index"; ordenamos pra garantir que vetor[i] é do texto[i]
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// ---------------------------------------------------------------------
// 3) SALVAR no Postgres
// ---------------------------------------------------------------------
async function main() {
  if (!process.env.VOYAGE_API_KEY) throw new Error("Falta VOYAGE_API_KEY no .env");

  const arquivos = (await readdir(PASTA_DADOS)).filter((a) => a.endsWith(".md"));
  const todos: Chunk[] = [];
  for (const arquivo of arquivos) {
    const md = await readFile(join(PASTA_DADOS, arquivo), "utf8");
    const pedacos = cortarPorSecao(arquivo, md);
    console.log(`📄 ${arquivo}: ${pedacos.length} pedaços`);
    todos.push(...pedacos);
  }

  console.log(`\n🧠 Gerando ${todos.length} embeddings...`);
  const vetores = await gerarEmbeddings(todos.map((c) => c.conteudo));

  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query("begin");
    // Apaga os pedaços antigos desses arquivos: rodar 2x não duplica nada (idempotente)
    await db.query("delete from chunks where fonte = any($1)", [arquivos]);
    for (let i = 0; i < todos.length; i++) {
      const c = todos[i];
      await db.query(
        "insert into chunks (fonte, secao, conteudo, embedding) values ($1, $2, $3, $4::vector)",
        [c.fonte, c.secao, c.conteudo, JSON.stringify(vetores[i])], // pgvector aceita o texto "[0.1,0.2,...]"
      );
    }
    await db.query("commit");
  } catch (erro) {
    await db.query("rollback"); // se der erro no meio, não deixa o banco pela metade
    throw erro;
  } finally {
    await db.end();
  }
  console.log(`\n✅ ${todos.length} pedaços salvos na tabela chunks`);
}

main().catch((erro) => {
  console.error("❌", erro.message);
  process.exit(1);
});
