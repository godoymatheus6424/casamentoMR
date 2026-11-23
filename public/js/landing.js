// Página inicial pública (antes do login): apresenta o BRIDEx.
import { state } from './store.js';
import { html, icon } from './ui.js';

const app = document.getElementById('app');
export const BRAND = 'BRIDEx';

const FEATURES = [
  ['home', 'Visão geral', 'Contagem regressiva, próximas tarefas, pagamentos a vencer e o que ainda falta contratar, logo na primeira tela.'],
  ['check', 'Checklist', 'Mais de quarenta e cinco tarefas organizadas do primeiro ano à semana do casamento, com prazos calculados pela data.'],
  ['briefcase', 'Fornecedores e contratos', 'Orçamentos, contatos, avaliação e a cópia do contrato guardada na ficha de cada fornecedor.'],
  ['wallet', 'Orçamento e parcelas', 'Planejado, contratado e pago por categoria, com as parcelas de cada mês sob controle.'],
  ['users', 'Convidados', 'A lista colada direto do Excel, com confirmações, crianças e restrições alimentares.'],
  ['tables', 'Mapa de mesas', 'A distribuição dos convidados com a lotação de cada mesa.'],
  ['clock', 'Cronograma do dia', 'O roteiro do grande dia com horários e responsáveis, pronto para imprimir.'],
  ['file', 'Documentos', 'Contratos, comprovantes e referências de estilo, organizados num só lugar.'],
  ['gift', 'Presentes', 'Quem deu o quê, e cada agradecimento enviado.'],
];

const FAQ = [
  ['Preciso de cartão de crédito para testar?', 'Não. O período de teste é gratuito, com todas as funções liberadas, e não pedimos cartão.'],
  ['O que acontece quando o teste acaba?', 'Seus dados continuam guardados e disponíveis para consulta e download. Para continuar editando, basta assinar um dos planos.'],
  ['Meu par e a nossa assessoria podem usar junto?', 'Sim. O par e a família entram por um link de convite e editam junto. A assessoria usa o código de acesso do casamento e consulta fornecedores, contratos, convidados e o cronograma, sempre atualizados.'],
  ['Sou assessora. Preciso de uma conta por casamento?', 'Não. Você cria um único perfil de assessoria e alterna entre os casamentos que atende. Cada casal passa o código de acesso dele, você adiciona o casamento no perfil e ele assina o próprio planejamento; quando o contrato termina, você sai do casamento e o perfil continua seu.'],
  ['Funciona no celular?', 'No celular, no tablet e no computador. No celular, adicione à tela de início para abrir como um aplicativo.'],
  ['Meus dados ficam seguros?', 'Cada casamento fica isolado dos demais, as senhas são criptografadas e os arquivos só abrem para quem tem acesso. Não exibimos anúncios nem vendemos dados.'],
];

const monogram = () => html`<svg class="monogram" viewBox="0 0 120 64" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><circle cx="46" cy="36" r="22"/><circle cx="74" cy="36" r="22"/><path d="M60 5l3.5 5-3.5 4.5-3.5-4.5z" fill="currentColor" stroke="none"/></svg>`;
const ornament = () => html`<span class="lp-ornament" aria-hidden="true"><i></i>${monogram()}<i></i></span>`;

