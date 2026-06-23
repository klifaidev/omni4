# OMNI4 Embedded AI Runtime

Esta pasta e empacotada junto do instalador pelo electron-builder.

Para ativar a LLM embutida, coloque aqui:

- `manifest.json`
- o executavel local de inferencia, por exemplo `bin/llama-cli.exe`
- o modelo quantizado, por exemplo `models/omni-small.gguf`

O usuario final nao precisa baixar nada separado quando esses arquivos estiverem presentes no instalador.

Exemplo de `manifest.json`:

```json
{
  "engine": "llama.cpp",
  "modelName": "OMNI Local Small",
  "binaryWin": "bin/llama-cli.exe",
  "model": "models/omni-small.gguf",
  "timeoutMs": 90000,
  "args": [
    "-m",
    "{model}",
    "-f",
    "{promptFile}",
    "-n",
    "700",
    "--temp",
    "0.2",
    "--ctx-size",
    "8192",
    "--no-display-prompt"
  ]
}
```

