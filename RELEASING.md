# Como publicar uma nova versão do OMNI4

## Pré-requisitos
1. Ter o repositório no GitHub com o workflow configurado
2. Criar um Personal Access Token no GitHub com permissão de "repo"
3. Adicionar o token como secret `GH_TOKEN` no repositório GitHub
   (Settings → Secrets and variables → Actions → New repository secret)
4. Atualizar `owner` e `repo` em:
   - `package.json` → campo `build.publish`
   - `electron/app-update.yml`

## Publicar atualização

Patch (correção de bug, ex: 1.0.0 → 1.0.1):
```
npm run release:patch
```

Minor (nova funcionalidade, ex: 1.0.0 → 1.1.0):
```
npm run release:minor
```

Major (mudança grande, ex: 1.0.0 → 2.0.0):
```
npm run release:major
```

## O que acontece automaticamente
1. O script atualiza a versão no `package.json`
2. Cria um commit e uma tag Git (ex: `v1.0.1`)
3. Faz push para o GitHub
4. O GitHub Actions detecta a tag e inicia o build (`windows-latest`)
5. Em ~5 minutos, o instalador `.exe` é publicado no GitHub Releases
6. Os apps instalados verificam a atualização na próxima abertura
7. O usuário vê a notificação de update e clica "Reiniciar e atualizar"

## Verificar o status do build
Acessar: `github.com/SEU_USUARIO/SEU_REPO/actions`

## Estrutura de arquivos gerados no GitHub Release
```
OMNI4 Pricing Analytics Setup X.Y.Z.exe       ← instalador
OMNI4 Pricing Analytics Setup X.Y.Z.exe.blockmap
latest.yml                                      ← usado pelo auto-updater
```
