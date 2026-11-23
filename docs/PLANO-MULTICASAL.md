# Plano: abrir o planejador para outros casais

Modelo de receita: assinatura **R$ 9,90/mês** ou **R$ 89/ano**, com **14 dias grátis** com tudo liberado.

## Fase 1: base multi-casal (em andamento, branch `multi-casal`)

| Item | Status |
|---|---|
| Cada casal tem seu próprio **espaço** (workspace), com dados e arquivos isolados | ✅ |
| Migração automática do banco atual (o casamento existente vira o 1º espaço, com plano vitalício e backup feito antes de migrar) | ✅ |
| Cadastro público por e-mail (ligado com `SIGNUP_OPEN=1`), com aceite de termos | ✅ |
| Login por e-mail (quem já usa usuário continua entrando normalmente) | ✅ |
| "Esqueci minha senha" com link por e-mail (Resend) | ✅ |
| Período de teste; quando acaba sem assinatura, o espaço fica **só leitura** (nada é apagado) | ✅ |
| Limite de armazenamento por espaço | ✅ |
| Tipos de acesso: **Noivo(a)**, **Assessoria** e **Família/amigo**. Só os noivos adicionam, removem ou mudam acessos | ✅ |
| **Dois perfis independentes:** conta de noivos (e família) pertence a um único casamento e edita tudo; perfil de assessoria é separado (login com aba própria), acompanha vários casamentos e nunca vira conta de noivos, nem o contrário | ✅ |
| **Assessoria só consulta:** visão geral, fornecedores com contatos, contratos e documentos, convidados e cronograma. Não cadastra, não edita, não faz anotações, não convida pessoas. Não recebe orçamento, pagamentos, valores, comprovantes, tarefas, anotações nem presentes (filtrado no servidor) | ✅ |
| **Perfil da assessoria:** uma conta só, com acesso a vários casamentos e troca entre eles ("Meus casamentos"). Os noivos dão acesso por link de convite | ✅ |
| Cadastro próprio da assessoria ("Criar conta → Sou assessora"): perfil sem casamento, que recebe os casamentos quando cada casal dá acesso | ✅ |
| Convites por link, sem depender de e-mail: os noivos geram o link (vale 7 dias, uso único, pode ser cancelado) e mandam por WhatsApp; quem abre cria a própria conta ou entra na que já tem. Os noivos nunca definem a senha de ninguém | ✅ |
| O perfil da assessoria continua existindo quando ela é removida, sai do último casamento ou o casamento é excluído; ela pode excluir o próprio perfil | ✅ |
| Proteção entre abas: se a sessão trocar de casamento em outra aba, a tela antiga não lê nem grava no casamento errado | ✅ |
| "Sair deste casamento" para quem não é dono(a) (ex.: a assessoria ao fim do contrato) | ✅ |
| A assessoria **abre e baixa contratos** e demais documentos do casamento (o envio fica com os noivos; comprovantes e orçamentos não aparecem para ela) | ✅ |
| Exportar dados e **excluir conta** (LGPD) | ✅ |
| Ferramenta de administração (`node admin.js`) para listar espaços e liberar planos manualmente | ✅ |
| Rascunho de Termos de Uso e Política de Privacidade | ✅ rascunho, **revisar com advogado** |

## Fase 2: cobrança

- Escolher o meio de pagamento (Asaas, Mercado Pago, Pagar.me, Stripe…) comparando a taxa fixa por cobrança, o que mais pesa em R$ 9,90, e o suporte a Pix Automático.
- Checkout de assinatura mensal e anual, com webhook que atualiza `plan` e `paid_until` do espaço.
- E-mails automáticos: boas-vindas, "seu teste acaba em 3 dias", pagamento recebido, falha de pagamento.
- Página "Assinatura" com troca de plano e cancelamento.

## Fase 3: lançamento

- Página de apresentação (landing page) com preços.
- Confirmação de e-mail no cadastro.
- Backup automático fora da VPS (ex.: bucket S3/R2) e monitoramento (uptime e erros).
- Painel administrativo simples (espaços, receita, uso).
- Testes com 5 a 10 casais antes de divulgar.

## Fase 4: crescimento

- **Plano para assessoras:** o perfil de assessoria já existe (gratuito, sem casamento próprio); falta decidir se haverá cobrança ou benefícios para assessoras (ex.: criar o casamento para o cliente).
- Site do casal com confirmação de presença (RSVP) online para os convidados.
- Divulgação: Instagram/TikTok, grupos de noivas, Pinterest e parcerias com assessoras.

## Variáveis de ambiente novas

| Variável | Para quê |
|---|---|
| `SIGNUP_OPEN=1` | Libera o cadastro público. Sem ela, funciona como antes: um casamento, com código de configuração. |
| `APP_URL=https://seu-dominio` | **Obrigatória em produção** para os links dos e-mails. |
| `RESEND_API_KEY`, `MAIL_FROM` | Envio de e-mails (ex.: `MAIL_FROM="Planejador <nao-responda@seudominio.com.br>"`). Sem elas, o link aparece só no log do servidor. |
| `TRIAL_DAYS` | Dias de teste grátis (padrão 14). |
| `QUOTA_MB` | Armazenamento por espaço (padrão 1024). |
