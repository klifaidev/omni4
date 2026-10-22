// Leitura do cache de bases processadas sem montar os objetos no processo
// principal.
//
// O envelope é gravado pelo próprio app (bases:processed-save) com
// JSON.stringify de { version, cacheKind, signature, savedAt, payload }, nessa
// ordem. Antes, o main fazia JSON.parse do arquivo inteiro (dezenas de MB) e
// o IPC ainda clonava objeto por objeto até a tela. Medido com as bases reais
// de um usuário, isso era a maior parte dos ~28 s de abertura e travava o
// processo principal. Agora o main lê só o cabeçalho (o trecho antes de
// "payload"), valida como antes e devolve o payload como texto: clonar uma
// string é quase de graça, e a tela faz um único JSON.parse.
//
// Dentro de uma string JSON as aspas são sempre escapadas (\"), então a
// sequência ,"payload": só aparece como a chave do envelope. Qualquer arquivo
// fora desse formato devolve null e cai no caminho de "cache inválido"
// (a base é reprocessada a partir do arquivo original, como já acontecia).
"use strict";

const PAYLOAD_MARKER = ',"payload":';

/**
 * @param {string} text conteúdo do arquivo de cache
 * @returns {{ header: { version?: unknown, cacheKind?: unknown, signature?: unknown }, payloadText: string } | null}
 */
function splitProcessedEnvelope(text) {
  if (typeof text !== "string" || text.length < 2) return null;
  const at = text.indexOf(PAYLOAD_MARKER);
  if (at <= 0) return null;
  const body = text.trimEnd();
  if (!body.endsWith("}")) return null;
  let header;
  try {
    header = JSON.parse(`${text.slice(0, at)}}`);
  } catch {
    return null;
  }
  if (!header || typeof header !== "object") return null;
  const payloadText = body.slice(at + PAYLOAD_MARKER.length, body.length - 1);
  if (!payloadText) return null;
  return { header, payloadText };
}

module.exports = { splitProcessedEnvelope };
