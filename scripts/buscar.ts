// =====================================================================
// Teste da BUSCA (o "R" do RAG), ainda sem o Claude.
// Uso:  npm run buscar -- "ele já otimizou banco de dados?"
// =====================================================================
import pg from "pg";

const pergunta = process.argv.slice(2).join(" ");
if (!pergunta) {
  console.error('Uso: npm run buscar -- "sua pergunta"');
  process.exit(1);
}

// 1) A pergunta vira vetor, com o MESMO modelo dos documentos,
//    mas com input_type "query" (é algo que PROCURA, não que é procurado).
const resposta = await fetch("https://api.voyageai.com/v1/embeddings", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ input: [pergunta], model: "voyage-3.5", input_type: "query" }),
});
if (!resposta.ok) throw new Error(`Voyage ${resposta.status}: ${await resposta.text()}`);
const vetor = ((await resposta.json()) as { data: { embedding: number[] }[] }).data[0].embedding;

// 2) O banco devolve os 5 pedaços mais parecidos (função criada na Parte 1)
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const { rows } = await db.query(
  "select secao, similaridade from buscar_chunks($1::vector, 5)",
  [JSON.stringify(vetor)],
);
await db.end();

console.log(`\n❓ ${pergunta}\n`);
for (const [i, r] of rows.entries()) {
  const barra = "█".repeat(Math.round(r.similaridade * 30));
  console.log(`${i + 1}. ${r.similaridade.toFixed(3)} ${barra}  ${r.secao}`);
}
