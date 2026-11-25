# BRIDEx 💍

Planejador de casamento para noivos e assessoras.

Um site privado para organizar o casamento no lugar das planilhas de Excel. Funciona no computador, no tablet e no celular, e o casal pode usar ao mesmo tempo.

## Como iniciar

1. Dê **dois cliques em `iniciar.bat`**. Uma janela preta vai abrir. É o servidor, então deixe ela aberta enquanto usa o site.
2. O navegador abre em `http://localhost:3000`.
3. **No primeiro acesso**, crie a conta de vocês. O site pede um **código de configuração**, que aparece na janela preta. Isso garante que só quem tem acesso ao computador consegue criar a primeira conta.
4. Depois, em **Configurações → Quem tem acesso**, crie o login do seu par (ou da assessoria).

> Precisa do [Node.js](https://nodejs.org) 22.13 ou mais novo. Se o `iniciar.bat` disser que ele não está instalado, baixe a versão LTS.
> Pelo terminal também funciona: `npm start`.

### Usar no celular ou tablet

Com o computador ligado e o servidor aberto, conecte o celular **na mesma rede Wi-Fi** e abra o endereço que aparece na janela preta como "Celular / tablet" (algo como `http://192.168.0.10:3000`).
No celular, use **"Adicionar à tela de início"** para abrir o site como se fosse um aplicativo.

> Se o celular não conseguir abrir o site, o Firewall do Windows pode estar bloqueando. Na primeira execução, aceite o aviso "Permitir acesso" para redes privadas.

## O que tem no site

| Seção | Para que serve |
|---|---|
| **Visão geral** | Contagem regressiva, resumo de tarefas, orçamento, presenças e fornecedores. Mostra também as próximas tarefas e os pagamentos que estão chegando, os detalhes do casamento (locais, estilo, paleta de cores), as categorias que ainda faltam contratar e as notas fixadas. |
| **Tarefas** | Checklist com mais de 45 tarefas sugeridas, organizadas por período (12 meses antes, 9 meses antes e assim por diante). Os prazos são calculados a partir da data do casamento. Tem responsável, alerta de atraso e filtros. |
| **Fornecedores** | Status de cada um (pesquisando, orçamento recebido, negociando, contratado ou descartado), valor, contatos com botão direto de WhatsApp, Instagram e site, e avaliação. Cada fornecedor tem uma ficha com **parcelas** (com gerador automático), **cópia do contrato e arquivos**, o que está incluso e observações. |
| **Orçamento** | Orçamento total e o que foi planejado, contratado e pago em cada categoria. Um botão **sugere a distribuição** com percentuais típicos de casamentos no Brasil. A aba **Pagamentos** agrupa por mês e mostra o que está atrasado. |
| **Convidados** | Lado (de cada noivo ou dos dois), grupo, adultos e crianças, confirmação de presença (RSVP), restrições alimentares, endereço e convite entregue. Dá para **importar colando direto do Excel** e exportar para o Excel. |
| **Mesas** | Mapa de mesas com a lotação de cada uma. Você distribui os convidados que ainda estão sem mesa, e um botão cria várias mesas de uma vez. |
| **Cronograma do dia** | Roteiro do grande dia com horário, local e responsável. Já vem um modelo sugerido e dá para **imprimir** e entregar aos fornecedores. |
| **Documentos** | Contratos, orçamentos, comprovantes, documentos e fotos de inspiração, com galeria para imagens. No computador, é só arrastar e soltar os arquivos. |
| **Anotações** | Notas coloridas para reuniões, ideias e votos. Dá para fixar uma nota na visão geral. |
| **Presentes** | Quem deu o quê, com controle de agradecimentos enviados. |
| **Configurações** | Detalhes do casamento, troca de senha, usuários, dispositivos conectados, tema claro ou escuro e backup. |

## Finanças

Ao entrar, os noivos caem na área de **Finanças** (visual claro, pensado para o celular). O casamento continua igual, no coração do canto superior ou em **Mais › Casamento**; do casamento, volta-se pelo item **Finanças** do menu.

- **Contas** (banco, carteira, poupança, investimento, vale) com saldo; **transferências** entre elas.
- **Receitas e despesas** com categoria, conta ou cartão, "de onde vem / para onde vai", situação (pago/pendente) e **parcelamento**.
- **Fixos**: salário e outras rendas, aluguel, contas, assinaturas (todo mês, a cada X meses ou anual). Aparecem como previstos e são confirmados em um toque; lançar à mão com o mesmo nome também conta.
- **Cartões** com dia de fechamento e vencimento: cada compra e parcela cai na fatura certa; limite usado; pagar a fatura debita a conta.
- **Orçamento** (limite por categoria), **metas**, **relatórios** (12 meses, saldo previsto, categorias, fixos x variáveis, para onde vai) e **exportação em CSV**.
- **Do casal**: cada noivo(a) tem as próprias finanças e pode liberar (Mais › Ajustes) para o par ver, só leitura, na visão "Do casal". Família e assessoria não têm acesso.
- As **parcelas dos fornecedores** do casamento entram sozinhas como despesas da categoria "Casamento", **só com a parte de cada um**: no fornecedor, **Quem paga** marca os noivos que dividem (por padrão, os dois) e outras pessoas (ex.: "Pais da noiva"), em partes iguais. O Orçamento mostra **quanto cada um paga** (contratado, pago e quanto falta). Em Finanças › Ajustes, cada um escolhe qual dos noivos é.

## Segurança

- Senhas guardadas com **scrypt** (criptografia própria para senhas). Elas nunca ficam salvas em texto.
- **Bloqueio por 15 minutos** depois de 5 senhas erradas seguidas, além de um limite de tentativas por endereço.
- Sessão em cookie **HttpOnly + SameSite=Strict**, com **token anti-CSRF** e checagem de origem em todas as alterações.
- Política de segurança de conteúdo (CSP) rígida contra injeção de scripts. Tudo que você digita passa por escape antes de aparecer na tela.
- Arquivos enviados ficam **fora da pasta pública** e só abrem para quem está logado. Formatos perigosos, como SVG e executáveis, são recusados.
- Ao trocar a senha, os outros dispositivos são desconectados. Também dá para desconectar tudo manualmente em Configurações.

## Onde ficam os dados e como fazer backup

Tudo fica na pasta **`data/`**:
- `casamento.db`: o banco de dados (SQLite)
- `uploads/`: os arquivos enviados (contratos, fotos…)

**Backup:** copie a pasta `data/` inteira para outro lugar de vez em quando. Em Configurações também dá para baixar um backup em JSON (só os dados, sem os arquivos).

> Esta pasta está dentro do OneDrive, então ele sincroniza a pasta `data` e isso já serve como backup. Só não rode o servidor em **dois computadores ao mesmo tempo** apontando para a mesma pasta sincronizada.

## Colocar na internet com o Easypanel

> A Vercel **não serve** para hospedar este site: ela não guarda arquivos de forma permanente, então o banco e os contratos se perderiam. Mas você pode **manter o domínio comprado na Vercel** e apontá-lo para a VPS onde o Easypanel está instalado.

O projeto já vem com um `Dockerfile`, então o Easypanel monta e roda o site sozinho.

**1. Coloque o código num repositório privado do GitHub.** O Easypanel busca o código de lá, e cada atualização no GitHub pode ser publicada com um clique. A pasta `data/` fica de fora do repositório (está no `.gitignore`), então seus dados locais não sobem.

**2. No Easypanel, crie o app.**
1. Crie um projeto (ex.: `casamento`) e, dentro dele, **+ Service → App** (ex.: `site`).
2. **Source:** escolha *GitHub* e selecione o repositório, branch `main`.
3. **Build:** escolha **Dockerfile** (caminho `Dockerfile`).
4. **Mounts → Add Volume Mount:** nome `data`, caminho de montagem **`/data`**. ⚠️ Esse passo é essencial: é aqui que ficam o banco e os contratos. Sem ele, tudo se perde a cada atualização.
5. **Environment:** o Dockerfile já define `PORT=3000`, `DATA_DIR=/data`, `TRUST_PROXY=1` e `SIGNUP_OPEN=0` (site fechado: só entra quem já tem conta ou recebe convite dos noivos; `SIGNUP_OPEN=1` reabre o cadastro). Defina também `APP_URL=https://seudominio.com.br` (usado nos links de senha e convite) para enviar e-mails, `RESEND_API_KEY` e `MAIL_FROM`; e, para o botão **Continuar com o Google**, `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` (no Google Cloud, o endereço de retorno é `https://seudominio.com.br/api/auth/google/callback`). Para um site de um casamento só, sem cadastro público, use `SIGNUP_OPEN=0`.
6. Clique em **Deploy**.

**3. Aponte o domínio.**
- No Easypanel, na aba **Domains** do app, adicione `seudominio.com.br` com **HTTPS ligado** e porta **3000**. O certificado é gerado sozinho.
- No painel da Vercel, vá em *Domains → seu domínio → DNS Records* e crie:

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` | IP da VPS |
| A | `www` | IP da VPS (opcional; adicione `www.seudominio.com.br` também no Easypanel) |

Se o domínio estiver ligado a algum projeto da Vercel, remova-o do projeto primeiro, senão a Vercel continua respondendo por ele.

**4. Primeiro acesso.** Abra `https://seudominio.com.br` e use **Criar conta** (noivos) ou **Criar perfil de assessoria**. Só no modo `SIGNUP_OPEN=0` a primeira conta pede o **código de configuração**, que aparece na aba **Logs** do app (ou o `SETUP_CODE` que você definiu).

**Atualizar:** envie as mudanças para o GitHub e clique em **Deploy** de novo (ou ative o *Auto Deploy*). O volume `/data` é mantido.

**Backup:** além do botão de backup em Configurações, faça cópia do volume `data` da VPS de vez em quando. O Easypanel tem uma área de backups para isso, conforme a versão.

### Outros serviços de hospedagem

Também funciona em qualquer serviço com disco persistente (Railway, Render, Fly.io…):

- Comando de início: `npm start`
- Variáveis de ambiente:
  - `TRUST_PROXY=1` (obrigatório atrás do HTTPS do provedor, ativa o cookie `Secure`)
  - `DATA_DIR=/caminho/do/disco/persistente`
  - `PORT` (normalmente o provedor já define)
- **Use sempre HTTPS** quando estiver na internet.
- O código do primeiro acesso aparece nos logs do serviço. Se preferir, defina `SETUP_CODE` com um código seu.

Outras opções: `HOST` (padrão `0.0.0.0`) e `MAX_UPLOAD_MB` (padrão 25).

## Vários casais (cadastro aberto)

O mesmo servidor pode atender vários casais, cada um no seu espaço isolado, com teste grátis e assinatura. Na imagem Docker o cadastro público vem fechado (`SIGNUP_OPEN=0`; use `SIGNUP_OPEN=1` para abrir); rodando pelo `iniciar.bat`, ou com `SIGNUP_OPEN=0`, o site funciona como uma instalação própria (um casamento). O plano completo, com as fases e as variáveis de ambiente, está em [docs/PLANO-MULTICASAL.md](docs/PLANO-MULTICASAL.md).

Administração pela linha de comando (no Easypanel, pela aba **Console** do app):

```
su-exec node node admin.js espacos                          # lista os casamentos
su-exec node node admin.js plano email@x.com anual          # libera um plano (teste, mensal, anual, vitalicio, cancelado)
su-exec node node admin.js teste email@x.com 7              # estende o teste por 7 dias
```

## Estrutura

```
server.js            servidor HTTP + API + segurança (sem dependências externas)
lib/db.js            banco de dados e migrações automáticas
lib/mail.js          envio de e-mails (Resend)
admin.js             ferramenta de administração (planos, lista de casais)
Dockerfile           imagem para o Easypanel / Docker
public/index.html    página única do app
public/css/style.css visual responsivo (celular, tablet e desktop; claro e escuro)
public/js/           app (módulos JavaScript), com uma tela por arquivo em views/
public/js/seed.js    modelos: categorias de orçamento, checklist e roteiro do dia
```
