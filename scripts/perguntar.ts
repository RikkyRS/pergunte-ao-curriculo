// Uso:  npm run perguntar -- "ele já trabalhou com PostgreSQL?"
import { perguntar } from "../src/rag.ts";

const pergunta = process.argv.slice(2).join(" ");
if (!pergunta) {
  console.error('Uso: npm run perguntar -- "sua pergunta"');
  process.exit(1);
}

const { resposta, trechos, segundos } = await perguntar(pergunta);
console.log(`\n❓ ${pergunta}\n\n💬 ${resposta}\n`);
console.log("📚 Trechos que a busca entregou ao modelo:");
trechos.forEach((t, i) => console.log(`   [${i + 1}] ${t.similaridade.toFixed(3)}  ${t.secao}`));
console.log(`\n⏱️  ${segundos.toFixed(1)}s`);
