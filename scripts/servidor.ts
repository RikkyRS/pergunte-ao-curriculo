// Interface web local: npm run web  →  abre http://localhost:3333
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { perguntar } from "../src/rag.ts";

const PORTA = 3333;

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(await readFile("web/index.html"));
    }
    if (req.method === "POST" && req.url === "/api/perguntar") {
      let corpo = "";
      for await (const pedaco of req) {
        corpo += pedaco;
        if (corpo.length > 2000) throw new Error("Pergunta grande demais.");
      }
      const { pergunta } = JSON.parse(corpo) as { pergunta?: string };
      if (!pergunta?.trim()) throw new Error("Escreva uma pergunta.");
      const resultado = await perguntar(pergunta.trim().slice(0, 300));
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(resultado));
    }
    res.writeHead(404).end();
  } catch (erro) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ erro: (erro as Error).message }));
  }
}).listen(PORTA, () => console.log(`🌐 Abra http://localhost:${PORTA}`));
