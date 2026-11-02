// Atualização por arquivo: o que a tela conversa com o processo principal
// (electron/main.js e electron/updatePackage.js).

export type UpdateErrorCode =
  | "assinatura"
  | "integridade"
  | "nao_e_pacote"
  | "nao_lido"
  | "mesma_versao"
  | "versao_antiga"
  | "ocupado"
  | "nao_preparado"
  | "instalador_bloqueado"
  | "cancelado";

export type UpdatePrepareResult =
  | { ok: true; version: string; currentVersion: string }
  | { ok: false; erro: UpdateErrorCode; version?: string; currentVersion?: string };

export interface ElectronUpdatesAPI {
  info: () => Promise<{ version: string }>;
  prepare: (file: File) => Promise<UpdatePrepareResult>;
  choose: () => Promise<UpdatePrepareResult>;
  discard: () => Promise<{ ok: boolean }>;
  install: () => Promise<{ ok: boolean; erro?: UpdateErrorCode }>;
  onProgress: (callback: (percent: number) => void) => () => void;
}

/** O que dizer em cada recusa: o que aconteceu e o que fazer. */
export function updateErrorMessage(erro: UpdateErrorCode, version?: string, currentVersion?: string): string {
  switch (erro) {
    case "assinatura":
      return "Este arquivo não tem a assinatura do OMNI4. Não instale e avise quem enviou.";
    case "integridade":
      return "O arquivo chegou incompleto ou foi alterado. Baixe de novo e tente outra vez.";
    case "nao_e_pacote":
      return "Este não é um arquivo de atualização do OMNI4. Procure o que termina em .omni4update.";
    case "nao_lido":
      return "Não foi possível ler o arquivo. Copie-o para uma pasta do computador e tente de novo.";
    case "mesma_versao":
      return `Este arquivo é da versão ${version}, que você já tem instalada.`;
    case "versao_antiga":
      return `Este arquivo é da versão ${version}, mais antiga que a sua (${currentVersion}). Voltar de versão não é permitido, para proteger seus dados.`;
    case "ocupado":
      return "Outro arquivo ainda está sendo conferido. Aguarde e tente de novo.";
    case "nao_preparado":
      return "A atualização não está mais pronta. Arraste o arquivo de novo.";
    case "instalador_bloqueado":
      return "O Windows não deixou o instalador iniciar. Peça à TI para liberar o OMNI4 ou rode o instalador .exe.";
    default:
      return "Não foi possível concluir a atualização.";
  }
}