export function renderLanding() {
  const st = state.status || {};
  const open = !!st.signupOpen;
  const days = st.trialDays || 14;
  const price = st.pricing || { monthly: '9,90', annual: '89' };
  const annualMonthly = (Number(String(price.annual).replace(',', '.')) / 12).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cta = (cls = '') => (open
    ? html`<a href="#/cadastro" class="lp-btn ${cls}">Começar grátis</a>`
    : html`<a href="#/entrar" class="lp-btn ${cls}">Entrar</a>`);

  document.title = `${BRAND} · Planejamento de casamento`;
  app.innerHTML = String(html`<div class="landing">
    <header class="lp-nav" id="lp-nav">
      <div class="lp-nav-bar">
        <a href="#/" class="lp-brand" aria-label="${BRAND}, início">${BRAND}</a>
        <nav class="lp-links" aria-label="Seções">
          <a href="#recursos" data-scroll>Recursos</a>
          <a href="#assessoras" data-scroll>Assessoras</a>
          <a href="#precos" data-scroll>Planos</a>
          <a href="#duvidas" data-scroll>Dúvidas</a>
        </nav>
        <div class="lp-actions">
          <a href="#/entrar" class="lp-link-btn">Entrar</a>
          ${open ? html`<a href="#/cadastro" class="lp-btn small dark">Criar conta</a>` : ''}
        </div>
      </div>
    </header>

    <section class="lp-hero">
      <div class="lp-hero-bg" aria-hidden="true"></div>
      <div class="lp-hero-top">
        <p class="lp-eyebrow">Planejamento de casamento</p>
        <h1>Do sim ao grande dia,<br> <em>tudo num só lugar</em></h1>
      </div>
      <div class="lp-hero-bottom">
        <p class="lp-lead">Tarefas, fornecedores e contratos, orçamento, convidados e mesas. Para noivos e assessoras, no celular e no computador.</p>
        <div class="lp-cta">${cta('light')}${open ? html`<a href="#/entrar" class="lp-btn ghost-light">Já tenho conta</a>` : ''}</div>
        ${open ? html`<p class="lp-note">${days} dias grátis · sem cartão de crédito</p>` : ''}
      </div>
    </section>

    <section class="lp-section" id="recursos">
      <div class="lp-head reveal">
        <p class="lp-kicker">O planejador</p>
        <h2>Cada detalhe do casamento, <em>em ordem</em></h2>
        <p>Do primeiro orçamento ao último agradecimento, sem fórmulas quebradas nem abas perdidas.</p>
      </div>
      <div class="lp-features">
        ${FEATURES.map(([ic, title, text], i) => html`<article class="lp-feature reveal"><span class="lp-num">${String(i + 1).padStart(2, '0')}</span>${icon(ic)}<h3>${title}</h3><p>${text}</p></article>`)}
      </div>
    </section>

    <section class="lp-section lp-rule">
      <div class="lp-split">
        <div class="lp-head left reveal">
          <p class="lp-kicker">Adeus, planilha</p>
          <h2>Feito para substituir o Excel do casamento</h2>
          <p>A planilha começa simples e vira um labirinto. Aqui, tudo conversa: o fornecedor contratado entra no orçamento, as parcelas viram lembretes e a lista de convidados vira o mapa de mesas.</p>
        </div>
        <ol class="lp-list reveal">
          <li><span><strong>Importe sua lista</strong> colando direto do Excel ou do Google Sheets.</span></li>
          <li><span><strong>Lembretes</strong> de tarefas e pagamentos atrasados.</span></li>
          <li><span><strong>Contratos à mão,</strong> na ficha de cada fornecedor.</span></li>
          <li><span><strong>Os dois editando juntos,</strong> cada um no seu celular.</span></li>
          <li><span><strong>Exporte para o Excel</strong> quando quiser: os dados são de vocês.</span></li>
        </ol>
      </div>
    </section>

    <section class="lp-section lp-dark" id="assessoras">
      <div class="lp-split reverse">
        <div class="lp-head left reveal">
          <p class="lp-kicker">Assessoras e cerimonialistas</p>
          <h2>Todos os seus casamentos, <em>num só perfil</em></h2>
          <p>Cada casal passa o código de acesso do casamento, você digita no seu perfil e consulta o que precisa: fornecedores e contatos, contratos, convidados e o cronograma do dia. Um perfil separado das contas de noivos, para alternar entre todos os casamentos que você atende.</p>
          ${open ? html`<div><a href="#/cadastro?perfil=assessoria" class="lp-btn ghost-light">Criar perfil de assessoria</a></div>` : ''}
        </div>
        <div class="lp-mock reveal" aria-hidden="true">
          <p class="lp-mock-title">Meus casamentos</p>
          <div class="lp-mock-item"><strong>109</strong><span><b>Ana &amp; Pedro</b><small>10 de março · Villa Toscana</small></span></div>
          <div class="lp-mock-item"><strong>186</strong><span><b>Júlia &amp; Rafael</b><small>15 de maio · Igreja São José</small></span></div>
          <div class="lp-mock-item"><strong>273</strong><span><b>Beatriz &amp; Caio</b><small>21 de agosto · Fazenda Boa Vista</small></span></div>
        </div>
      </div>
    </section>

    <section class="lp-section">
      <div class="lp-head reveal">
        <p class="lp-kicker">Privacidade</p>
        <h2>O casamento é de vocês. <em>Os dados também.</em></h2>
      </div>
      <div class="lp-trust">
        <div class="reveal"><h3>Sem anúncios</h3><p>Não vendemos dados nem indicamos fornecedores pagos. A ferramenta trabalha só para vocês.</p></div>
        <div class="reveal"><h3>Acesso sob controle</h3><p>Só os noivos decidem quem entra: o par, a assessoria ou a família.</p></div>
        <div class="reveal"><h3>Leve tudo com você</h3><p>Baixe todos os dados ou exclua a conta quando quiser, como manda a LGPD.</p></div>
      </div>
    </section>

    <section class="lp-section lp-dark" id="precos">
      <div class="lp-head reveal">
        <p class="lp-kicker">Planos</p>
        <h2>Simples, <em>como deve ser</em></h2>
        <p>${days} dias grátis com tudo liberado. Depois, escolha o plano que fizer mais sentido.</p>
      </div>
      <div class="lp-prices">
        <div class="lp-price reveal"><h3>Mensal</h3><p class="lp-amount"><small>R$</small>${price.monthly}</p><p class="lp-per">por mês</p><p>Para quem já está na reta final.</p></div>
        <div class="lp-price best reveal"><p class="lp-tag">Recomendado</p><h3>Anual</h3><p class="lp-amount"><small>R$</small>${price.annual}</p><p class="lp-per">por ano</p><p>Equivale a R$ ${annualMonthly} por mês, para planejar com calma.</p></div>
      </div>
      <div class="lp-center reveal">${cta('light')}</div>
    </section>

    <section class="lp-section" id="duvidas">
      <div class="lp-head reveal"><p class="lp-kicker">Dúvidas</p><h2>Perguntas frequentes</h2></div>
      <div class="lp-faq">${FAQ.map(([q, a]) => html`<details class="reveal"><summary>${q}<span class="lp-plus" aria-hidden="true"></span></summary><p>${a}</p></details>`)}</div>
    </section>

    <section class="lp-final">
      <div class="lp-final-content reveal">
        ${ornament()}
        <h2>Comecem hoje a planejar <em>o grande dia</em></h2>
        <div class="lp-cta">${cta('light')}</div>
      </div>
    </section>

    <footer class="lp-footer">
      <span class="lp-brand">${BRAND}</span>
      <nav><a href="/termos.html">Termos de Uso</a><a href="/privacidade.html">Privacidade</a><a href="#/entrar">Entrar</a></nav>
      <span class="lp-copy">© ${new Date().getFullYear()} ${BRAND}</span>
    </footer>
  </div>`);

  window.scrollTo(0, 0);
  bindLanding();
}

function bindLanding() {
  const root = app.querySelector('.landing');
  // Links internos rolam suavemente sem mudar o endereço (#/...)
  root.querySelectorAll('[data-scroll]').forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
  // Animação suave ao aparecer (respeita "reduzir movimento")
  const items = root.querySelectorAll('.reveal');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { threshold: 0.12 });
  items.forEach((el) => io.observe(el));
}
