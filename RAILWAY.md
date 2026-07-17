# Deploy Railway

## Variaveis obrigatorias

Configure estas variaveis no projeto Railway `Sistema OS`:

```env
DATABASE_URL=mysql://usuario:senha@host:3306/sistemas_os
JWT_SECRET=um-segredo-longo-e-aleatorio
JWT_TTL=12h
NODE_ENV=production
APP_URL=https://os.luthieriabrasilia.com.br
GMAIL_USER=seuemail@gmail.com
GMAIL_APP_PASSWORD=senha-de-app-do-google
MAIL_FROM="Sistema OS <seuemail@gmail.com>"
```

Para o Gmail, ative a verificação em duas etapas da conta e crie uma **senha de app**. Não use a senha normal do Google.

`PORT` deve ser fornecida pela Railway automaticamente. Nao fixe `PORT` nas variaveis do projeto, a menos que a Railway solicite.

## Healthchecks

- `/api/health`: confirma que o servidor subiu.
- `/api/health/db`: confirma conexao com MySQL.

Use `/api/health` como healthcheck do deploy, porque ele nao derruba o container se o banco estiver temporariamente indisponivel.

## Comandos

O arquivo `railway.json` fixa:

- Build: `npm ci && npm run build`
- Start: `npm start`

Isso evita que a Railway tente iniciar apenas o Vite ou use um comando inferido incorreto.
