// =====================================================================
// Parte 5: EVALS — medir se o RAG funciona, com números.
// Uso: npm run avaliar
//
// Avalia as duas metades do RAG separadamente:
//   A) BUSCA: a seção certa veio em 1º lugar? E entre os 3 primeiros?
//   B) RESPOSTA: quando a pergunta está fora do currículo, o modelo diz que não sabe?
// =====================================================================
import { buscarTrechos, gerarResposta } from "../src/rag.ts";

// Cada caso: pergunta + a seção que DEVERIA aparecer no topo.
const CASOS_BUSCA: { pergunta: string; secaoEsperada: string }[] = [
  { pergunta: "Ele já otimizou consultas de banco de dados?", secaoEsperada: "Experiência: Desenvolvedor Full Stack Freelancer" },
  { pergunta: "Tem experiência com agentes de inteligência artificial?", secaoEsperada: "Experiência: Gestor de IA" },
  { pergunta: "Onde ele estudou?", secaoEsperada: "Formação" },
  { pergunta: "Ele sabe escrever testes automatizados?", secaoEsperada: "Projeto: JARVIS" },
  { pergunta: "Já fez algum CRM?", secaoEsperada: "Projeto: Pipeline CRM" },
  { pergunta: "Trabalhou com geolocalização ou mapas?", secaoEsperada: "Projeto: Site Barber House" },
  { pergunta: "O que ele fazia antes de programar?", secaoEsperada: "Experiência: Indústria" },
  { pergunta: "Qual o nível de inglês dele?", secaoEsperada: "Habilidades técnicas" },
  { pergunta: "Que tipo de vaga ele procura?", secaoEsperada: "Objetivo" },
  { pergunta: "Já integrou com Mercado Livre ou OLX?", secaoEsperada: "Experiência: Gestor de IA" },
];

// Perguntas cuja resposta NÃO está no currículo: o certo é dizer "Não encontrei".
const CASOS_FORA = ["Ele sabe fazer bolo de chocolate?", "Ele tem certificação AWS?"];

// Uma chamada só pra Voyage com todas as perguntas (conta grátis = 3 requisições/min)
async function vetores(textos: string[]): Promise<number[][]> {
  const r = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: textos, model: "voyage-3.5", input_type: "query" }),
  });
  if (!r.ok) throw new Error(`Voyage ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { data: { index: number; embedding: number[] }[] };
  return j.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

const todas = [...CASOS_BUSCA.map((c) => c.pergunta), ...CASOS_FORA];
const vs = await vetores(todas);

// ---------------- A) BUSCA ----------------
console.log("A) BUSCA — a seção certa veio no topo?\n");
let top1 = 0, top3 = 0;
for (const [i, caso] of CASOS_BUSCA.entries()) {
  const trechos = await buscarTrechos(vs[i]);
  const pos = trechos.findIndex((t) => t.secao.startsWith(caso.secaoEsperada));
  if (pos === 0) top1++;
  if (pos >= 0 && pos < 3) top3++;
  const marca = pos === 0 ? "✅" : pos > 0 && pos < 3 ? "🟡" : "❌";
  console.log(`${marca} ${caso.pergunta}\n     esperado: ${caso.secaoEsperada} | veio em ${pos >= 0 ? pos + 1 + "º" : "nenhum"} | 1º foi: ${trechos[0].secao}`);
}
const n = CASOS_BUSCA.length;
console.log(`\n   Acerto no 1º lugar: ${top1}/${n} (${Math.round((top1 / n) * 100)}%)`);
console.log(`   Acerto entre os 3 primeiros: ${top3}/${n} (${Math.round((top3 / n) * 100)}%)\n`);

// ---------------- B) RESPOSTA ----------------
console.log("B) RESPOSTA — fora do currículo, o modelo admite que não sabe?\n");
let honestas = 0;
for (const [j, pergunta] of CASOS_FORA.entries()) {
  const trechos = await buscarTrechos(vs[CASOS_BUSCA.length + j]);
  const resposta = await gerarResposta(pergunta, trechos);
  const ok = /não encontrei/i.test(resposta);
  if (ok) honestas++;
  console.log(`${ok ? "✅" : "❌"} ${pergunta}\n     resposta: ${resposta.replace(/\s+/g, " ").slice(0, 160)}`);
}
console.log(`\n   Respostas honestas: ${honestas}/${CASOS_FORA.length}`);
