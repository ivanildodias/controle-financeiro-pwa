  // ==========================================================================
  // 🧠 1. CONSTANTES E VARIÁVEIS GLOBAIS DE ESTADO
  // ==========================================================================
  
  const ORDEM_MESES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const NOME_MESES = {"01":"Janeiro", "02":"Fevereiro", "03":"Março", "04":"Abril", "05":"Maio", "06":"Junho", "07":"Julho", "08":"Agosto", "09":"Setembro", "10":"Outubro", "11":"Novembro", "12":"Dezembro"};

  let allLancamentos = [];
  let dadosFiltrados = [];
  let dadosFuturos = [];
  
  let configContas = [];
  let configCategorias = [];
  let configModelos = []; 
  
  let colunaAtivaOrdenacao = 'data_compra';
  let ordenacaoAscendente = false;
  let paginaAtual = 1;
  let registrosPorPagina = 10;
  let sistemaInicializado = false;
  let paginaAtualFuturos = 1;
  let colunaAtivaOrdenacaoFuturos = 'data_compra';
  let ordenacaoAscendenteFuturos = false;

  let itensSelecionadosLote = new Set();
  let pressTimerLote;
  let isDraggingMobile = false;

  let visaoDashboard = 'mensal';
  let modoVisaoCredito = 'aberta';
  let agrupamentoDashboard = 'categoria'; 
  let fluxoGrafico = 'DESPESA';
  let fluxoRanking = 'DESPESA';
  let donutCentroOriginal = "";
  let paginaLegendaAtual = 1;
  const ITENS_POR_PAGINA_LEGENDA = 5;

  // ==========================================================================
  // 🗜️ COMPRESSOR E SINCRONIZADOR DE SEGUNDO PLANO
  // ==========================================================================
  let syncCount = 0;
  
  function mostrarSync() {
      syncCount++;
      const pill = document.getElementById('syncIndicator');
      if(pill) pill.classList.remove('hidden');
  }
  
  function ocultarSync() {
      syncCount--;
      if (syncCount <= 0) {
          syncCount = 0;
          const pill = document.getElementById('syncIndicator');
          if(pill) pill.classList.add('hidden');
      }
  }

  // Pega a matriz leve da API e a reconstrói como Objetos no celular
  function descomprimir(dadosComprimidos) {
      // Verifica se o pacote tem a estrutura real de matriz (colunas e registros)
      if (!dadosComprimidos || !dadosComprimidos.colunas || !dadosComprimidos.registros) return dadosComprimidos;
      
      return dadosComprimidos.registros.map(registro => {
          let obj = {};
          dadosComprimidos.colunas.forEach((coluna, index) => {
              obj[coluna] = registro[index];
          });
          return obj;
      });
  }

  // Limpa o cache antigo caso o usuário troque a senha/URL
  function limparCacheDados() {
      localStorage.removeItem('finance_cache_config');
      localStorage.removeItem('finance_cache_lancamentos');
  }

  // ==========================================================================
  // 🚀 2. INICIALIZAÇÃO DO SISTEMA
  // ==========================================================================
  document.addEventListener('DOMContentLoaded', function() {
    
    // REGISTRO DO SERVICE WORKER (PWA OFFLINE)
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
          .then(reg => console.log('Service Worker ativado! Escopo:', reg.scope))
          .catch(err => console.error('Falha ao registrar Service Worker:', err));
      });
    }
    
    configurarGerenciadorTema();
    const fonteSalva = localStorage.getItem('finance-font-size');
    if (fonteSalva) ajustarTamanhoFonte(fonteSalva, false); 
    else ajustarTamanhoFonte('compacto', false);

    document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('finance-show-resumo') === 'true') toggleResumoFiltros(true);
    if (localStorage.getItem('finance-modo-credito') === 'true') {
      const chk = document.getElementById('chkModoCredito');
      if(chk) chk.checked = true;
    }
  });

    verificarConexao();

    window.addEventListener('scroll', function() {
      const headerAtivo = document.querySelector('.content-section.active .section-header');
      if (headerAtivo) {
        if (window.scrollY > 15) headerAtivo.classList.add('header-minimized');
        else headerAtivo.classList.remove('header-minimized');
      }
    });

    document.querySelectorAll('.menu-link').forEach(link => {
      link.addEventListener('click', function(event) {
        event.preventDefault();
        navigateToSection(this.getAttribute('data-target'));
      });
    });

    const lastActiveScreen = localStorage.getItem('financesActiveScreen') || 'dashboard';
    navigateToSection(lastActiveScreen);
    
    if (localStorage.getItem('menuStateCollapsed') === 'true') {
        document.body.classList.add('menu-colapsado');
    }
  });

  function carregarParametrosIniciais() {
    const skHtml = `<div class="flex flex-col gap-3 w-full"><div class="skeleton sk-rect" style="height: 55px;"></div><div class="skeleton sk-rect" style="height: 55px;"></div><div class="skeleton sk-rect" style="height: 55px;"></div></div>`;
    
    // 1. CARREGAMENTO INSTANTÂNEO (VIA CACHE DO CELULAR)
    const cacheStr = localStorage.getItem('finance_cache_config');
    if (cacheStr) {
      const dadosCache = JSON.parse(cacheStr);
      configContas = dadosCache.contas || [];
      configCategorias = dadosCache.categorias || [];
      configModelos = dadosCache.modelos || [];
      renderizarSeletoresFormulario();
      carregarLancamentosDoSheets(); // Pula direto pro próximo!
    } else {
      // Se for o 1º acesso (Sem Cache), mostra Skeletons
      if(document.getElementById('listaConfigContas')) document.getElementById('listaConfigContas').innerHTML = skHtml;
      if(document.getElementById('listaConfigCategorias')) document.getElementById('listaConfigCategorias').innerHTML = skHtml;
      if(document.getElementById('listaConfigModelos')) document.getElementById('listaConfigModelos').innerHTML = skHtml;
    }

    mostrarSync(); // Gira o ícone!

    // 2. SINCRONIZAÇÃO SILENCIOSA COM A NUVEM
    chamarBackend('obterDadosFormularioConfig')
      .then(dadosDaNuvem => {
        // Descomprime os dados levinhos que chegaram do Google
        const contasNuvem = descomprimir(dadosDaNuvem.contas) || [];
        const catNuvem = descomprimir(dadosDaNuvem.categorias) || [];
        const modNuvem = descomprimir(dadosDaNuvem.modelos) || [];
        
        const novoCacheJson = JSON.stringify({ contas: contasNuvem, categorias: catNuvem, modelos: modNuvem });
        
        // Se houver diferença entre a nuvem e o celular, ele atualiza a tela
        if (cacheStr !== novoCacheJson) {
            localStorage.setItem('finance_cache_config', novoCacheJson);
            configContas = contasNuvem; configCategorias = catNuvem; configModelos = modNuvem;
            renderizarSeletoresFormulario();
            
            // Só redesenha as tabelas se a aba estiver aberta
            if(document.getElementById('screen-config').classList.contains('active')) {
                renderizarConfigContas(); renderizarConfigCategorias(); renderizarConfigModelos();
            }
        }
        ocultarSync();
        if (!cacheStr) carregarLancamentosDoSheets(); // Chama a próx etapa se era o 1º acesso
      })
      .catch(err => {
        ocultarSync();
        if (!cacheStr) mostrarNotificacao("Falha ao carregar configurações.", "erro");
      });
  }

  // ==========================================================================
  // 🗺️ 3. MOTOR DE NAVEGAÇÃO
  // ==========================================================================
  function navigateToSection(screenId) {
    document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
    document.querySelectorAll('.menu-link').forEach(link => link.classList.remove('active'));
    
    const selectedSection = document.getElementById(`screen-${screenId}`);
    const selectedLink = document.querySelector(`[data-target="${screenId}"]`);
    
    if (selectedSection) selectedSection.classList.add('active');
    if (selectedLink) selectedLink.classList.add('active');
    localStorage.setItem('financesActiveScreen', screenId);
  }

  function alternarSubAba(alvo) {
    const btns = document.querySelectorAll('.sub-tabs-container .sub-tab-btn');
    
    document.getElementById('subPanelSistema').classList.remove('active');
    document.getElementById('subPanelPersonalizacao').classList.remove('active');
    document.getElementById('subPanelImportacao').classList.remove('active');
    document.getElementById('subPanelAuditoria').classList.remove('active');
    
    btns.forEach(b => b.classList.remove('active'));

    if (alvo === 'sistema') {
      if (btns[0]) btns[0].classList.add('active');
      document.getElementById('subPanelSistema').classList.add('active');
    } else if (alvo === 'personalizacao') {
      if (btns[1]) btns[1].classList.add('active');
      document.getElementById('subPanelPersonalizacao').classList.add('active');
    } else if (alvo === 'importacao') {
      if (btns[2]) btns[2].classList.add('active');
      document.getElementById('subPanelImportacao').classList.add('active');
    } else if (alvo === 'auditoria') { 
      if (btns[3]) btns[3].classList.add('active');
      document.getElementById('subPanelAuditoria').classList.add('active');
    }
  }

  // ==========================================================================
  // 🎨 4. MOTOR DE PERSONALIZAÇÃO E TEMAS
  // ==========================================================================
  function configurarGerenciadorTema() {
    const chkModoEscuro = document.getElementById('chkModoEscuro');
    if (!chkModoEscuro) return;

    const temaSalvo = localStorage.getItem('finance-theme');
    if (temaSalvo === 'dark') {
      document.body.setAttribute('data-theme', 'dark');
      chkModoEscuro.checked = true;
    }

    const paletaSalva = localStorage.getItem('finance-palette');
    if (paletaSalva) mudarPaletaCor(paletaSalva, false);

    chkModoEscuro.addEventListener('change', function() {
      if (chkModoEscuro.checked) {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('finance-theme', 'dark');
      } else {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('finance-theme', 'light');
      }
    });
  }

  function mudarPaletaCor(nomePaleta, notificar = true) {
    document.body.setAttribute('data-palette', nomePaleta);
    localStorage.setItem('finance-palette', nomePaleta);
    
    document.querySelectorAll('.palette-btn').forEach(btn => btn.classList.remove('active'));
    const btnAtivo = document.querySelector(`.palette-btn[data-cor="${nomePaleta}"]`);
    if (btnAtivo) btnAtivo.classList.add('active');
    
    if (notificar) mostrarNotificacao("Paleta de cores atualizada!");
  }

  function ajustarTamanhoFonte(modo, notificar = true) {
    const btnPadrao = document.getElementById('btnFontePadrao');
    const btnAmpliada = document.getElementById('btnFonteAmpliada');

    if (btnPadrao && btnAmpliada) {
      if (modo === 'confortavel') {
        btnPadrao.className = 'btn btn-secundario';
        btnAmpliada.className = 'btn btn-primario';
        document.body.classList.add('fonte-ampliada');
      } else {
        btnPadrao.className = 'btn btn-primario';
        btnAmpliada.className = 'btn btn-secundario';
        document.body.classList.remove('fonte-ampliada');
      }
    }
    
    localStorage.setItem('finance-font-size', modo);
    
    if (notificar) {
      if (modo === 'confortavel') mostrarNotificacao("Textos ampliados para leitura.");
      else mostrarNotificacao("Tamanho de texto redefinido.");
    }
  }

  // ==========================================================================
  // 🔔 5. COMPONENTES VISUAIS (TOASTS E MODAIS)
  // ==========================================================================
  function mostrarNotificacao(mensagem, tipo = 'sucesso') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const icones = { sucesso: 'check_circle', erro: 'cancel', aviso: 'error' };
    
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = `<span class="material-icons">${icones[tipo]}</span><span>${mensagem}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ==========================================================================
  // MOTOR GLOBAL DE MODAIS
  // ==========================================================================
  function abrirJanela(idModal) {
    document.getElementById(idModal).classList.remove('hidden');
    document.getElementById('modalBackdrop').classList.remove('hidden');
  }
  function fecharJanela(idModal) {
    document.getElementById(idModal).classList.add('hidden');
    document.getElementById('modalBackdrop').classList.add('hidden');
  }

  function abrirModalLancamento() {
    abrirJanela('lancamentoModal');
    
    if (!document.getElementById('inpIdLancamento').value) {
      const hoje = new Date().toISOString().split('T')[0];
      document.getElementById('inpDataCompra').value = hoje;
      document.getElementById('inpDataPag').value = hoje;
    }
    if (document.getElementById('labelTransferencia')) {
        document.getElementById('labelTransferencia').classList.remove('hidden');
    }
    verificarExibicaoCredito();
  }
  function fecharModalLancamento() {
    fecharJanela('lancamentoModal');
    
    document.getElementById('formLancamento').reset();
    document.getElementById('inpIdLancamento').value = "";
    
    // Atualiza o Título caso tivesse sido mudado para "Editar" ou "Duplicar"
    const titulo = document.getElementById('tituloModalLancamento');
    const icone = document.getElementById('iconeModalLancamento');
    if (titulo) titulo.innerHTML = "Novo Lançamento";
    if (icone) icone.innerHTML = "add_circle";
    
    if (document.getElementById('divParcelas')) document.getElementById('divParcelas').classList.add('hidden');
    if (document.getElementById('inpParcelas')) document.getElementById('inpParcelas').value = 1;
  }

  function verificarExibicaoCredito(origemEvento = null) {
    const groupNoCredito = document.getElementById('groupNoCredito');
    const checkboxCredito = document.getElementById('inpNoCredito');
    const grupoPadrao = document.getElementById('grupoCamposPadrao');
    const grupoTransf = document.getElementById('grupoCamposTransferencia');
    
    const selCat = document.getElementById('selCategoria');
    const selCon = document.getElementById('selConta');
    const selOrigem = document.getElementById('selContaOrigem');
    const selDestino = document.getElementById('selContaDestino');
    
    const radioSelecionado = document.querySelector('input[name="tipo_fluxo"]:checked');
    
    if (radioSelecionado) {
      const val = radioSelecionado.value;
      
      if (val === 'TRANSFERENCIA') {
        if (grupoPadrao) grupoPadrao.classList.add('hidden');
        if (grupoTransf) grupoTransf.classList.remove('hidden');
        
        if (selCat) selCat.removeAttribute('required');
        if (selCon) selCon.removeAttribute('required');
        if (selOrigem) selOrigem.setAttribute('required', 'true');
        if (selDestino) selDestino.setAttribute('required', 'true');
        
        const inpDesc = document.getElementById('inpDescricao');
        if (inpDesc && !inpDesc.value) inpDesc.value = "Transferência entre contas";
        atualizarObsTransferencia();
      } else {
        if (grupoPadrao) grupoPadrao.classList.remove('hidden');
        if (grupoTransf) grupoTransf.classList.add('hidden');
        
        if (selCat) selCat.setAttribute('required', 'true');
        if (selCon) selCon.setAttribute('required', 'true');
        if (selOrigem) selOrigem.removeAttribute('required');
        if (selDestino) selDestino.removeAttribute('required');
        
        const inpDesc = document.getElementById('inpDescricao');
        if (inpDesc && inpDesc.value === "Transferência entre contas") {
           inpDesc.value = "";
           document.getElementById('txtObservacoes').value = "";
        }

        if (origemEvento !== 'categoria') {
          renderizarCategoriasPorTipoFluxo(val);
        }

        const catSelecionada = selCat ? selCat.value.toUpperCase() : '';
        const isEstorno = catSelecionada.includes('ESTORNO');

        if (val === 'RECEITA' && !isEstorno) {
          if (groupNoCredito) groupNoCredito.classList.add('hidden');
          if (checkboxCredito) checkboxCredito.checked = false;      
        } else {
          if (groupNoCredito) groupNoCredito.classList.remove('hidden');
        }
      }
    }
  }

  function alternarGrupoConfig(idContainer, iconeElement) {
    const container = document.getElementById(idContainer);
    if (container) {
      container.classList.toggle('hidden');
      if (container.classList.contains('hidden')) {
        iconeElement.innerHTML = 'expand_more';
      } else {
        iconeElement.innerHTML = 'expand_less';
      }
    }
  }

  // ==========================================================================
  // ⚙️ 6. CONFIGURAÇÕES E FORMULÁRIOS (SELETORES)
  // ==========================================================================
  function renderizarSeletoresFormulario() {
    const selConta = document.getElementById('selConta');
    const selOrigem = document.getElementById('selContaOrigem');
    const selDestino = document.getElementById('selContaDestino');
    
    let htmlContas = '<option value="">Selecione...</option>';
    configContas.forEach(c => htmlContas += `<option value="${c.nome}">${c.nome} (${c.tipo})</option>`);
    
    if (selConta) selConta.innerHTML = htmlContas;
    if (selOrigem) selOrigem.innerHTML = htmlContas;
    if (selDestino) selDestino.innerHTML = htmlContas;

    const selModL = document.getElementById('selModelosRacionados');
    if (selModL) {
      let htmlMods = '<option value="">Selecione um Modelo...</option>';
      configModelos.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(m => {
        htmlMods += `<option value="${m.nome}">${m.nome} (${m.tipo.substring(0,3)})</option>`;
      });
      selModL.innerHTML = htmlMods;
    }
  }

  function atualizarObsTransferencia() {
      const orig = document.getElementById('selContaOrigem').value;
      const dest = document.getElementById('selContaDestino').value;
      if (orig || dest) {
        document.getElementById('txtObservacoes').value = `${orig || '?'} > ${dest || '?'}`;
      }
  }

  function renderizarCategoriasPorTipoFluxo(tipoFluxo) {
    const selCategoria = document.getElementById('selCategoria');
    if (!selCategoria) return;
    
    const valorSalvado = selCategoria.value; 
    selCategoria.innerHTML = '<option value="">Selecione...</option>';

    const filtradas = configCategorias.filter(cat => {
      if (tipoFluxo === 'DESPESA') return ['Despesas Essenciais', 'Despesas Não Essenciais', 'Montante Investido'].includes(cat.tipo) || cat.nome === 'Faturas' || cat.nome === 'Movimentações';
      if (tipoFluxo === 'RECEITA') return ['Receitas', 'Retorno Investimentos'].includes(cat.tipo) || cat.nome === 'Movimentações';
      return false;
    });

    const grupos = {};
    filtradas.forEach(cat => { if (!grupos[cat.tipo]) grupos[cat.tipo] = []; grupos[cat.tipo].push(cat); });

    for (const tipo in grupos) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = tipo;
      grupos[tipo].forEach(cat => {
        const sufixoTexto = cat.sufixo ? ` (${cat.sufixo})` : '';
        optGroup.innerHTML += `<option value="${cat.nome}">${cat.nome}${sufixoTexto}</option>`;
      });
      selCategoria.appendChild(optGroup);
    }
    selCategoria.value = valorSalvado;
  }

  // ==========================================================================
  // 📋 7. RENDERIZAÇÃO DAS LISTAS DE CONFIGURAÇÃO (ABA SISTEMA)
  // ==========================================================================
  
  // Fábrica Modular para Grupos (Sanfonas) nas Configurações
  function gerarHtmlSanfonaConfig(idContainer, titulo, qtd, iconeInicial, classeTema, conteudoHtml) {
    const classeOculta = iconeInicial === 'expand_more' ? 'hidden' : '';
    return `
      <div class="cat-group ${classeTema}">
        <div class="cat-summary" onclick="alternarGrupoConfig('${idContainer}', this.querySelector('.icone-sanfona'))">
          <div class="flex items-center gap-2">
            <span class="material-icons icone-sanfona text-lg">${iconeInicial}</span>
            <span class="text-base font-bold">${titulo}</span>
          </div>
          <span class="cat-badge">${qtd}</span>
        </div>
        <div id="${idContainer}" class="cat-content ${classeOculta}">
          ${conteudoHtml}
        </div>
      </div>`;
  }

  function renderizarConfigContas() {
    const lista = document.getElementById('listaConfigContas');
    const inputBusca = document.getElementById('inpBuscaConfigConta');
    if (!lista) return;

    const termo = inputBusca ? inputBusca.value.toLowerCase() : "";
    const contagemUso = {};
    allLancamentos.forEach(l => { if (l.conta) contagemUso[l.conta] = (contagemUso[l.conta] || 0) + 1; });

    const filtradas = configContas.filter(c => c.nome.toLowerCase().includes(termo) || (c.tipo && c.tipo.toLowerCase().includes(termo)));
    if (filtradas.length === 0) { lista.innerHTML = '<p class="text-center text-suave w-full py-3">Nenhuma conta encontrada.</p>'; return; }
    
    const grupos = {};
    filtradas.forEach(c => { 
        // Aqui está o truque: Dividimos pelo ";" e enviamos a conta para CADA UM dos grupos!
        const tiposHibridos = c.tipo ? c.tipo.split(';') : ['Sem Tipo']; 
        tiposHibridos.forEach(t => {
            if(!grupos[t]) grupos[t] = []; 
            grupos[t].push(c); 
        });
    });

    let htmlCompleto = '';
    const classeOcultaInicial = termo.length > 0 ? '' : 'hidden';
    const iconeInicial = termo.length > 0 ? 'expand_less' : 'expand_more';

    Object.keys(grupos).sort().forEach((grupo, index) => {
      const itens = grupos[grupo];
      let classeTema = 'tema-neutro';
      if (grupo.toUpperCase().includes('CRÉDITO')) classeTema = 'tema-perigo';
      else if (grupo.toUpperCase().includes('INVESTIMENTO')) classeTema = 'tema-sucesso';

      let itensHtml = '';
      itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).forEach(c => {
        const uso = contagemUso[c.nome] || 0;
        const txtUso = uso === 0 ? `<span class="text-xs font-bold text-perigo">(0 usos)</span>` : `<span class="text-xs text-suave">(${uso} usos)</span>`;
        const isCred = c.tipo && c.tipo.toUpperCase().includes('CRÉDITO');
        const limForm = c.limite > 0 ? c.limite.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) : '--';
        const infoCredito = isCred ? `<div class="text-xs text-suave mt-1 ml-4">F: ${c.fechamento||'--'} | V: ${c.vencimento||'--'} | Limite: ${limForm}</div>` : '';

        itensHtml += `
          <div class="cat-item">
            <div class="flex-col flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="bolinha-cor shrink-0" style="background:${c.cor || '#ccc'};"></span>
                <strong class="text-base text-principal truncate">${c.nome}</strong>
                ${txtUso}
              </div>
              ${infoCredito}
            </div>
            <div class="flex gap-3 ml-2 shrink-0">
              <span class="material-icons cursor-pointer text-suave text-lg" onclick="prepararEdicaoConta('${c.nome}')" title="Editar">edit</span>
              <span class="material-icons cursor-pointer text-perigo text-lg" onclick="confirmarExclusaoConta('${c.nome}')" title="Excluir">delete</span>
            </div>
          </div>`;
      });
      htmlCompleto += gerarHtmlSanfonaConfig(`grupo-conta-${index}`, grupo, itens.length, iconeInicial, classeTema, itensHtml);
    });
    lista.innerHTML = htmlCompleto;
  }

  function renderizarConfigCategorias() {
    const lista = document.getElementById('listaConfigCategorias');
    const inputBusca = document.getElementById('inpBuscaConfigCategoria');
    if (!lista) return;

    const termo = inputBusca ? inputBusca.value.toLowerCase() : "";
    const contagemUso = {};
    allLancamentos.forEach(l => { if (l.categoria) contagemUso[l.categoria] = (contagemUso[l.categoria] || 0) + 1; });

    const filtradas = configCategorias.filter(c => c.nome.toLowerCase().includes(termo) || (c.tipo && c.tipo.toLowerCase().includes(termo)));
    if (filtradas.length === 0) { lista.innerHTML = '<p class="text-center text-suave w-full py-3">Nenhuma categoria encontrada.</p>'; return; }
    
    const grupos = {};
    filtradas.forEach(c => { const t = c.tipo || 'Sem Grupo'; if(!grupos[t]) grupos[t] = []; grupos[t].push(c); });

    let htmlCompleto = '';
    const classeOcultaInicial = termo.length > 0 ? '' : 'hidden';
    const iconeInicial = termo.length > 0 ? 'expand_less' : 'expand_more';

    Object.keys(grupos).sort().forEach((grupo, index) => {
      const itens = grupos[grupo];
      let classeTema = 'tema-neutro';
      if (grupo === 'Receitas' || grupo === 'Retorno Investimentos') classeTema = 'tema-sucesso';
      else if (grupo === 'Despesas Essenciais' || grupo === 'Despesas Não Essenciais' || grupo === 'Montante Investido') classeTema = 'tema-perigo';

      let itensHtml = '';
      itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).forEach(c => {
        const uso = contagemUso[c.nome] || 0;
        const txtUso = uso === 0 ? `<span class="text-xs font-bold text-perigo">(0 usos)</span>` : `<span class="text-xs text-suave">(${uso} usos)</span>`;
        
        itensHtml += `
          <div class="cat-item">
            <div class="flex items-start gap-3 flex-1 min-w-0">
              <span class="material-icons text-suave mt-1 shrink-0" style="font-size: 1.4rem;">${c.icone || 'local_offer'}</span>
              <div class="flex-col flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <strong class="text-base text-principal truncate">${c.nome}</strong>
                  ${txtUso}
                </div>
                ${c.descricao ? `<div class="text-xs text-suave mt-1 truncate">${c.descricao}</div>` : ''}
              </div>
            </div>
            <div class="flex gap-3 ml-2 shrink-0">
              <span class="material-icons cursor-pointer text-suave text-lg" onclick="prepararEdicaoCategoria('${c.nome}')" title="Editar">edit</span>
              <span class="material-icons cursor-pointer text-perigo text-lg" onclick="confirmarExclusaoCategoria('${c.nome}')" title="Excluir">delete</span>
            </div>
          </div>`;
      });
      htmlCompleto += gerarHtmlSanfonaConfig(`grupo-cat-${index}`, grupo, itens.length, iconeInicial, classeTema, itensHtml);
    });
    lista.innerHTML = htmlCompleto;
  }

  function renderizarConfigModelos() {
    const lista = document.getElementById('listaConfigModelos');
    const inputBusca = document.getElementById('inpBuscaConfigModelo');
    if (!lista) return;
    
    const termo = inputBusca ? inputBusca.value.toLowerCase() : "";

    const filtrados = configModelos.filter(m => m.nome.toLowerCase().includes(termo) || (m.tipo && m.tipo.toLowerCase().includes(termo)));

    if (filtrados.length === 0) { lista.innerHTML = '<p class="text-center text-suave w-full py-3">Nenhum modelo encontrado.</p>'; return; }
    
    const grupos = {};
    filtrados.forEach(m => { const t = m.tipo || 'Outros'; if (!grupos[t]) grupos[t] = []; grupos[t].push(m); });

    let htmlCompleto = '';
    const classeOcultaInicial = termo.length > 0 ? '' : 'hidden';
    const iconeInicial = termo.length > 0 ? 'expand_less' : 'expand_more';

    Object.keys(grupos).sort().forEach((grupo, index) => {
      const itens = grupos[grupo];
      let classeTema = 'tema-neutro', nomeAmigavel = 'Transferências';
      if (grupo === 'RECEITA') { classeTema = 'tema-sucesso'; nomeAmigavel = 'Receitas'; }
      else if (grupo === 'DESPESA') { classeTema = 'tema-perigo'; nomeAmigavel = 'Despesas'; }

      let itensHtml = '';
      itens.sort((a,b) => a.nome.localeCompare(b.nome)).forEach(m => {
          const valTxt = m.valor ? ` • ${m.valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}` : '';
          const subtitulo = grupo === 'TRANSFERENCIA' 
              ? `${m.categoria || '?'} &rarr; ${m.conta || '?'}${valTxt}`
              : `${m.categoria || 'Sem categoria'} • ${m.conta || 'Sem conta'}${valTxt}`;

          itensHtml += `
          <div class="cat-item">
            <div class="flex-col flex-1 gap-1 min-w-0">
              <strong class="text-base text-principal flex items-center gap-2 truncate">
                <span class="material-icons text-sucesso text-base shrink-0">star</span>${m.nome}
              </strong>
              <div class="text-xs text-suave truncate">${subtitulo}</div>
            </div>
            <div class="flex gap-3 ml-2 shrink-0">
              <span class="material-icons cursor-pointer text-suave text-lg" onclick="prepararEdicaoModelo('${m.nome}')" title="Editar">edit</span>
              <span class="material-icons cursor-pointer text-perigo text-lg" onclick="confirmarExclusaoModelo('${m.nome}')" title="Excluir">delete</span>
            </div>
          </div>`;
      });
      htmlCompleto += gerarHtmlSanfonaConfig(`grupo-modelo-${index}`, nomeAmigavel, itens.length, iconeInicial, classeTema, itensHtml);
    });
    lista.innerHTML = htmlCompleto;
  }

  // ==========================================================================
  // 💾 8. CRUD DE CONFIGURAÇÕES (MODAIS E BACKEND)
  // ==========================================================================
  function abrirModalConta() { 
    abrirJanela('contaModal');
    
    estadoMultiSelect['mTipoConta'] = [];
    const opcoesTiposConta = [
        {value: 'Conta Corrente', label: 'Conta Corrente'}, {value: 'Crédito', label: 'Crédito'},
        {value: 'Investimentos', label: 'Investimentos'}, {value: 'Benefício', label: 'Benefício'},
        {value: 'Dinheiro', label: 'Dinheiro'}
    ];
    renderizarTagInput('mTipoConta', opcoesTiposConta, 'Buscar tipos...');
  }
  function fecharModalConta() { 
    fecharJanela('contaModal');
    document.getElementById('formConta').reset(); 
    document.getElementById('inpIdContaAntigo').value = ""; 
    document.getElementById('grupoCamposCredito').classList.add('hidden'); 
    document.getElementById('tituloModalConta').innerHTML = "Nova Conta / Cartão";
    document.getElementById('iconeModalConta').innerHTML = "credit_card";
    
    estadoMultiSelect['mTipoConta'] = [];
    atualizarBadgesTag('mTipoConta');
  }

  function processarEnvioConta(e) {
    e.preventDefault();
    const tiposSelecionados = estadoMultiSelect['mTipoConta'].join(';');
    
    if (!tiposSelecionados) {
        mostrarNotificacao("Selecione pelo menos um Tipo de Conta.", "aviso");
        return;
    }

    let valStr = document.getElementById('inpLimiteConta').value;
    let lim = parseFloat(valStr.replace(/\./g, '').replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
    
    const dados = { 
      idAntigo: document.getElementById('inpIdContaAntigo').value || null, 
      nome: document.getElementById('inpNomeConta').value.trim(), 
      tipo: tiposSelecionados, // Salva todas as tags com ponto e vírgula
      fechamento: document.getElementById('inpFechamentoConta').value, 
      vencimento: document.getElementById('inpVencimentoConta').value, 
      limite: lim, 
      cor: document.getElementById('inpCorConta').value 
    };
    
    mostrarNotificacao("Gravando...", "aviso");
    chamarBackend('salvarContaServidor', dados)
      .then(res => { 
        if (res.error) mostrarNotificacao(res.error, "erro"); 
        else { 
            fecharModalConta(); 
            if (res.atualizados > 0) { mostrarNotificacao(`Salvo! ${res.atualizados} lançamentos foram sincronizados.`, "sucesso"); carregarLancamentosDoSheets(); } 
            else { mostrarNotificacao("Conta salva!", "sucesso"); }
            recarregarConfiguracoesGerais();
        } 
      })
      .catch(err => mostrarNotificacao("Erro: " + err.message, "erro"));
  }

  function prepararEdicaoConta(nome) {
    const c = configContas.find(x => x.nome === nome); if(!c) return;
    abrirModalConta(); 
    document.getElementById('tituloModalConta').innerHTML = "Editar Conta";
    document.getElementById('iconeModalConta').innerHTML = "edit";
    document.getElementById('inpIdContaAntigo').value = c.nome; 
    document.getElementById('inpNomeConta').value = c.nome; 
    document.getElementById('inpCorConta').value = c.cor || "#3498db";
    
    // Carrega as tags salvas
    estadoMultiSelect['mTipoConta'] = c.tipo ? c.tipo.split(';') : [];
    atualizarBadgesTag('mTipoConta');
    verificarCamposCreditoConta(c.tipo);
    
    if (c.tipo && c.tipo.toUpperCase().includes('CRÉDITO')) {
      document.getElementById('inpFechamentoConta').value = c.fechamento || ""; 
      document.getElementById('inpVencimentoConta').value = c.vencimento || "";
      document.getElementById('inpLimiteConta').value = c.limite > 0 ? c.limite.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) : "";
    }
  }

  function confirmarExclusaoConta(nome) {
    const b = document.getElementById('confirmModalBody');
    b.innerHTML = `Excluir a conta <strong>${nome}</strong>?<br><br><span class="text-xs font-bold text-perigo">⚠️ Nota: Lançamentos já feitos não serão apagados.</span>`;
    abrirJanela('confirmModal');
    
    document.getElementById('btnConfirmCancelar').onclick = () => fecharJanela('confirmModal');
    document.getElementById('btnConfirmSim').onclick = () => {
      fecharJanela('confirmModal');
      mostrarNotificacao("Removendo...", "aviso");
      chamarBackend('excluirContaServidor', nome)
        .then(res => { if(res.error) mostrarNotificacao(res.error, "erro"); else { mostrarNotificacao("Removida!"); recarregarConfiguracoesGerais(); } })
        .catch(err => mostrarNotificacao("Erro: " + err.message, "erro"));
    };
  }

  function abrirModalCategoria() { 
    abrirJanela('categoriaModal');
    document.getElementById('inpIconeCategoria').value = 'local_offer';
    document.getElementById('previewIconeCat').innerHTML = 'local_offer';
    document.getElementById('previewIconeCat').style.color = 'var(--texto-suave)';
    document.getElementById('previewIconeCat').style.borderColor = 'var(--borda)';
    document.getElementById('gridSeletorIcones').classList.add('hidden');
  }
  function fecharModalCategoria() { 
    fecharJanela('categoriaModal');
    document.getElementById('formCategoria').reset(); 
    document.getElementById('inpIdCategoriaAntigo').value = ""; 
    document.getElementById('tituloModalCategoria').innerHTML = "Nova Categoria";
    document.getElementById('iconeModalCategoria').innerHTML = "local_offer";
  }

  function processarEnvioCategoria(e) {
    e.preventDefault();
    const dados = { 
      idAntigo: document.getElementById('inpIdCategoriaAntigo').value || null, 
      nome: document.getElementById('inpNomeCategoria').value.trim(), 
      tipo: document.getElementById('selTipoCategoria').value, 
      icone: document.getElementById('inpIconeCategoria').value,
      descricao: document.getElementById('inpDescricaoCategoria').value.trim() 
    };
    mostrarNotificacao("Gravando...", "aviso");
    chamarBackend('salvarCategoriaServidor', dados)
      .then(res => { 
        if (res.error) mostrarNotificacao(res.error, "erro"); 
        else { 
            fecharModalCategoria(); 
            if (res.atualizados > 0) { mostrarNotificacao(`Salvo! ${res.atualizados} lançamentos sincronizados.`, "sucesso"); carregarLancamentosDoSheets(); } 
            else { mostrarNotificacao("Categoria salva!", "sucesso"); }
            recarregarConfiguracoesGerais();
        } 
      })
      .catch(err => mostrarNotificacao("Erro: " + err.message, "erro"));
  }
  
  function prepararEdicaoCategoria(nome) {
    const c = configCategorias.find(x => x.nome === nome); if(!c) return;
    abrirModalCategoria(); 
    document.getElementById('tituloModalCategoria').innerHTML = "Editar Categoria";
    document.getElementById('iconeModalCategoria').innerHTML = "edit";
    document.getElementById('inpIdCategoriaAntigo').value = c.nome; 
    document.getElementById('inpNomeCategoria').value = c.nome; 
    document.getElementById('selTipoCategoria').value = c.tipo; 
    document.getElementById('inpDescricaoCategoria').value = c.descricao || "";
    selecionarIconeCat(c.icone || "local_offer");
  }

  function confirmarExclusaoCategoria(nome) {
    const b = document.getElementById('confirmModalBody');
    b.innerHTML = `Excluir a categoria <strong>${nome}</strong>?<br><br><span class="text-xs font-bold text-perigo">⚠️ Nota: Lançamentos já feitos não serão apagados.</span>`;
    abrirJanela('confirmModal');
    
    document.getElementById('btnConfirmCancelar').onclick = () => fecharJanela('confirmModal');
    document.getElementById('btnConfirmSim').onclick = () => {
      fecharJanela('confirmModal');
      mostrarNotificacao("Removendo...", "aviso");
      chamarBackend('excluirCategoriaServidor', nome)
        .then(res => { if(res.error) mostrarNotificacao(res.error, "erro"); else { mostrarNotificacao("Removida!"); recarregarConfiguracoesGerais(); } })
        .catch(err => mostrarNotificacao("Erro: " + err.message, "erro"));
    };
  }

  const CURATED_ICONS = [ 
    'local_offer', 'home', 'receipt_long', 'shopping_cart', 'medical_services', 'chair', 'cleaning_services', 'school', 'fitness_center', 'account_balance', 'restaurant', 'family_restroom', 'subscriptions', 'play_circle', 'checkroom', 'shopping_bag', 'sports_esports', 'attractions', 'directions_car', 'warning', 'local_florist', 'payments', 'favorite', 'currency_exchange', 'savings', 'card_giftcard', 'trending_up', 'receipt', 'pie_chart', 'account_balance_wallet', 'sync_alt', 'credit_score', 'pets', 'flight', 'laptop_mac', 'phone_iphone', 'local_hospital', 'local_cafe', 'fastfood', 'train', 'pedal_bike', 'two_wheeler', 'storefront', 'build', 'content_cut', 'music_note', 'movie', 'park', 'spa', 'wifi', 'water_drop', 'flash_on', 'phone', 'bed', 'child_care', 'stroller', 'cake', 'celebration', 'volunteer_activism', 'account_tree', 'business_center', 'work', 'gavel', 'balance', 'monetization_on', 'attach_money', 'credit_card', 'pix' 
  ];

  function renderizarGridIcones() {
    const grid = document.getElementById('gridSeletorIcones');
    if(!grid) return;
    let html = '';
    CURATED_ICONS.forEach(ic => {
        html += `<div onclick="selecionarIconeCat('${ic}')" class="h-11 flex items-center justify-center rounded bg-card border cursor-pointer transition-all material-icons icone-opcao">${ic}</div>`;
    });
    grid.innerHTML = html;
  }

  function alternarSeletorIcones() {
    const grid = document.getElementById('gridSeletorIcones');
    grid.classList.toggle('hidden');
    if (!grid.classList.contains('hidden') && grid.innerHTML.trim() === '') renderizarGridIcones();
  }

  function selecionarIconeCat(icone) {
    document.getElementById('inpIconeCategoria').value = icone;
    document.getElementById('previewIconeCat').innerHTML = icone;
    document.getElementById('previewIconeCat').style.color = 'var(--cor-destaque)';
    document.getElementById('previewIconeCat').style.borderColor = 'var(--cor-destaque)';
    document.getElementById('gridSeletorIcones').classList.add('hidden');
  }

  function getCatIcon(nomeCat) {
      const cat = configCategorias.find(c => c.nome === nomeCat);
      return cat && cat.icone ? cat.icone : 'local_offer';
  }

  function alternarCamposModelo() {
      const tipo = document.getElementById('selTipoModelo').value;
      const grpPadrao = document.getElementById('grupoContaCategoriaModelo');
      const grpTransf = document.getElementById('grupoContaTransferenciaModelo');
      const grpCredito = document.getElementById('grupoCreditoModelo');

      if (tipo === 'TRANSFERENCIA') {
          grpPadrao.classList.add('hidden'); grpTransf.classList.remove('hidden'); grpCredito.classList.add('hidden');
      } else {
          grpPadrao.classList.remove('hidden'); grpTransf.classList.add('hidden'); grpCredito.classList.remove('hidden');
      }
  }

  function abrirModalModelo() {
    abrirJanela('modeloModal');
    
    const sCat = document.getElementById('selCategoriaModelo'); const sCon = document.getElementById('selContaModelo');
    const sOrigem = document.getElementById('selOrigemModelo'); const sDestino = document.getElementById('selDestinoModelo');
    
    sCat.innerHTML = '<option value="">Opcional</option>'; sCon.innerHTML = '<option value="">Opcional</option>';
    sOrigem.innerHTML = '<option value="">Opcional</option>'; sDestino.innerHTML = '<option value="">Opcional</option>';
    
    configContas.sort((a,b)=>a.nome.localeCompare(b.nome)).forEach(c => {
        sCon.innerHTML += `<option value="${c.nome}">${c.nome}</option>`; sOrigem.innerHTML += `<option value="${c.nome}">${c.nome}</option>`; sDestino.innerHTML += `<option value="${c.nome}">${c.nome}</option>`;
    });
    configCategorias.sort((a,b)=>a.nome.localeCompare(b.nome)).forEach(c => { sCat.innerHTML += `<option value="${c.nome}">${c.nome}</option>`; });
    alternarCamposModelo();
  }
  function fecharModalModelo() {
    fecharJanela('modeloModal');
    document.getElementById('formModelo').reset();
    document.getElementById('inpIdModeloAntigo').value = "";
    document.getElementById('tituloModalModelo').innerHTML = "Criar Modelo Rápido";
    document.getElementById('iconeModalModelo').innerHTML = "auto_awesome";
  }

  function processarEnvioModelo(e) {
    e.preventDefault();
    let valStr = document.getElementById('inpValorModelo').value;
    let val = valStr ? (parseFloat(valStr.replace(/\./g, '').replace(/[^\d,-]/g, '').replace(',', '.')) || 0) : "";
    
    const tipoSel = document.getElementById('selTipoModelo').value;
    let cat = "", con = "", noCred = false;
    
    if (tipoSel === 'TRANSFERENCIA') {
        cat = document.getElementById('selOrigemModelo').value; con = document.getElementById('selDestinoModelo').value; noCred = false;
    } else {
        cat = document.getElementById('selCategoriaModelo').value; con = document.getElementById('selContaModelo').value; noCred = document.getElementById('selCreditoModelo').value === 'SIM';
    }

    const dados = { 
      idAntigo: document.getElementById('inpIdModeloAntigo').value || null, 
      nome: document.getElementById('inpNomeModelo').value.trim(), 
      tipo: tipoSel, 
      descricao: document.getElementById('inpDescricaoModelo').value.trim(), 
      observacoes: document.getElementById('txtObservacoesModelo').value.trim(), 
      valor: val, categoria: cat, conta: con, no_credito: noCred
    };
    
    mostrarNotificacao("Gravando...", "aviso");
    chamarBackend('salvarModeloServidor', dados)
      .then(res => { 
        if (res.error) mostrarNotificacao(res.error, "erro"); 
        else { fecharModalModelo(); mostrarNotificacao("Modelo salvo!", "sucesso"); recarregarConfiguracoesGerais(); } 
      })
      .catch(err => mostrarNotificacao("Erro: " + err.message, "erro"));
  }

  function prepararEdicaoModelo(nome) {
    const m = configModelos.find(x => x.nome === nome); if(!m) return;
    abrirModalModelo();
    document.getElementById('tituloModalModelo').innerHTML = "Editar Modelo";
    document.getElementById('iconeModalModelo').innerHTML = "edit";
    document.getElementById('inpIdModeloAntigo').value = m.nome;
    document.getElementById('inpNomeModelo').value = m.nome;
    document.getElementById('selTipoModelo').value = m.tipo;
    document.getElementById('inpDescricaoModelo').value = m.descricao || "";
    document.getElementById('txtObservacoesModelo').value = m.observacoes || ""; 
    document.getElementById('inpValorModelo').value = m.valor > 0 ? m.valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : "";
    
    alternarCamposModelo(); 
    
    if (m.tipo === 'TRANSFERENCIA') {
        document.getElementById('selOrigemModelo').value = m.categoria || "";
        document.getElementById('selDestinoModelo').value = m.conta || "";
    } else {
        document.getElementById('selCategoriaModelo').value = m.categoria || "";
        document.getElementById('selContaModelo').value = m.conta || "";
        document.getElementById('selCreditoModelo').value = m.no_credito ? 'SIM' : 'NAO';
    }
  }

  function confirmarExclusaoModelo(nome) {
    const b = document.getElementById('confirmModalBody');
    b.innerHTML = `Excluir o modelo rápido <strong>${nome}</strong>?<br><br><span class="text-xs text-sucesso">Isso não afeta os lançamentos que já usaram ele.</span>`;
    abrirJanela('confirmModal');
    
    document.getElementById('btnConfirmCancelar').onclick = () => fecharJanela('confirmModal');
    document.getElementById('btnConfirmSim').onclick = () => {
      fecharJanela('confirmModal');
      mostrarNotificacao("Removendo...", "aviso");
      chamarBackend('excluirModeloServidor', nome)
        .then(res => { if(res.error) mostrarNotificacao(res.error, "erro"); else { mostrarNotificacao("Removido!"); recarregarConfiguracoesGerais(); } })
        .catch(err => mostrarNotificacao("Erro: " + err.message, "erro"));
    };
  }

  function aplicarModeloLancamento(nomeModelo) {
    if (!nomeModelo) { document.getElementById('formLancamento').reset(); document.getElementById('inpIdLancamento').value = ""; verificarExibicaoCredito(); return; }
    
    const m = configModelos.find(x => x.nome === nomeModelo); if (!m) return;
    
    const r = document.querySelector(`input[name="tipo_fluxo"][value="${m.tipo}"]`);
    if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
    
    if (m.descricao) document.getElementById('inpDescricao').value = m.descricao;
    if (m.observacoes) document.getElementById('txtObservacoes').value = m.observacoes; 
    if (m.valor > 0) document.getElementById('inpValor').value = m.valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    
    if (m.tipo === 'TRANSFERENCIA') {
        if (m.categoria) document.getElementById('selContaOrigem').value = m.categoria;
        if (m.conta) document.getElementById('selContaDestino').value = m.conta;
        atualizarObsTransferencia();
    } else {
        if (m.categoria) document.getElementById('selCategoria').value = m.categoria;
        if (m.conta) document.getElementById('selConta').value = m.conta;
        document.getElementById('inpNoCredito').checked = !!m.no_credito;
    }
    
    verificarExibicaoCredito('modelo');
    calcularDataPagamentoAutomatica();
    mostrarNotificacao(`Modelo "${m.nome}" aplicado.`, "sucesso");
  }

  function recarregarConfiguracoesGerais() {
    const skHtml = `<div class="flex flex-col gap-3 w-full"><div class="skeleton sk-rect" style="height: 55px;"></div><div class="skeleton sk-rect" style="height: 55px;"></div><div class="skeleton sk-rect" style="height: 55px;"></div></div>`;
    if(document.getElementById('listaConfigContas')) document.getElementById('listaConfigContas').innerHTML = skHtml;
    if(document.getElementById('listaConfigCategorias')) document.getElementById('listaConfigCategorias').innerHTML = skHtml;
    if(document.getElementById('listaConfigModelos')) document.getElementById('listaConfigModelos').innerHTML = skHtml;

    chamarBackend('obterConfiguracoesAtualizadas')
      .then(res => { 
        if (res.error) mostrarNotificacao(res.error, "erro"); 
        else {
          configContas = res.contas || []; configCategorias = res.categorias || []; configModelos = res.modelos || [];
          renderizarConfigContas(); renderizarConfigCategorias(); renderizarConfigModelos(); renderizarSeletoresFormulario(); renderizarAuditoria(); atualizarDadosDashboard();
          aplicarFiltros(false);
        } 
      })
      .catch(err => mostrarNotificacao("Erro ao recarregar: " + err.message, "erro"));
  }
  
  // ==========================================================================
  // 🧮 9. HELPERS E FORMATADORES DE DADOS
  // ==========================================================================
  function calcularDataPagamentoAutomatica(origem = null) {
    const conta = document.getElementById('selConta').value; 
    const noCredito = document.getElementById('inpNoCredito').checked; 
    const dCompra = document.getElementById('inpDataCompra').value; 
    const inpPag = document.getElementById('inpDataPag');
    
    if (!dCompra) return;
    
    if (origem !== 'data_pag') {
      if (!noCredito) { 
        inpPag.value = dCompra; 
      } else {
        const c = configContas.find(x => x.nome === conta); 
        if (c && c.fechamento && c.vencimento) {
          const pts = dCompra.split('-'); 
          let a = parseInt(pts[0]), m = parseInt(pts[1])-1, d = parseInt(pts[2]);
          if (d > parseInt(c.fechamento)) { m++; if (m > 11) { m = 0; a++; } }
          const dPag = new Date(a, m, parseInt(c.vencimento));
          inpPag.value = `${dPag.getFullYear()}-${String(dPag.getMonth()+1).padStart(2,'0')}-${String(dPag.getDate()).padStart(2,'0')}`;
        }
      }
    }
    
    const inpPago = document.getElementById('inpPago');
    if(inpPago && inpPag.value) {
      const hojeStr = new Date().toLocaleDateString('en-CA'); 
      inpPago.checked = (inpPag.value <= hojeStr);
    }
  }

  function formatarDataParaInput(d) {
    if (!d) return "";
    if (d.includes('T')) return d.split('T')[0];
    if (d.includes('/')) {
      const p = d.split('/');
      return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
    }
    return d;
  }

  function formatarMoedaInput(campo) {
    let v = campo.value.replace(/\D/g, '');
    if (!v) { campo.value = ''; return; }
    campo.value = (parseFloat(v) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function verificarCamposCreditoConta(valorHibrido) {
    const grupoCamposCredito = document.getElementById('grupoCamposCredito');
    if (grupoCamposCredito) {
      const tipo = (valorHibrido || "").toUpperCase();
      // Como o valor agora pode ser "CONTA CORRENTE;CRÉDITO", o includes() resolve perfeitamente!
      if (tipo.includes('CRÉDITO') || tipo.includes('CREDITO')) {
        grupoCamposCredito.classList.remove('hidden');
        grupoCamposCredito.classList.add('flex');
      } else {
        grupoCamposCredito.classList.add('hidden');
        grupoCamposCredito.classList.remove('flex');
      }
    }
  }

  // ==========================================================================
  // 📝 10. CRUD DE LANÇAMENTOS E LISTAGENS
  // ==========================================================================
  function processarEnvioLancamento(e) {
    e.preventDefault();
    
    let valStr = document.getElementById('inpValor').value;
    let v = parseFloat(valStr.replace(/\./g, '').replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
    if (v === 0) { mostrarNotificacao("Insira um valor válido.", "aviso"); return; }
    
    let obsTratada = document.getElementById('txtObservacoes').value.trim();
    if (obsTratada === '' || obsTratada === '-') obsTratada = '—';

    const id = document.getElementById('inpIdLancamento').value;
    const tipoFluxo = document.querySelector('input[name="tipo_fluxo"]:checked').value;
    const isPago = document.getElementById('inpPago').checked; 
    const btn = document.querySelector('button[form="formLancamento"]'); 
    const txt = btn.innerHTML; 
    btn.disabled = true; btn.innerHTML = "Salvando...";

    if (tipoFluxo === 'TRANSFERENCIA') {
        const origem = document.getElementById('selContaOrigem').value;
        const destino = document.getElementById('selContaDestino').value;
        if (!origem || !destino || origem === destino) {
            mostrarNotificacao("Selecione contas de origem e destino diferentes.", "aviso");
            btn.disabled = false; btn.innerHTML = txt; return;
        }
        const dados = { descricao: document.getElementById('inpDescricao').value, valor: v, origem: origem, destino: destino, data_compra: document.getElementById('inpDataCompra').value, data_pag: document.getElementById('inpDataPag').value, observacoes: obsTratada };
        
        chamarBackend('adicionarTransferenciaServidor', dados)
          .then(res => { 
            btn.disabled = false; btn.innerHTML = txt; 
            if(res.error) mostrarNotificacao(res.error, "erro"); 
            else { fecharModalLancamento(); mostrarNotificacao("Transferência Registrada!", "sucesso"); carregarLancamentosDoSheets(); } 
          })
          .catch(err => { btn.disabled=false; btn.innerHTML=txt; mostrarNotificacao(err.message, "erro"); });
        
    } else {
        const isCredito = document.getElementById('inpNoCredito').checked;
        const campoParcelas = document.getElementById('inpParcelas');
        const numParcelas = campoParcelas ? parseInt(campoParcelas.value) || 1 : 1;
        
        if (!id && isCredito && numParcelas > 1) {
            const loteRegistros = [];
            const valorBase = Math.floor((v / numParcelas) * 100) / 100; 
            const resto = Math.round((v - (valorBase * numParcelas)) * 100) / 100; 
            
            const dPagBase = new Date(document.getElementById('inpDataPag').value + 'T12:00:00'); 
            const dCompraStr = document.getElementById('inpDataCompra').value;
            const desc = document.getElementById('inpDescricao').value;
            const cat = document.getElementById('selCategoria').value;
            const con = document.getElementById('selConta').value;
            const hojeStr = new Date().toLocaleDateString('en-CA');
            
            for (let i = 1; i <= numParcelas; i++) {
                let valParcela = (i === 1) ? (valorBase + resto) : valorBase;
                let valorFinal = tipoFluxo === "DESPESA" ? -valParcela : valParcela;
                
                let dPagAtual = new Date(dPagBase);
                dPagAtual.setMonth(dPagBase.getMonth() + (i - 1));
                let strPag = `${dPagAtual.getFullYear()}-${String(dPagAtual.getMonth()+1).padStart(2,'0')}-${String(dPagAtual.getDate()).padStart(2,'0')}`;
                
                let obsParcela = `Parcela ${i}/${numParcelas}`;
                if (obsTratada !== '—') obsParcela += ` (${obsTratada})`;
                
                let idUnico = 'L' + Date.now() + '_' + Math.random().toString(36).substr(2, 4).toUpperCase();
                let statusPagoParcela = (strPag <= hojeStr);

                loteRegistros.push({
                    id: idUnico, data_pag: strPag, data_compra: dCompraStr, descricao: desc,
                    observacoes: obsParcela, categoria: cat, conta: con, no_credito: true, valor: valorFinal,
                    pago: statusPagoParcela 
                });
            }
            
            chamarBackend('importarEmLoteServidor', loteRegistros)
              .then(res => { 
                btn.disabled = false; btn.innerHTML = txt; 
                if(res.error) mostrarNotificacao(res.error, "erro"); 
                else { fecharModalLancamento(); mostrarNotificacao(`${numParcelas} parcelas geradas!`, "sucesso"); carregarLancamentosDoSheets(); } 
              })
              .catch(err => { btn.disabled=false; btn.innerHTML=txt; mostrarNotificacao(err.message, "erro"); });

        } else {
            const dados = { 
              id: id || null, tipo_fluxo: tipoFluxo, 
              descricao: document.getElementById('inpDescricao').value, valor: v, 
              categoria: document.getElementById('selCategoria').value, conta: document.getElementById('selConta').value, 
              no_credito: isCredito, 
              data_compra: document.getElementById('inpDataCompra').value, data_pag: document.getElementById('inpDataPag').value, 
              observacoes: obsTratada,
              pago: isPago
            };
            
            const acao = id ? 'atualizarLancamento' : 'adicionarLancamento';
            chamarBackend(acao, dados)
              .then(res => { 
                btn.disabled = false; btn.innerHTML = txt; 
                if(res.error) mostrarNotificacao(res.error, "erro"); 
                else { fecharModalLancamento(); mostrarNotificacao(id ? "Atualizado!" : "Gravado!", "sucesso"); carregarLancamentosDoSheets(); } 
              })
              .catch(err => { btn.disabled=false; btn.innerHTML=txt; mostrarNotificacao(err.message, "erro"); });
        }
    }
  }

  // ==========================================================================
  // 🌟 11. MOTOR DE TAG INPUT (ESTILO NOTION)
  // ==========================================================================
  const estadoMultiSelect = { fMes: [], fCategoria: [], fConta: [], mTipoConta: [] };
  const opcoesMultiSelect = { fMes: [], fCategoria: [], fConta: [], mTipoConta: [] };

  function renderizarTagInput(idFiltro, opcoes, placeholder = "Buscar...") {
      opcoesMultiSelect[idFiltro] = opcoes;
      const container = document.getElementById(`tag-${idFiltro}`);
      if (!container) return;

      container.innerHTML = `
          <div class="tag-input-container" onclick="focarTagInput('${idFiltro}')">
              <div class="tag-input-box" id="box-${idFiltro}">
                  <div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;" id="badges-${idFiltro}"></div>
                  <input type="text" id="input-${idFiltro}" class="tag-input-field" placeholder="${placeholder}" oninput="filtrarDropdownTag('${idFiltro}')" onfocus="filtrarDropdownTag('${idFiltro}')" onkeydown="handleTagKeydown(event, '${idFiltro}')">
              </div>
              <div class="tag-dropdown" id="dropdown-${idFiltro}"></div>
          </div>
      `;
      atualizarBadgesTag(idFiltro);
  }

  function atualizarBadgesTag(idFiltro) {
      const badgesContainer = document.getElementById(`badges-${idFiltro}`);
      if (!badgesContainer) return;
      
      let html = '';
      estadoMultiSelect[idFiltro].forEach(valor => {
          const label = opcoesMultiSelect[idFiltro].find(o => o.value === valor)?.label || valor;
          html += `<span class="tag-badge">${label} <span class="tag-remove" onclick="removerTag(event, '${idFiltro}', '${valor}')">✕</span></span>`;
      });
      badgesContainer.innerHTML = html;
      
      const input = document.getElementById(`input-${idFiltro}`);
      if(input) input.placeholder = estadoMultiSelect[idFiltro].length > 0 ? "" : "Buscar...";
  }

  function focarTagInput(idFiltro) {
      const input = document.getElementById(`input-${idFiltro}`);
      if (input) input.focus();
  }

  function filtrarDropdownTag(idFiltro) {
      const input = document.getElementById(`input-${idFiltro}`);
      const dropdown = document.getElementById(`dropdown-${idFiltro}`);
      if (!input || !dropdown) return;

      fecharTodosDropdownsTag(idFiltro);
      dropdown.classList.add('active');

      const termo = input.value.toLowerCase().trim();
      const opcoesDisponiveis = opcoesMultiSelect[idFiltro].filter(o => !estadoMultiSelect[idFiltro].includes(o.value));
      
      let filtradas = opcoesDisponiveis;
      if (termo) filtradas = opcoesDisponiveis.filter(o => o.label.toLowerCase().includes(termo));

      let html = '';
      if (filtradas.length === 0) {
          html = `<div class="tag-option empty">Nenhuma opção...</div>`;
      } else {
          filtradas.forEach(o => {
              html += `<div class="tag-option" onclick="adicionarTag('${idFiltro}', '${o.value}')">${o.label}</div>`;
          });
      }
      dropdown.innerHTML = html;
  }

  function adicionarTag(idFiltro, valor) {
      if (!estadoMultiSelect[idFiltro].includes(valor)) estadoMultiSelect[idFiltro].push(valor);
      const input = document.getElementById(`input-${idFiltro}`);
      if (input) { input.value = ''; input.blur(); }
      
      const dd = document.getElementById(`dropdown-${idFiltro}`);
      if(dd) dd.classList.remove('active');
      
      atualizarBadgesTag(idFiltro);
      
      // Bloqueio inteligente: Só filtra a tabela se não for o modal de configurações!
      if (idFiltro === 'mTipoConta') {
          verificarCamposCreditoConta(estadoMultiSelect[idFiltro].join(';'));
      } else {
          aplicarFiltros(true, idFiltro);
      }
  }

  function removerTag(event, idFiltro, valor) {
      event.stopPropagation();
      estadoMultiSelect[idFiltro] = estadoMultiSelect[idFiltro].filter(v => v !== valor);
      atualizarBadgesTag(idFiltro);
      
      if (idFiltro === 'mTipoConta') {
          verificarCamposCreditoConta(estadoMultiSelect[idFiltro].join(';'));
      } else {
          aplicarFiltros(true, idFiltro);
      }
  }

  function handleTagKeydown(event, idFiltro) {
      const input = document.getElementById(`input-${idFiltro}`);
      if (event.key === 'Backspace' && input.value === '') {
          if (estadoMultiSelect[idFiltro].length > 0) {
              estadoMultiSelect[idFiltro].pop();
              atualizarBadgesTag(idFiltro);
              aplicarFiltros(true, idFiltro);
          }
      }
  }

  function fecharTodosDropdownsTag(excetoId = null) {
      document.querySelectorAll('.tag-dropdown').forEach(d => {
          if (excetoId && d.id === `dropdown-${excetoId}`) return;
          d.classList.remove('active');
      });
  }

  document.addEventListener('click', function(e) {
      if (!e.target.closest('.tag-input-container')) fecharTodosDropdownsTag();
  });

  // ==========================================================================
  // ⚙️ 12. INTEGRAÇÃO DOS FILTROS E PESQUISA
  // ==========================================================================
  function carregarLancamentosDoSheets() {
    const skHtmlLista = `<tr><td colspan="10" class="p-0"><div class="flex flex-col gap-2 p-3"><div class="skeleton sk-rect" style="height: 45px;"></div><div class="skeleton sk-rect" style="height: 45px;"></div><div class="skeleton sk-rect" style="height: 45px;"></div></div></td></tr>`;
    const skHtmlCards = `<div class="flex flex-col gap-3 w-full p-2"><div class="skeleton sk-rect" style="height: 110px;"></div><div class="skeleton sk-rect" style="height: 110px;"></div></div>`;
    const skHtmlPivot = `<div class="flex flex-col gap-2 p-3 w-full"><div class="skeleton sk-rect" style="height: 35px;"></div><div class="skeleton sk-rect" style="height: 35px;"></div></div>`;
    
    // 1. CARREGAMENTO INSTANTÂNEO DOS LANÇAMENTOS
    const cacheStr = localStorage.getItem('finance_cache_lancamentos');
    if (cacheStr) {
      allLancamentos = JSON.parse(cacheStr);
      if (!sistemaInicializado) {
        if (estadoMultiSelect['fMes'].length === 0) {
          const hoje = new Date();
          estadoMultiSelect['fMes'] = [`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`];
        }
        sistemaInicializado = true;
      }
      inicializarDropdownMeses(); dadosFiltrados = [...allLancamentos]; aplicarFiltros(false); 
      renderizarConfigContas(); renderizarConfigCategorias(); renderizarConfigModelos(); 
      renderizarAuditoria(); preencherSeletorDashboard();
    } else {
      if (document.getElementById('tbodyLancamentos')) document.getElementById('tbodyLancamentos').innerHTML = skHtmlLista;
      if (document.getElementById('divCardsLancamentos')) document.getElementById('divCardsLancamentos').innerHTML = skHtmlCards;
      if (document.getElementById('dashListaPivotAnual')) document.getElementById('dashListaPivotAnual').innerHTML = skHtmlPivot;
    }

    mostrarSync();

    // 2. SINCRONIZAÇÃO SILENCIOSA COM A NUVEM (Dados Comprimidos)
    chamarBackend('obterLancamentos')
      .then(dadosDaNuvem => { 
        if(dadosDaNuvem.error){ ocultarSync(); return; } 
        
        const lancamentosNuvem = descomprimir(dadosDaNuvem) || [];
        const novoCacheJson = JSON.stringify(lancamentosNuvem);
        
        // Só renderiza tudo de novo se tiver lançamento novo ou deletado!
        if (cacheStr !== novoCacheJson) {
            localStorage.setItem('finance_cache_lancamentos', novoCacheJson);
            allLancamentos = lancamentosNuvem;
            
            if (!sistemaInicializado) {
              if (estadoMultiSelect['fMes'].length === 0) {
                const hoje = new Date();
                estadoMultiSelect['fMes'] = [`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`];
              }
              sistemaInicializado = true;
            }
            
            inicializarDropdownMeses(); dadosFiltrados = [...allLancamentos]; aplicarFiltros(false); 
            renderizarConfigContas(); renderizarConfigCategorias(); renderizarConfigModelos(); 
            renderizarAuditoria(); preencherSeletorDashboard();
        }
        ocultarSync();
      })
      .catch(err => {
        ocultarSync();
        if(!cacheStr) mostrarNotificacao("Falha ao obter lançamentos da nuvem.", "erro");
      });
  }

  function inicializarDropdownMeses() {
    const s = new Set();
    const t = document.getElementById('fTipoData').value;
    allLancamentos.forEach(l => { 
      if(l[t]) { 
        const d = new Date(l[t]); 
        s.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); 
      } 
    });
    const opcoesMes = Array.from(s).sort().reverse().map(m => {
      const pts = m.split('-'); 
      return { value: m, label: `${pts[1]}/${pts[0]}` };
    });
    renderizarTagInput('fMes', opcoesMes, 'Todos...');
  }

  function alternarBaseTemporal() {
    inicializarDropdownMeses();
    document.getElementById('fDataInicio').value = ""; 
    document.getElementById('fDataFim').value = ""; 
    aplicarFiltros();
  }

  function toggleResumoFiltros(forcarEstado = null) {
    const container = document.getElementById('resumoFiltrosContainer');
    const btn = document.getElementById('btnToggleResumo');
    const txtBtn = document.getElementById('txtBtnResumo');
    
    let mostrar = forcarEstado !== null ? forcarEstado : container.classList.contains('hidden');
    
    if (mostrar) {
      container.classList.remove('hidden');
      if(txtBtn) txtBtn.innerText = 'Ocultar totais';
      if(btn) btn.classList.add('ativo');
      localStorage.setItem('finance-show-resumo', 'true');
    } else {
      container.classList.add('hidden');
      if(txtBtn) txtBtn.innerText = 'Exibir totais';
      if(btn) btn.classList.remove('ativo');
      localStorage.setItem('finance-show-resumo', 'false');
    }
  }

  function alternarModoCredito(isChecked) {
    localStorage.setItem('finance-modo-credito', isChecked);
    aplicarFiltros(false); 
  }

  // ==========================================================================
  // ⚙️ MOTOR DE FILTROS E PESQUISA (MODULARIZADO)
  // ==========================================================================
  
  // FUNÇÃO MAESTRO: Orquestra a filtragem e a renderização
  function aplicarFiltros(eventoOuReset = true, idOrigem = null) {
    if (eventoOuReset !== false) { paginaAtual = 1; paginaAtualFuturos = 1; }
    
    // 1. Filtra pelo Tempo (Data Início, Data Fim, Mês)
    const dadosPreFiltrados = filtrarPorPeriodo();

    // 2. Atualiza dinamicamente as opções das Tags baseadas no período
    atualizarTagsDinamicas(dadosPreFiltrados, idOrigem);

    // 3. Filtra pelo Conteúdo (Busca, Categorias, Contas, Status, etc)
    const dadosBrutos = filtrarPorCamposDeConteudo(dadosPreFiltrados);

    // 4. Calcula e atualiza os totais dos Badges superiores
    atualizarBadgesLancamentos(dadosBrutos);

    // 5. Separa a linha do tempo (Presente/Passado vs Futuro)
    const separacao = separarLancamentosFuturos(dadosBrutos);
    dadosFiltrados = separacao.principais;
    dadosFuturos = separacao.futuros;

    // 6. Ordena e Renderiza a Interface
    executarOrdenacaoMatriz(); 
    executarOrdenacaoFuturos(); 
    renderizarTelaLancamentos();
    renderizarFuturos();
  }

  // --- MÓDULOS ESPECIALISTAS DA FILTRAGEM ---

  function filtrarPorPeriodo() {
    const tD = document.getElementById('fTipoData').value;
    const dI = document.getElementById('fDataInicio').value;
    const dF = document.getElementById('fDataFim').value;
    const fM_Array = estadoMultiSelect['fMes'] || [];
    
    return allLancamentos.filter(l => {
      if(!l[tD]) return false; 
      const d = new Date(l[tD]);
      const mesLanc = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

      if(fM_Array.length > 0 && !fM_Array.includes(mesLanc)) return false;
      if(dI && d < new Date(dI+"T00:00:00")) return false; 
      if(dF && d > new Date(dF+"T23:59:59")) return false;
      return true;
    });
  }

  function atualizarTagsDinamicas(dadosPreFiltrados, idOrigem) {
    const cats = new Set(), cons = new Set(); 
    dadosPreFiltrados.forEach(l => { if(l.categoria) cats.add(l.categoria); if(l.conta) cons.add(l.conta); });
    
    const opcoesCat = Array.from(cats).sort().map(c => ({value: c, label: c}));
    const opcoesCon = Array.from(cons).sort().map(c => ({value: c, label: c}));

    if (idOrigem !== 'fCategoria') {
      estadoMultiSelect['fCategoria'] = estadoMultiSelect['fCategoria'].filter(v => cats.has(v));
      renderizarTagInput('fCategoria', opcoesCat, 'Todas...');
    } else { opcoesMultiSelect['fCategoria'] = opcoesCat; }
    
    if (idOrigem !== 'fConta') {
      estadoMultiSelect['fConta'] = estadoMultiSelect['fConta'].filter(v => cons.has(v));
      renderizarTagInput('fConta', opcoesCon, 'Todas...');
    } else { opcoesMultiSelect['fConta'] = opcoesCon; }
  }

  function filtrarPorCamposDeConteudo(dadosPreFiltrados) {
    const bOmni = (document.getElementById('fBuscaOmni') ? document.getElementById('fBuscaOmni').value : '').toLowerCase().trim();
    const bDesc = document.getElementById('fDescricao').value.toLowerCase().trim();
    const bObs = document.getElementById('fObservacoes').value.toLowerCase().trim();
    const fCr = document.getElementById('fCredito').value;
    const fTipoFluxo = document.getElementById('fTipoFluxo') ? document.getElementById('fTipoFluxo').value : '';
    
    const finalCats = estadoMultiSelect['fCategoria'] || [];
    const finalCons = estadoMultiSelect['fConta'] || [];

    return dadosPreFiltrados.filter(l => {
      if (bOmni) {
        const valF = Math.abs(l.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).toLowerCase();
        const str = `${l.descricao||''} ${l.observacoes||''} ${l.categoria||''} ${l.conta||''} ${valF}`.toLowerCase();
        if (!str.includes(bOmni)) return false;
      }
      if (bDesc && !(l.descricao || '').toLowerCase().includes(bDesc)) return false;
      if (bObs && !(l.observacoes || '').toLowerCase().includes(bObs)) return false;
      if (finalCats.length > 0 && !finalCats.includes(l.categoria)) return false; 
      if (finalCons.length > 0 && !finalCons.includes(l.conta)) return false;
      if (fCr === "SIM" && !l.no_credito) return false; 
      if (fCr === "NAO" && l.no_credito) return false;
      if (fTipoFluxo === 'RECEITA' && l.valor < 0) return false;
      if (fTipoFluxo === 'DESPESA' && l.valor > 0) return false;
      return true;
    });
  }

  function atualizarBadgesLancamentos(dadosBrutos) {
    let sumRecFiltro = 0, sumDespFiltro = 0;
    const contarCredito = document.getElementById('chkModoCredito') ? document.getElementById('chkModoCredito').checked : false;

    dadosBrutos.forEach(l => {
      if (l.categoria === 'Movimentações') return; 

      if (contarCredito) {
        if (l.categoria === 'Faturas') return; 
      } else {
        const ehCredito = (l.no_credito === true || l.no_credito === 'SIM' || String(l.no_credito).toUpperCase() === 'TRUE');
        if (ehCredito) return; 
      }

      if (l.valor > 0) sumRecFiltro += l.valor;
      else sumDespFiltro += Math.abs(l.valor);
    });
    
    const bRec = document.getElementById('badgeTopRec');
    const bDesp = document.getElementById('badgeTopDesp');
    const bBal = document.getElementById('badgeTopBal');
    
    if (bRec) document.getElementById('sumRecFiltrado').innerText = sumRecFiltro.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    if (bDesp) document.getElementById('sumDespFiltrado').innerText = sumDespFiltro.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    
    if (bBal) {
      let balanco = sumRecFiltro - sumDespFiltro;
      document.getElementById('sumBalFiltrado').innerText = Math.abs(balanco).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
      
      if (balanco >= 0) {
        bBal.className = 'badge-mini badge-receita flex items-center';
        document.getElementById('lblBalFiltrado').innerText = 'B: +';
      } else {
        bBal.className = 'badge-mini badge-despesa flex items-center';
        document.getElementById('lblBalFiltrado').innerText = 'B: -';
      }
    }
  }

  function separarLancamentosFuturos(dadosBrutos) {
    const tD = document.getElementById('fTipoData').value;
    const dF = document.getElementById('fDataFim').value;
    const fM_Array = estadoMultiSelect['fMes'] || [];
    
    const arrPrincipais = [];
    const arrFuturos = [];

    if (tD === 'data_compra') {
      const dtHoje = new Date();
      const hojeStr = `${dtHoje.getFullYear()}-${String(dtHoje.getMonth()+1).padStart(2,'0')}-${String(dtHoje.getDate()).padStart(2,'0')}`;
      
      let fronteira = hojeStr; 

      if (dF) {
        fronteira = dF; // Respeita a data Fim estrita do usuário
      } else if (fM_Array.length > 0) {
        const maxMes = [...fM_Array].sort().reverse()[0]; 
        const [ano, mes] = maxMes.split('-');
        const ultimoDia = new Date(ano, parseInt(mes), 0);
        const ultimoDiaStr = `${ultimoDia.getFullYear()}-${String(ultimoDia.getMonth()+1).padStart(2,'0')}-${String(ultimoDia.getDate()).padStart(2,'0')}`;
        
        // A MÁGICA DO BUG FIX: A fronteira do mês nunca pode ser maior que o dia de hoje!
        fronteira = ultimoDiaStr > hojeStr ? hojeStr : ultimoDiaStr;
      }

      dadosBrutos.forEach(l => {
        let ehFuturo = false;
        if (l.data_pag) {
          const dPag = l.data_pag.split('T')[0];
          if (dPag > fronteira) ehFuturo = true;
        }
        if (ehFuturo) arrFuturos.push(l); 
        else arrPrincipais.push(l); 
      });
      
      return { principais: arrPrincipais, futuros: arrFuturos };
    }
    
    // Se o filtro base for Data de Pagamento, nada vai para a gaveta
    return { principais: dadosBrutos, futuros: [] };
  }

  function resetarFiltrosGerais() {
    const form = document.getElementById('formFiltros');
    if (form) form.reset(); // Zera instantaneamente todos os selects e inputs nativos!

    const hoje = new Date();
    estadoMultiSelect['fMes'] = [`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`];
    estadoMultiSelect['fCategoria'] = [];
    estadoMultiSelect['fConta'] = [];

    colunaAtivaOrdenacao = 'data_compra';
    ordenacaoAscendente = false;
    colunaAtivaOrdenacaoFuturos = 'data_compra';
    ordenacaoAscendenteFuturos = false;
    
    // Como os selects nativos foram resetados, precisamos disparar o evento para o mobile
    if (document.getElementById('fOrdenacaoMobile')) {
      document.getElementById('fOrdenacaoMobile').value = 'data_compra_desc';
    }

    inicializarDropdownMeses();
    aplicarFiltros();
    fecharJanela('filtrosModal');
    mostrarNotificacao("Filtros e ordenação redefinidos.");
  }

  function mudarOrdenacao(col) {
    if(colunaAtivaOrdenacao === col) ordenacaoAscendente = !ordenacaoAscendente;
    else { colunaAtivaOrdenacao = col; ordenacaoAscendente = (col !== 'data_pag' && col !== 'data_compra' && col !== 'valor'); }
    executarOrdenacaoMatriz(); renderizarTelaLancamentos();
  }

  function ordenarPeloCelular(val) {
    if(val === 'data_compra_desc') { colunaAtivaOrdenacao = 'data_compra'; ordenacaoAscendente = false; }
    else if(val === 'data_compra_asc') { colunaAtivaOrdenacao = 'data_compra'; ordenacaoAscendente = true; }
    else if(val === 'valor_desc') { colunaAtivaOrdenacao = 'valor'; ordenacaoAscendente = false; }
    else if(val === 'valor_asc') { colunaAtivaOrdenacao = 'valor'; ordenacaoAscendente = true; }
    
    executarOrdenacaoMatriz();
    renderizarTelaLancamentos();
  }

  function executarOrdenacaoMatriz() {
    dadosFiltrados.sort((a, b) => {
      let iA = a[colunaAtivaOrdenacao]||'', iB = b[colunaAtivaOrdenacao]||'', r = 0;
      if(typeof iA==='number'&&typeof iB==='number') r = iA-iB; else if(typeof iA==='boolean') r = iA===iB ? 0 : iA ? 1 : -1; else r = String(iA).localeCompare(String(iB),'pt-BR',{numeric:true,sensitivity:'base'});
      return ordenacaoAscendente ? r : -r;
    });
    ['data_compra','data_pag','descricao','observacoes','categoria','conta','no_credito','valor'].forEach(c => { const s = document.getElementById(`seta-${c}`); if(s) { s.innerHTML = c===colunaAtivaOrdenacao ? (ordenacaoAscendente ? '▲' : '▼') : ''; s.style.color = 'var(--cor-destaque)'; }});
  }

  function mudarOrdenacaoFuturos(col) {
    if(colunaAtivaOrdenacaoFuturos === col) ordenacaoAscendenteFuturos = !ordenacaoAscendenteFuturos;
    else { colunaAtivaOrdenacaoFuturos = col; ordenacaoAscendenteFuturos = (col !== 'data_pag' && col !== 'data_compra' && col !== 'valor'); }
    executarOrdenacaoFuturos(); 
    renderizarFuturos();
  }

  function executarOrdenacaoFuturos() {
    dadosFuturos.sort((a, b) => {
      let iA = a[colunaAtivaOrdenacaoFuturos]||'', iB = b[colunaAtivaOrdenacaoFuturos]||'', r = 0;
      if(typeof iA==='number'&&typeof iB==='number') r = iA-iB; else if(typeof iA==='boolean') r = iA===iB ? 0 : iA ? 1 : -1; else r = String(iA).localeCompare(String(iB),'pt-BR',{numeric:true,sensitivity:'base'});
      return ordenacaoAscendenteFuturos ? r : -r;
    });
    ['data_compra','data_pag','descricao','observacoes','categoria','conta','no_credito','valor'].forEach(c => { const s = document.getElementById(`seta-futuro-${c}`); if(s) { s.innerHTML = c===colunaAtivaOrdenacaoFuturos ? (ordenacaoAscendenteFuturos ? '▲' : '▼') : ''; s.style.color = 'var(--cor-aviso)'; }});
  }

  function renderizarBotoesPaginadorFuturos(tot) {
    const cb = document.getElementById('pBotoesFuturos'); 
    cb.innerHTML = ''; 
    const tP = Math.ceil(tot / registrosPorPagina); 
    if (tP <= 1) return;

    const addBtn = (texto, page, isCurrent = false, isDisabled = false) => {
      const b = document.createElement('button');
      b.className = isCurrent ? 'btn-aviso' : 'btn-secundario'; 
      b.innerHTML = texto;
      
      if (isDisabled) { 
        b.disabled = true; 
        if (texto === '...') b.className = 'btn-ellipsis';
        else b.classList.add('cursor-not-allowed');
      } else if (!isCurrent && page) { 
        b.onclick = () => { paginaAtualFuturos = page; renderizarFuturos(); }; 
      }
      cb.appendChild(b);
    };

    addBtn('<span class="material-icons text-aviso" style="font-size:1.2rem; margin:0;">chevron_left</span>', paginaAtualFuturos - 1, false, paginaAtualFuturos === 1);
    
    let startPage = Math.max(1, paginaAtualFuturos - 2); let endPage = Math.min(tP, paginaAtualFuturos + 2);
    if (paginaAtualFuturos <= 3) { endPage = Math.min(5, tP); }
    if (paginaAtualFuturos >= tP - 2) { startPage = Math.max(1, tP - 4); }

    if (startPage > 1) { addBtn('1', 1); if (startPage > 2) addBtn('...', null, false, true); }
    for (let i = startPage; i <= endPage; i++) addBtn(i, i, i === paginaAtualFuturos);
    if (endPage < tP) { if (endPage < tP - 1) addBtn('...', null, false, true); addBtn(tP, tP); }
    
    addBtn('<span class="material-icons text-aviso" style="font-size:1.2rem; margin:0;">chevron_right</span>', paginaAtualFuturos + 1, false, paginaAtualFuturos === tP);
  }

  function gerarHtmlLancamento(l, isFuturo = false) {
    const isSelected = itensSelecionadosLote.has(l.id);
    const cConfig = configContas.find(c => c.nome === l.conta);
    const cor = (cConfig && cConfig.cor) ? cConfig.cor : '#95a5a6';
    
    const valReal = Math.abs(l.valor);
    const valF = valReal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    const clsValor = l.valor < 0 ? 'valor-negativo' : 'valor-positivo';
    const prefixoValor = l.valor < 0 ? '-' : '';

    const dC = l.data_compra ? new Date(l.data_compra).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '—';
    const dP = l.data_pag ? new Date(l.data_pag).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '—';

    const iconePago = l.pago 
      ? `<span class="material-icons shrink-0" style="font-size: 1.1rem; color: var(--cor-sucesso);" title="Pago">check_circle</span>` 
      : `<span class="material-icons shrink-0" style="font-size: 1.1rem; color: var(--cor-aviso);" title="Pendente">schedule</span>`;
    
    const iconeCreditoTabela = l.no_credito ? `<span class="material-icons shrink-0" style="color:${cor}; font-size:1.15rem;" title="Crédito">credit_card</span>` : '';
    const badgeCreditoCard = l.no_credito ? `<span class="badge-credito shrink-0" style="background:${cor}20; color:${cor};"><span class="material-icons text-xs">credit_card</span></span>` : '';

    const opacityClass = isFuturo ? 'opacity-80' : '';
    const textClassDesc = isFuturo ? 'text-suave' : 'text-principal';

    // 1. Gera a Linha da Tabela (Desktop)
    const htmlLinha = `
      <tr id="row-${l.id}" class="${isSelected ? 'linha-selecionada' : ''} ${opacityClass}">
        <td class="text-center" style="width: 32px;">
          <input type="checkbox" class="chk-lote cursor-pointer m-0" data-id="${l.id}" onchange="alternarSelecaoLote('${l.id}', this.checked)" ${isSelected ? 'checked' : ''} style="width: 16px; height: 16px;">
        </td>
        <td class="text-sm whitespace-nowrap">${dC}</td>
        <td class="text-sm whitespace-nowrap">${dP}</td>
        <td>
          <div class="flex items-center gap-1">
            ${iconePago} 
            <strong style="color:var(--${isFuturo ? 'texto-suave' : 'texto-principal'});">${l.descricao}</strong>
            ${iconeCreditoTabela}
          </div>
        </td>
        <td><div class="text-sm text-suave italic max-w-sm" style="line-height: 1.3;">${l.observacoes || '—'}</div></td>
        <td>
          <span class="inline-flex items-center gap-1 bg-principal p-1 rounded text-sm whitespace-nowrap">
            <span class="material-icons text-suave" style="font-size: 1.1rem;">${getCatIcon(l.categoria)}</span>
            <span style="line-height: 1;">${l.categoria}</span>
          </span>
        </td>
        <td>
          <span class="inline-flex items-center gap-1 whitespace-nowrap text-sm">
            <span class="bolinha-cor" style="background:${cor};"></span>
            <span style="line-height: 1;">${l.conta}</span>
          </span>
        </td>
        <td class="text-right whitespace-nowrap font-bold ${clsValor}">${prefixoValor}${valF}</td>
        <td class="text-center">
          <div class="flex items-center justify-center gap-1">
            <button onclick="prepararCopia('${l.id}')" class="btn-icone p-1 text-suave" title="Duplicar"><i class="material-icons text-base">content_copy</i></button>
            <button onclick="prepararEdicao('${l.id}')" class="btn-icone p-1 icone-edit" title="Editar"><i class="material-icons text-base">edit</i></button>
            <button onclick="confirmarExclusao('${l.id}')" class="btn-icone p-1 icone-delete" title="Excluir"><i class="material-icons text-base">delete</i></button>
          </div>
        </td>
      </tr>`;

    // 2. Gera o Card (Mobile) blindado com a nova classe
    const htmlCard = `
      <div id="card-${l.id}" class="card-lancamento ${isSelected ? 'card-selecionado' : ''} ${opacityClass}" style="border-left: 4px solid ${cor};" onmousedown="iniciarToqueLongo(event, '${l.id}')" onmouseup="cancelarToqueLongo()" onmouseleave="cancelarToqueLongo()" ontouchstart="iniciarToqueLongo(event, '${l.id}')" ontouchend="cancelarToqueLongo()" onclick="cliqueCard(event, '${l.id}')">
        <input type="checkbox" class="chk-lote hidden" data-id="${l.id}" onchange="alternarSelecaoLote('${l.id}', this.checked)" ${isSelected ? 'checked' : ''}>
        
        <div class="flex justify-between items-center mb-2">
          <div class="text-xs text-suave font-medium flex gap-2 shrink-0"><span>C: ${dC}</span><span>•</span><span>P: ${dP}</span></div>
          <div class="flex gap-1 shrink-0">
            <button onclick="prepararCopia('${l.id}')" class="btn-icone btn-mini text-suave" title="Duplicar"><span class="material-icons text-lg">content_copy</span></button>
            <button onclick="prepararEdicao('${l.id}')" class="btn-icone btn-mini icone-edit" title="Editar"><span class="material-icons text-lg">edit</span></button>
            <button onclick="confirmarExclusao('${l.id}')" class="btn-icone btn-mini icone-delete" title="Excluir"><span class="material-icons text-lg">delete</span></button>
          </div>
        </div>
        
        <div class="text-base font-bold ${textClassDesc} flex items-start gap-2 mb-2 line-clamp-2" style="line-height:1.2;">
          ${iconePago}
          <span style="flex: 1;">${l.descricao}</span>
          ${badgeCreditoCard}
        </div>
        
        ${l.observacoes ? `<div class="text-xs text-suave bg-principal p-1 rounded mb-2 truncate italic">Obs: ${l.observacoes}</div>` : ''}
        
        <div class="card-lancamento-footer">
          <div class="flex-col flex-1 gap-1 min-w-0">
            <span class="text-xs text-suave flex items-center gap-1 truncate"><span class="material-icons text-sm shrink-0">${getCatIcon(l.categoria)}</span><span class="truncate">${l.categoria}</span></span>
            <span class="text-xs text-suave flex items-center gap-1 truncate"><span class="bolinha-cor shrink-0" style="background:${cor};"></span><span class="truncate">${l.conta}</span></span>
          </div>
          <div class="text-lg font-bold shrink-0 text-right ${clsValor}">${prefixoValor}${valF}</div>
        </div>
      </div>`;

    return { linha: htmlLinha, card: htmlCard };
  }

  function renderizarTelaLancamentos() {
    const tb = document.getElementById('tbodyLancamentos'), dc = document.getElementById('divCardsLancamentos'), tot = dadosFiltrados.length;
    tb.innerHTML = ''; dc.innerHTML = '';
    
    const chkAll = document.getElementById('chkSelectAll');
    if(chkAll) chkAll.checked = false;

    if(tot === 0) { 
      tb.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:50px 20px; background:var(--bg-principal);">
        <span class="material-icons" style="font-size:3rem; color:var(--borda); margin-bottom:10px;">inbox</span>
        <h4 style="margin:0; color:var(--texto-principal); font-size:1.1rem;">Nenhum lançamento encontrado</h4>
        <p style="margin:5px 0 0 0; color:var(--texto-suave); font-size:0.9rem;">Tente ajustar os filtros ou crie um novo registro.</p>
      </td></tr>`; 
      
      dc.innerHTML = `<div style="text-align:center; padding:40px 20px; background:var(--bg-card); border-radius:8px; border:1px dashed var(--borda);">
        <span class="material-icons" style="font-size:3rem; color:var(--borda); margin-bottom:10px;">inbox</span>
        <h4 style="margin:0; color:var(--texto-principal); font-size:1.1rem;">Lista vazia</h4>
        <p style="margin:5px 0 0 0; color:var(--texto-suave); font-size:0.9rem;">Ajuste os filtros acima.</p>
      </div>`; 
      
      document.getElementById('pInfo').innerHTML = '0 de 0'; 
      document.getElementById('pBotoes').innerHTML = ''; 
      return; 
    }
    
    const iIni = (paginaAtual - 1) * registrosPorPagina, iFim = Math.min(iIni + registrosPorPagina, tot);
    document.getElementById('pInfo').innerHTML = `Mostrando ${iIni+1} a ${iFim} de ${tot}.`;
    renderizarBotoesPaginador(tot);

    dadosFiltrados.slice(iIni, iFim).forEach(l => {
      const htmlGerado = gerarHtmlLancamento(l, false);
      tb.innerHTML += htmlGerado.linha;
      dc.innerHTML += htmlGerado.card;
    });
  }

  function renderizarFuturos() {
    const container = document.getElementById('containerFuturos');
    if (!container) return;
    if (dadosFuturos.length === 0) { container.classList.add('hidden'); return; }
    
    container.classList.remove('hidden');
    let sumDespesas = 0, sumReceitas = 0;
    const contarCredito = document.getElementById('chkModoCredito') ? document.getElementById('chkModoCredito').checked : false;
    
    dadosFuturos.forEach(l => { 
        if (l.categoria === 'Movimentações') return;

        if (contarCredito) {
            if (l.categoria === 'Faturas') return; 
        } else {
            const ehCredito = (l.no_credito === true || l.no_credito === 'SIM' || String(l.no_credito).toUpperCase() === 'TRUE');
            if (ehCredito) return; 
        }

        if(l.valor < 0) sumDespesas += Math.abs(l.valor); 
        else sumReceitas += l.valor; 
    });
    
    document.getElementById('txtResumoFuturos').innerHTML = `<strong>${dadosFuturos.length}</strong> lançamentos com pagamentos nos meses seguintes`;
    
    let balanco = sumReceitas - sumDespesas;
    let clsBal = balanco >= 0 ? 'badge-receita' : 'badge-despesa';
    let prefixoBal = balanco >= 0 ? '+' : '-';
    
    let htmlBadgesFuturos = '';
    
    if (sumDespesas === 0 && sumReceitas === 0) {
        htmlBadgesFuturos = `
        <div id="txtHintFuturos">
            <span class="material-icons" style="font-size: 1rem;">info</span> 
            Ative "Somar Crédito" para calcular lançamentos no crédito.
        </div>`;
    } else {
        htmlBadgesFuturos = `
            <div class="badge-mini ${clsBal} badge-futuro-balanco">B: ${prefixoBal} <span>${Math.abs(balanco).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div>
            <div class="badge-mini badge-despesa">D: <span>${sumDespesas.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div>
            <div class="badge-mini badge-receita">R: <span>${sumReceitas.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div>
        `;
    }
    
    document.getElementById('txtValoresFuturos').innerHTML = htmlBadgesFuturos;

    const tot = dadosFuturos.length;
    const iIni = (paginaAtualFuturos - 1) * registrosPorPagina;
    const iFim = Math.min(iIni + registrosPorPagina, tot);

    document.getElementById('pInfoFuturos').innerHTML = `Mostrando ${iIni+1} a ${iFim} de ${tot}.`;
    renderizarBotoesPaginadorFuturos(tot);

    const tb = document.getElementById('tbodyFuturos'), dc = document.getElementById('divCardsFuturos');
    tb.innerHTML = ''; dc.innerHTML = '';
    
    dadosFuturos.slice(iIni, iFim).forEach(l => {
      const htmlGerado = gerarHtmlLancamento(l, true);
      tb.innerHTML += htmlGerado.linha;
      dc.innerHTML += htmlGerado.card;
    });
  }

  function renderizarBotoesPaginador(tot) {
    const cb = document.getElementById('pBotoes'); 
    cb.innerHTML = ''; 
    const tP = Math.ceil(tot / registrosPorPagina); 
    if (tP <= 1) return;

    const addBtn = (texto, page, isCurrent = false, isDisabled = false) => {
      const b = document.createElement('button');
      b.className = isCurrent ? 'btn-primario' : 'btn-secundario'; // Usa as classes nativas do btn-group
      b.innerHTML = texto;
      
      if (isDisabled) { 
        b.disabled = true; 
        if (texto === '...') b.className = 'btn-ellipsis';
        else b.classList.add('cursor-not-allowed');
      } else if (!isCurrent && page) { 
        b.onclick = () => { paginaAtual = page; renderizarTelaLancamentos(); }; 
      }
      cb.appendChild(b);
    };

    // Ícones em vez de texto!
    addBtn('<span class="material-icons text-destaque" style="font-size:1.2rem; margin:0;">chevron_left</span>', paginaAtual - 1, false, paginaAtual === 1);

    let startPage = Math.max(1, paginaAtual - 2); let endPage = Math.min(tP, paginaAtual + 2);
    if (paginaAtual <= 3) { endPage = Math.min(5, tP); }
    if (paginaAtual >= tP - 2) { startPage = Math.max(1, tP - 4); }

    if (startPage > 1) { addBtn('1', 1); if (startPage > 2) addBtn('...', null, false, true); }
    for (let i = startPage; i <= endPage; i++) addBtn(i, i, i === paginaAtual);
    if (endPage < tP) { if (endPage < tP - 1) addBtn('...', null, false, true); addBtn(tP, tP); }
    
    // Ícones em vez de texto!
    addBtn('<span class="material-icons text-destaque" style="font-size:1.2rem; margin:0;">chevron_right</span>', paginaAtual + 1, false, paginaAtual === tP);
  }

  function mudarLimitePagina(valor) {
    registrosPorPagina = parseInt(valor);
    paginaAtual = 1;
    paginaAtualFuturos = 1;
    renderizarTelaLancamentos();
    renderizarFuturos();
  }

  // ==========================================================================
  // 🛠️ 13. MANIPULADORES ÚNICOS DE LANÇAMENTOS
  // ==========================================================================
  function prepararEdicao(id) {
    const l = allLancamentos.find(x => x.id === id); if(!l) return;
    if (document.getElementById('labelTransferencia')) document.getElementById('labelTransferencia').classList.add('hidden');
    
    document.getElementById('lancamentoModal').classList.remove('hidden');
    document.getElementById('modalBackdrop').classList.remove('hidden');
    document.getElementById('tituloModalLancamento').innerHTML = "Editar Lançamento";
    document.getElementById('iconeModalLancamento').innerHTML = "edit";
    document.getElementById('inpIdLancamento').value = l.id;

    const r = document.querySelector(`input[name="tipo_fluxo"][value="${l.valor<0?'DESPESA':'RECEITA'}"]`); if(r){ r.checked=true; r.dispatchEvent(new Event('change')); }
    
    document.getElementById('inpDescricao').value = l.descricao||""; 
    document.getElementById('selCategoria').value = l.categoria||""; 
    document.getElementById('selConta').value = l.conta||""; 
    document.getElementById('txtObservacoes').value = l.observacoes||""; 
    document.getElementById('inpNoCredito').checked = !!l.no_credito;
    document.getElementById('inpPago').checked = !!l.pago; 
    
    if (document.getElementById('divParcelas')) document.getElementById('divParcelas').classList.add('hidden');
    document.getElementById('inpValor').value = Math.abs(l.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    document.getElementById('inpDataCompra').value = formatarDataParaInput(l.data_compra);
    document.getElementById('inpDataPag').value = formatarDataParaInput(l.data_pag);
    
    verificarExibicaoCredito('categoria'); 
  }

  function prepararCopia(id) {
    const l = allLancamentos.find(x => x.id === id); if(!l) return;
    document.getElementById('lancamentoModal').classList.remove('hidden');
    document.getElementById('modalBackdrop').classList.remove('hidden');
    document.getElementById('tituloModalLancamento').innerHTML = "Duplicar Lançamento";
    document.getElementById('iconeModalLancamento').innerHTML = "content_copy";
    document.getElementById('inpIdLancamento').value = "";
    
    const r = document.querySelector(`input[name="tipo_fluxo"][value="${l.valor < 0 ? 'DESPESA' : 'RECEITA'}"]`); 
    if(r) { r.checked = true; r.dispatchEvent(new Event('change')); }
    
    document.getElementById('inpDescricao').value = (l.descricao || "") + " (Cópia)"; 
    document.getElementById('selCategoria').value = l.categoria || ""; 
    document.getElementById('selConta').value = l.conta || ""; 
    document.getElementById('txtObservacoes').value = l.observacoes || ""; 
    document.getElementById('inpNoCredito').checked = !!l.no_credito;
    document.getElementById('inpPago').checked = !!l.pago; 
    
    document.getElementById('inpValor').value = Math.abs(l.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    document.getElementById('inpDataCompra').value = formatarDataParaInput(l.data_compra);
    document.getElementById('inpDataPag').value = formatarDataParaInput(l.data_pag);
    
    verificarExibicaoCredito('categoria'); 
  }

  function confirmarExclusao(id) {
    const l = allLancamentos.find(x => x.id === id); if(!l) return;
    const b = document.getElementById('confirmModalBody');
    b.innerHTML = `Excluir o registro abaixo?<br><br><strong>Descrição:</strong> ${l.descricao}<br><strong>Valor:</strong> <span class="${l.valor<0?'valor-negativo':'valor-positivo'}">${l.valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span>`;
    abrirJanela('confirmModal');
    
    document.getElementById('btnConfirmCancelar').onclick = () => fecharJanela('confirmModal');
    document.getElementById('btnConfirmSim').onclick = () => {
      fecharJanela('confirmModal');
      mostrarNotificacao("Excluindo...", "aviso");
      chamarBackend('excluirLancamento', id)
        .then(res => { if(res.error) mostrarNotificacao(res.error, "erro"); else { mostrarNotificacao("Excluído!"); carregarLancamentosDoSheets(); } })
        .catch(err => mostrarNotificacao("Erro: " + err.message, "erro"));
    };
  }

  // ==========================================================================
  // 🗃️ 14. GESTÃO DE AÇÕES EM LOTE (SELEÇÃO) E EXCLUSÃO/EDIÇÃO
  // ==========================================================================
  document.addEventListener('touchmove', () => { isDraggingMobile = true; cancelarToqueLongo(); }, { passive: true });

  function iniciarToqueLongo(e, id) {
    if(e.target.closest('button')) return; 
    isDraggingMobile = false;
    if (itensSelecionadosLote.size > 0) return; 

    pressTimerLote = setTimeout(() => {
      if(!isDraggingMobile) {
        alternarSelecaoCard(id);
        try {
          if (navigator.vibrate) navigator.vibrate(50); 
        } catch (err) {
          // Ignora silenciosamente se o navegador bloquear a vibração no iframe
        }
      }
    }, 500); 
  }

  function cancelarToqueLongo() { clearTimeout(pressTimerLote); }

  function cliqueCard(e, id) {
    if(e.target.closest('button')) return;
    if (itensSelecionadosLote.size > 0) alternarSelecaoCard(id);
  }

  function alternarSelecaoCard(id) {
    const isSelected = itensSelecionadosLote.has(id);
    if (isSelected) itensSelecionadosLote.delete(id); else itensSelecionadosLote.add(id);
    
    // Atualiza o Card Mobile
    const card = document.getElementById(`card-${id}`);
    if (card) { if(itensSelecionadosLote.has(id)) card.classList.add('card-selecionado'); else card.classList.remove('card-selecionado'); }
    
    // Atualiza a Linha da Tabela
    const row = document.getElementById(`row-${id}`);
    if (row) { if(itensSelecionadosLote.has(id)) row.classList.add('linha-selecionada'); else row.classList.remove('linha-selecionada'); }

    // Sincroniza o Checkbox Oculto
    const chk = document.querySelector(`.chk-lote[data-id="${id}"]`);
    if (chk) chk.checked = itensSelecionadosLote.has(id);
    
    atualizarBarraLote();
    sincronizarSelectAll(); 
  }

  function alternarSelecaoLote(id, isChecked) {
    if (isChecked) itensSelecionadosLote.add(id); else itensSelecionadosLote.delete(id);
    
    const card = document.getElementById(`card-${id}`);
    if (card) { if(isChecked) card.classList.add('card-selecionado'); else card.classList.remove('card-selecionado'); }
    
    const row = document.getElementById(`row-${id}`);
    if (row) { if(isChecked) row.classList.add('linha-selecionada'); else row.classList.remove('linha-selecionada'); }
    
    atualizarBarraLote();
    sincronizarSelectAll(); 
  }

  function atualizarBarraLote() {
    const barra = document.getElementById('barraAcoesLote');
    const contador = document.getElementById('contadorLote');
    if (itensSelecionadosLote.size > 0) {
      contador.innerText = itensSelecionadosLote.size;
      barra.classList.remove('hidden');
      document.body.classList.add('lote-ativo'); 
    } else {
      barra.classList.add('hidden');
      document.body.classList.remove('lote-ativo'); 
    }
  }

  function sincronizarSelectAll() {
    const chkAll = document.getElementById('chkSelectAll');
    if (chkAll) {
      const chkPrincipal = document.querySelectorAll('#tbodyLancamentos .chk-lote, #divCardsLancamentos .chk-lote');
      if (chkPrincipal.length === 0) chkAll.checked = false;
      else chkAll.checked = Array.from(chkPrincipal).every(chk => chk.checked);
    }

    const chkAllFuturos = document.getElementById('chkSelectAllFuturos');
    if (chkAllFuturos) {
      const chkFuturos = document.querySelectorAll('#tbodyFuturos .chk-lote, #divCardsFuturos .chk-lote');
      if (chkFuturos.length === 0) chkAllFuturos.checked = false;
      else chkAllFuturos.checked = Array.from(chkFuturos).every(chk => chk.checked);
    }
  }

  function cancelarLote() {
    itensSelecionadosLote.clear();
    atualizarBarraLote();
    
    // Limpa Checkboxes
    document.querySelectorAll('.chk-lote').forEach(chk => chk.checked = false);
    
    // Limpa Linhas da Tabela
    document.querySelectorAll('.linha-selecionada').forEach(row => row.classList.remove('linha-selecionada'));
    
    // Limpa Cards Mobile (Corrigido para a classe atual)
    document.querySelectorAll('.card-lancamento').forEach(card => card.classList.remove('card-selecionado'));
    
    if (document.getElementById('chkSelectAll')) document.getElementById('chkSelectAll').checked = false;
    if (document.getElementById('chkSelectAllFuturos')) document.getElementById('chkSelectAllFuturos').checked = false;
  }

  function alternarSelecaoTodos(isChecked, escopo = 'global') {
    let seletores = '';
    if (escopo === 'principal') {
      seletores = '#tbodyLancamentos .chk-lote, #divCardsLancamentos .chk-lote';
    } else if (escopo === 'futuros') {
      seletores = '#tbodyFuturos .chk-lote, #divCardsFuturos .chk-lote';
    } else {
      seletores = '.chk-lote'; 
    }

    const checkboxes = document.querySelectorAll(seletores);
    checkboxes.forEach(chk => {
      chk.checked = isChecked;
      const id = chk.getAttribute('data-id');
      
      if (isChecked) itensSelecionadosLote.add(id); 
      else itensSelecionadosLote.delete(id);
      
      const card = document.getElementById(`card-${id}`);
      if (card) { if(isChecked) card.classList.add('card-selecionado'); else card.classList.remove('card-selecionado'); }
      
      const row = document.getElementById(`row-${id}`);
      if (row) { if(isChecked) row.classList.add('linha-selecionada'); else row.classList.remove('linha-selecionada'); }
    });
    
    atualizarBarraLote();
    sincronizarSelectAll(); 
  }

  function alternarSelecaoTodosMobile() {
    const checkboxes = document.querySelectorAll('.chk-lote');
    if(checkboxes.length === 0) return;
    const todosSelecionados = Array.from(checkboxes).every(chk => chk.checked);
    alternarSelecaoTodos(!todosSelecionados, 'global');
  }

  function abrirModalEdicaoLote() {
    abrirJanela('loteModal');
    
    const sCat = document.getElementById('selLoteCategoria');
    const sCon = document.getElementById('selLoteConta');
    document.getElementById('selLotePago').value = ""; 

    sCat.innerHTML = '<option value="">-- Manter Original --</option>';
    sCon.innerHTML = '<option value="">-- Manter Original --</option>';
    
    const contasOrdenadas = [...configContas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    contasOrdenadas.forEach(c => sCon.innerHTML += `<option value="${c.nome}">${c.nome} (${c.tipo})</option>`);
    
    const gruposCat = {};
    configCategorias.forEach(cat => { if (!gruposCat[cat.tipo]) gruposCat[cat.tipo] = []; gruposCat[cat.tipo].push(cat); });
    
    Object.keys(gruposCat).sort().forEach(tipo => {
      const optGroup = document.createElement('optgroup');
      optGroup.label = tipo;
      gruposCat[tipo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).forEach(cat => {
        const sufixoTexto = cat.sufixo ? ` (${cat.sufixo})` : '';
        optGroup.innerHTML += `<option value="${cat.nome}">${cat.nome}${sufixoTexto}</option>`;
      });
      sCat.appendChild(optGroup);
    });
  }
  function fecharModalLote() {
    fecharJanela('loteModal');
    document.getElementById('formLote').reset();
  }

  function processarEdicaoLote(e) {
    e.preventDefault();
    const desc = document.getElementById('inpLoteDescricao').value.trim();
    const cat = document.getElementById('selLoteCategoria').value;
    const con = document.getElementById('selLoteConta').value;
    const cred = document.getElementById('selLoteCredito').value; 
    const pagoStr = document.getElementById('selLotePago').value; 
    const dComp = document.getElementById('inpLoteDataCompra').value;
    const dPag = document.getElementById('inpLoteDataPag').value;
    let obs = document.getElementById('txtLoteObservacoes').value.trim();
    
    if (obs === '-') obs = '—';
    if(!desc && !cat && !con && !cred && !pagoStr && !dComp && !dPag && !obs) { mostrarNotificacao("Selecione pelo menos um campo para alterar.", "aviso"); return; }
    
    let valCredito = null;
    if (cred === 'SIM') valCredito = true; else if (cred === 'NAO') valCredito = false;

    let valPago = null;
    if (pagoStr === 'SIM') valPago = true; else if (pagoStr === 'NAO') valPago = false;

    const ids = Array.from(itensSelecionadosLote);
    const alteracoes = { descricao: desc || null, categoria: cat || null, conta: con || null, no_credito: valCredito, pago: valPago, data_compra: dComp || null, data_pag: dPag || null, observacoes: obs || null };
    
    const btn = document.getElementById('btnSalvarLote');
    btn.disabled = true; btn.innerHTML = "Aplicando...";
    mostrarNotificacao("Atualizando lote, aguarde...", "aviso");
    
    chamarBackend('atualizarLoteServidor', { ids: ids, alteracoes: alteracoes })
      .then(res => {
        btn.disabled = false; btn.innerHTML = "Aplicar Alterações";
        if(res.error) { mostrarNotificacao(res.error, "erro"); } 
        else { fecharModalLote(); cancelarLote(); mostrarNotificacao(`Sucesso! ${res.contagem} itens atualizados.`); carregarLancamentosDoSheets(); }
      })
      .catch(err => {
        btn.disabled = false; btn.innerHTML = "Aplicar Alterações"; mostrarNotificacao("Falha de comunicação: " + err.message, "erro");
      });
  }

  function confirmarExclusaoLote() {
    const qtd = itensSelecionadosLote.size;
    const b = document.getElementById('confirmModalBody');
    b.innerHTML = `Excluir definitivamente os <strong>${qtd}</strong> lançamentos selecionados?<br><br><span style="color:var(--cor-perigo); font-weight:bold;">⚠️ Essa ação não pode ser desfeita.</span>`;
    
    abrirJanela('confirmModal');
    
    document.getElementById('btnConfirmCancelar').onclick = () => fecharJanela('confirmModal');
    document.getElementById('btnConfirmSim').onclick = () => { 
      fecharJanela('confirmModal');
      mostrarNotificacao(`Excluindo ${qtd} itens...`, "aviso"); 
      const ids = Array.from(itensSelecionadosLote);
      
      chamarBackend('excluirLoteServidor', ids)
        .then(res => { 
          if(res.error) { mostrarNotificacao(res.error, "erro"); } 
          else { mostrarNotificacao(`${res.contagem} itens excluídos!`, "sucesso"); cancelarLote(); carregarLancamentosDoSheets(); } 
        })
        .catch(err => mostrarNotificacao("Erro: " + err.message, "erro")); 
    };
  }

  // ==========================================================================
  // 🚀 15. IMPORTAÇÃO E GESTÃO DE BANCO E AUDITORIA
  // ==========================================================================
  function processarImportacaoTextoLote() {
    const campoTexto = document.getElementById('txtAreaImportacao');
    const conteudo = campoTexto.value.trim();
    if (!conteudo) { mostrarNotificacao("Por favor, cole os dados para processar.", "aviso"); return; }

    const linhas = conteudo.split('\n');
    const loteRegistros = [];

    for (let i = 0; i < linhas.length; i++) {
      const linhaLimpa = linhas[i].trim();
      if (!linhaLimpa) continue; 

      const colunas = linhaLimpa.split(';');
      if (colunas.length < 9) { mostrarNotificacao(`Erro na linha ${i + 1}: Colunas insuficientes.`, "erro"); return; }

      const idUnico = 'L' + Date.now() + '_' + Math.random().toString(36).substr(2, 4).toUpperCase();
      
      const credRaw = colunas[6].trim().toUpperCase();
      const noCreditoBoleano = (credRaw === 'TRUE' || credRaw === 'SIM' || credRaw === '1');

      let valRaw = colunas[7].trim();
      let valLimpo = valRaw.replace(/[^\d,.-]/g, ''); 
      let valNumerico = 0;
      
      if (valLimpo) {
        if (valLimpo.includes(',')) {
          valNumerico = parseFloat(valLimpo.replace(/\./g, '').replace(',', '.'));
        } else {
          valNumerico = parseFloat(valLimpo);
        }
      }
      if (isNaN(valNumerico)) valNumerico = 0;

      const pagoRaw = colunas[8].trim().toUpperCase();
      const pagoBoleano = (pagoRaw === 'TRUE' || pagoRaw === 'SIM' || pagoRaw === '1');

      let obsTratada = colunas[3].trim();
      if (obsTratada === '' || obsTratada === '-') obsTratada = '—';

      loteRegistros.push({
        id: idUnico, 
        data_compra: colunas[0].trim(), 
        data_pag: colunas[1].trim(), 
        descricao: colunas[2].trim(),
        observacoes: obsTratada, 
        categoria: colunas[4].trim(), 
        conta: colunas[5].trim(), 
        no_credito: noCreditoBoleano, 
        valor: valNumerico,
        pago: pagoBoleano
      });
    }

    mostrarNotificacao(`Processando ${loteRegistros.length} linhas...`, "aviso");
    chamarBackend('importarEmLoteServidor', loteRegistros)
      .then(res => {
        if (res.error) { mostrarNotificacao("Erro na gravação: " + res.error, "erro"); } 
        else {
          campoTexto.value = ''; 
          mostrarNotificacao(`Sucesso! ${res.contagem} lançamentos importados.`, "sucesso");
          navigateToSection('lancamentos'); 
          carregarLancamentosDoSheets(); 
          recarregarConfiguracoesGerais();
        }
      })
      .catch(err => mostrarNotificacao("Falha de comunicação: " + err.message, "erro"));
  }

  function confirmarLimpezaTotalBanco() {
    const modalConfirm = document.getElementById('confirmModal');
    const bodyTxt      = document.getElementById('confirmModalBody');
    const btnSim       = document.getElementById('btnConfirmSim');
    const btnCancelar  = document.getElementById('btnConfirmCancelar');

    // Removemos os styles em linha e usamos o dicionário: text-perigo, font-bold, text-lg
    bodyTxt.innerHTML = `<span class="text-perigo font-bold text-lg">⚠️ AÇÃO IRREVERSÍVEL!</span><br><br>Você está prestes a <strong>APAGAR TODOS OS LANÇAMENTOS</strong> salvos nesta planilha.<br><br>Isso limpará os dados de teste e deixará a tabela pronta para receber a importação oficial dos seus dados. Deseja prosseguir?`;
    
    abrirJanela('confirmModal');

    btnCancelar.onclick = () => fecharJanela('confirmModal');
    btnSim.onclick = function() {
      fecharJanela('confirmModal');
      mostrarNotificacao("Limpando banco de dados...", "aviso");
      chamarBackend('limparTodosLancamentosBanco')
        .then(res => {
          if (res.error) { mostrarNotificacao("Erro ao limpar: " + res.error, "erro"); } 
          else { mostrarNotificacao("Planilha limpa com sucesso!"); carregarLancamentosDoSheets(); }
        })
        .catch(err => mostrarNotificacao("Erro: " + err.message, "erro"));
    };
  }

  function renderizarAuditoria() {
    const listaContasInc = document.getElementById('listaContasInconsistentes');
    const listaCatInc = document.getElementById('listaCategoriasInconsistentes');
    const painelVazio = document.getElementById('auditoriaVazia');
    const gridAuditoria = document.getElementById('gridAuditoria');
    
    listaContasInc.innerHTML = ''; listaCatInc.innerHTML = '';

    const contasRegistradas = new Set(configContas.map(c => c.nome));
    const catsRegistradas = new Set(configCategorias.map(c => c.nome));
    const contasNoLancamento = new Set(allLancamentos.map(l => l.conta));
    const catsNoLancamento = new Set(allLancamentos.map(l => l.categoria));

    let inconsistenciasEncontradas = 0; 

    contasNoLancamento.forEach(c => {
      if (c && !contasRegistradas.has(c)) {
        inconsistenciasEncontradas++;
        listaContasInc.innerHTML += `
          <div class="list-item border-l-4 border-aviso">
            <div class="list-item-header"><strong class="text-principal">${c}</strong><div class="flex gap-2"><button class="btn btn-sm btn-secundario" onclick="filtrarInconsistencia('conta', '${c}')">Filtrar</button><button class="btn btn-sm btn-primario" onclick="cadastrarInconsistencia('conta', '${c}')">Cadastrar</button></div></div>
          </div>`;
      }
    });

    catsNoLancamento.forEach(c => {
      if (c && !catsRegistradas.has(c)) {
        inconsistenciasEncontradas++;
        listaCatInc.innerHTML += `
          <div class="list-item border-l-4 border-aviso">
            <div class="list-item-header"><strong class="text-principal">${c}</strong><div class="flex gap-2"><button class="btn btn-sm btn-secundario" onclick="filtrarInconsistencia('categoria', '${c}')">Filtrar</button><button class="btn btn-sm btn-primario" onclick="cadastrarInconsistencia('categoria', '${c}')">Cadastrar</button></div></div>
          </div>`;
      }
    });

    if (inconsistenciasEncontradas > 0) {
      if (listaContasInc.innerHTML === '') {
        listaContasInc.innerHTML = `<div class="text-center p-5 bg-principal rounded border border-dashed"><span class="material-icons text-sucesso text-3xl">check_circle</span><p class="m-0 mt-1 font-medium text-sm text-suave">Contas alinhadas!</p></div>`;
      }
      if (listaCatInc.innerHTML === '') {
        listaCatInc.innerHTML = `<div class="text-center p-5 bg-principal rounded border border-dashed"><span class="material-icons text-sucesso text-3xl">check_circle</span><p class="m-0 mt-1 font-medium text-sm text-suave">Categorias alinhadas!</p></div>`;
      }
    }

    if (inconsistenciasEncontradas === 0) {
      painelVazio.classList.remove('hidden'); gridAuditoria.classList.add('hidden');
    } else {
      painelVazio.classList.add('hidden'); gridAuditoria.classList.remove('hidden');
    }
  }

  function filtrarInconsistencia(tipo, valor) {
    navigateToSection('lancamentos');

    document.getElementById('fDataInicio').value = '';
    document.getElementById('fDataFim').value = '';
    document.getElementById('fCredito').value = '';
    if(document.getElementById('fTipoFluxo')) document.getElementById('fTipoFluxo').value = '';
    if(document.getElementById('fBuscaOmni')) document.getElementById('fBuscaOmni').value = '';
    document.getElementById('fDescricao').value = '';
    document.getElementById('fObservacoes').value = '';

    estadoMultiSelect['fMes'] = [];
    estadoMultiSelect['fCategoria'] = [];
    estadoMultiSelect['fConta'] = [];

    if (tipo === 'categoria') { 
        estadoMultiSelect['fCategoria'].push(valor); 
    } else if (tipo === 'conta') { 
        estadoMultiSelect['fConta'].push(valor); 
    }

    atualizarBadgesTag('fMes');
    atualizarBadgesTag('fCategoria');
    atualizarBadgesTag('fConta');
    
    aplicarFiltros();

    const btn = document.getElementById('btnToggleFiltros');
    if(btn) btn.classList.add('ativo');
    
    mostrarNotificacao(`Filtrando por ${valor}...`, "aviso");
  }

  function cadastrarInconsistencia(tipo, valor) {
    alternarSubAba('sistema'); 
    if (tipo === 'categoria') { abrirModalCategoria(); setTimeout(() => { document.getElementById('inpNomeCategoria').value = valor; }, 300); } 
    else { abrirModalConta(); setTimeout(() => { document.getElementById('inpNomeConta').value = valor; }, 300); }
  }

  // ==========================================================================
  // 📈 16. DASHBOARD: MOTOR CONTÁBIL E LÓGICA PRINCIPAL
  // ==========================================================================
  function preencherSeletorDashboard() {
    const seletor = document.getElementById('selPeriodoDashboard');
    if (!seletor) return;
    let valorSalvo = seletor.value; seletor.innerHTML = '';
    
    const setPeriodos = new Set();
    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    const anoAtual = `${hoje.getFullYear()}`;
    
    setPeriodos.add(visaoDashboard === 'mensal' ? mesAtual : anoAtual);
    
    allLancamentos.forEach(l => {
      const dtBase = l.data_pag || l.data_compra; 
      if(dtBase) { 
        const d = new Date(dtBase);
        if (!isNaN(d.getTime())) { 
          if (visaoDashboard === 'mensal') setPeriodos.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
          else setPeriodos.add(`${d.getFullYear()}`);
        }
      }
    });
    
    const arrPeriodos = Array.from(setPeriodos).sort().reverse();
    arrPeriodos.forEach(p => {
      if (visaoDashboard === 'mensal') {
        const pts = p.split('-');
        seletor.innerHTML += `<option value="${p}">${pts[1]}/${pts[0]}</option>`;
      } else { seletor.innerHTML += `<option value="${p}">${p}</option>`; }
    });
    
    if (!valorSalvo || !Array.from(seletor.options).some(o => o.value === valorSalvo)) {
      valorSalvo = visaoDashboard === 'mensal' ? mesAtual : anoAtual;
    }
    seletor.value = valorSalvo;
    atualizarDadosDashboard();
  }

  function atualizarDadosDashboard() {
    try {
      const periodo = document.getElementById('selPeriodoDashboard').value;
      if (!periodo) return;

      let recPeriodo = 0, desPeriodo = 0, saldoTotal = 0;
      const saldosPorConta = {}; 
      const despesasParaRanking = []; const gruposGrafico = {}; let totalDespesasGrafico = 0;
      const balancoMesesAno = {}; 
      const fluxoTemporal = {};
      
      let ultimoDiaMes = 31;
      
      // 🌟 Usando as Constantes Globais agora!
      ORDEM_MESES.forEach(m => { balancoMesesAno[m] = { total: 0, contas: {} }; });

      const [anoFiltro, mesFiltro] = periodo.split('-');
      let dataLimitePeriodo = new Date();
      let limiteInicioStr, limiteFimStr;
      
      if (visaoDashboard === 'mensal') {
        dataLimitePeriodo = new Date(anoFiltro, parseInt(mesFiltro), 0, 23, 59, 59);
        ultimoDiaMes = dataLimitePeriodo.getDate();
        limiteInicioStr = `${anoFiltro}-${mesFiltro}-01`;
        limiteFimStr = `${anoFiltro}-${mesFiltro}-${String(ultimoDiaMes).padStart(2,'0')}`;
        for(let i=1; i<=ultimoDiaMes; i++) fluxoTemporal[String(i).padStart(2, '0')] = { rec: 0, desp: 0 };
      } else {
        dataLimitePeriodo = new Date(anoFiltro, 11, 31, 23, 59, 59);
        limiteInicioStr = `${anoFiltro}-01-01`;
        limiteFimStr = `${anoFiltro}-12-31`;
        for(let i=1; i<=12; i++) fluxoTemporal[String(i).padStart(2, '0')] = { rec: 0, desp: 0 };
      }

      configContas.forEach(c => { 
        // .split(';')[0] garante que apenas a 1ª Tag dite as regras de Saldo Patrimonial
        saldosPorConta[c.nome] = { saldoProj: 0, saldoEfetivo: 0, cor: c.cor || '#ccc', tipo: (c.tipo || 'Outros').split(';')[0] }; 
      });
      
      ORDEM_MESES.forEach(m => { 
        balancoMesesAno[m] = { totalProj: 0, totalEfetivo: 0, contas: {} }; 
      });

      // =====================================================================
      // 1. MOTOR GERAL: SALDOS, CAIXA E RANKING
      // =====================================================================
      let recPeriodoEfetivo = 0, recPeriodoProj = 0;
      let desPeriodoEfetivo = 0, desPeriodoProj = 0;
      let saldoCorrenteEfetivo = 0, saldoCorrenteProj = 0;
      let saldoInvestEfetivo = 0, saldoInvestProj = 0;
      let saldoTotalEfetivo = 0, saldoTotalProj = 0; 

      allLancamentos.forEach(l => {
        const valor = parseFloat(l.valor) || 0;
        const dtBase = l.data_pag || l.data_compra || '';
        if (!dtBase) return;
        const d = new Date(dtBase);
        if (isNaN(d.getTime())) return;

        const ehMovimentacao = (l.categoria === 'Movimentações');
        const ehFatura = (l.categoria === 'Faturas');
        const ehCredito = (l.no_credito === true || l.no_credito === 'SIM' || String(l.no_credito).toUpperCase() === 'TRUE');
        const ehPago = !!l.pago; 
        
        if (d <= dataLimitePeriodo) {
          if (!ehCredito) { 
            saldoTotalProj += valor;
            if (ehPago) saldoTotalEfetivo += valor;

            if (l.conta && saldosPorConta[l.conta]) {
              const tipo = saldosPorConta[l.conta].tipo.toUpperCase();
              
              saldosPorConta[l.conta].saldoProj += valor; 
              if (ehPago) saldosPorConta[l.conta].saldoEfetivo += valor;
              
              if (tipo.includes('INVESTIMENTO')) {
                saldoInvestProj += valor;
                if (ehPago) saldoInvestEfetivo += valor;
              } else {
                saldoCorrenteProj += valor;
                if (ehPago) saldoCorrenteEfetivo += valor;
              }
            }
          }
        }

        const diaStr = String(d.getDate()).padStart(2,'0'); 
        const dtPagStr = l.data_pag || l.data_compra || '';
        const mesLanc = dtPagStr.substring(0, 7); 
        const anoLanc = dtPagStr.substring(0, 4); 
        let pertenceAoPeriodo = (visaoDashboard === 'mensal' && mesLanc === periodo) || (visaoDashboard === 'anual' && anoLanc === periodo);

        if (pertenceAoPeriodo) {
          if (!ehMovimentacao && !ehCredito) { 
            if (valor > 0) {
              recPeriodoProj += valor;
              if (ehPago) recPeriodoEfetivo += valor;
            } else { 
              desPeriodoProj += valor;
              if (ehPago) desPeriodoEfetivo += valor;
            } 
          }
          
          if (!ehMovimentacao && !ehFatura) {
              const ehDoFluxoGrafico = (fluxoGrafico === 'DESPESA' && valor < 0) || (fluxoGrafico === 'RECEITA' && valor > 0);
              if (ehDoFluxoGrafico) {
                let chaveAgrupamento = agrupamentoDashboard === 'categoria' ? (l.categoria || 'Sem Categoria') : (configCategorias.find(c => c.nome === l.categoria)?.tipo || 'Outros');
                if (!gruposGrafico[chaveAgrupamento]) gruposGrafico[chaveAgrupamento] = 0;
                gruposGrafico[chaveAgrupamento] += Math.abs(valor); totalDespesasGrafico += Math.abs(valor);
              }
              if ((fluxoRanking === 'DESPESA' && valor < 0) || (fluxoRanking === 'RECEITA' && valor > 0)) despesasParaRanking.push(l);
              
              const chaveFluxo = visaoDashboard === 'mensal' ? diaStr : dtPagStr.substring(5,7);
              if (fluxoTemporal[chaveFluxo]) { if (valor > 0) fluxoTemporal[chaveFluxo].rec += valor; else fluxoTemporal[chaveFluxo].desp += Math.abs(valor); }
          }

          if (visaoDashboard === 'anual') {
              if (!ehMovimentacao && !ehCredito) {
                balancoMesesAno[dtPagStr.substring(5,7)].totalProj += valor;
                if(ehPago) balancoMesesAno[dtPagStr.substring(5,7)].totalEfetivo += valor;
              }
              if (!ehCredito && l.conta) {
                const corItem = saldosPorConta[l.conta] ? saldosPorConta[l.conta].cor : '#ccc';
                if (!balancoMesesAno[dtPagStr.substring(5,7)].contas[l.conta]) {
                  balancoMesesAno[dtPagStr.substring(5,7)].contas[l.conta] = { valorProj: 0, valorEfetivo: 0, cor: corItem };
                }
                balancoMesesAno[dtPagStr.substring(5,7)].contas[l.conta].valorProj += valor;
                if(ehPago) balancoMesesAno[dtPagStr.substring(5,7)].contas[l.conta].valorEfetivo += valor;
              }
          }
        }
      });

      if(document.getElementById('dashTituloFluxo')) document.getElementById('dashTituloFluxo').innerHTML = visaoDashboard === 'mensal' ? `<span class="material-icons text-destaque">bar_chart</span> Fluxo de Caixa Diário (${mesFiltro}/${anoFiltro})` : `<span class="material-icons text-destaque">bar_chart</span> Fluxo de Caixa Mensal (${periodo})`;
      
      if (document.getElementById('dashTituloCredito')) {
        let textoCredito = visaoDashboard === 'mensal' ? `Uso de Crédito (${mesFiltro}/${anoFiltro})` : `Crédito Mensal (${periodo})`;
        if (visaoDashboard === 'mensal' && modoVisaoCredito === 'aberta') textoCredito = `Faturas Ativas`;
        document.getElementById('dashTituloCredito').innerHTML = `<span class="material-icons text-perigo">credit_card</span> ${textoCredito}`;
      }

      const balPeriodoEfetivo = recPeriodoEfetivo + desPeriodoEfetivo;
      const balPeriodoProj = recPeriodoProj + desPeriodoProj;

      // =====================================================================
      // 🧩 MÓDULOS DE RENDERIZAÇÃO (OFFLOADING DE DOM)
      // =====================================================================
      renderizarResumoDashboard(recPeriodoEfetivo, recPeriodoProj, desPeriodoEfetivo, desPeriodoProj, balPeriodoEfetivo, balPeriodoProj, saldoCorrenteEfetivo, saldoCorrenteProj, saldoInvestEfetivo, saldoInvestProj);
      renderizarFluxoCaixa(fluxoTemporal, ultimoDiaMes, mesFiltro, anoFiltro);
      renderizarNotificacoesDashboard();
      renderizarPosicaoPatrimonial(saldosPorConta, balancoMesesAno, balPeriodoEfetivo, balPeriodoProj, periodo, mesFiltro, anoFiltro);
      renderizarPainelCredito(anoFiltro, mesFiltro, periodo);
      renderizarGraficoDespesas(totalDespesasGrafico, gruposGrafico);
      renderizarRankingTop5(despesasParaRanking);
      renderizarPivotAnual(anoFiltro);

    } catch (erro) { console.error("Erro no Dashboard:", erro); }
  }

  // ==========================================================================
  // 🧩 17. MÓDULOS DE RENDERIZAÇÃO (FUNÇÕES ISOLADAS)
  // ==========================================================================
  function renderizarResumoDashboard(recEf, recPr, desEf, desPr, balEf, balPr, corrEf, corrPr, invEf, invPr) {
    const elRec = document.getElementById('dashValorReceita');
    if (elRec) elRec.innerText = recEf.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    const elProjRec = document.getElementById('dashProjReceita');
    if (elProjRec) elProjRec.innerText = recPr.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

    const elDesp = document.getElementById('dashValorDespesa');
    if (elDesp) elDesp.innerText = Math.abs(desEf).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    const elProjDesp = document.getElementById('dashProjDespesa');
    if (elProjDesp) elProjDesp.innerText = Math.abs(desPr).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

    const elBal = document.getElementById('dashValorBalanço');
    if (elBal) {
      elBal.innerText = balEf.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
      elBal.className = balEf >= 0 ? 'text-sucesso' : 'text-perigo';
    }
    const elProjBal = document.getElementById('dashProjBalanco');
    if (elProjBal) elProjBal.innerText = balPr.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

    const elCorr = document.getElementById('dashTotalCorrente');
    if (elCorr) {
      elCorr.innerText = corrEf.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
      elCorr.className = corrEf >= 0 ? 'text-principal' : 'text-perigo';
    }
    const elProjCorr = document.getElementById('dashProjCorrente');
    if (elProjCorr) elProjCorr.innerText = corrPr.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

    const elInv = document.getElementById('dashTotalInvest');
    if (elInv) {
      elInv.innerText = invEf.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
      elInv.className = invEf >= 0 ? 'text-sucesso' : 'text-perigo';
    }
    const elProjInv = document.getElementById('dashProjInvest');
    if (elProjInv) elProjInv.innerText = invPr.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  }

  function renderizarFluxoCaixa(fluxoTemporal, ultimoDiaMes, mesFiltro, anoFiltro) {
    const boxFluxo = document.getElementById('boxGraficoFluxo');
    if (!boxFluxo) return;

    let maxValor = 0; 
    Object.values(fluxoTemporal).forEach(v => { 
      if (v.rec > maxValor) maxValor = v.rec; 
      if (v.desp > maxValor) maxValor = v.desp; 
    });

    if (maxValor === 0) {
      boxFluxo.innerHTML = '<p class="text-suave text-sm text-center w-full p-5">Sem movimentações neste período.</p>';
      return;
    } 

    const maxValorEixo = maxValor * 1.1; 
    let htmlFluxo = ''; 
    
    const chaves = visaoDashboard === 'mensal' ? Array.from({length: ultimoDiaMes}, (_, i) => String(i + 1).padStart(2, '0')) : ORDEM_MESES;
    
    chaves.forEach(chave => {
      const dados = fluxoTemporal[chave]; 
      const hRec = (dados.rec / maxValorEixo) * 100; 
      const hDesp = (dados.desp / maxValorEixo) * 100;
      const rotuloX = visaoDashboard === 'mensal' ? chave : NOME_MESES[chave].substring(0,3); 
      const labelHover = visaoDashboard === 'mensal' ? `${chave}/${mesFiltro}/${anoFiltro}` : `${NOME_MESES[chave]} de ${anoFiltro}`;
      
      htmlFluxo += `
        <div class="fluxo-coluna">
          <div class="fluxo-tooltip">
            <div class="font-bold text-sm text-center pb-1 mb-1">${labelHover}</div>
            <div class="flex justify-between items-center gap-3">
              <span class="text-sucesso font-bold flex items-center text-xs"><span class="material-icons" style="font-size: 0.9rem;">arrow_upward</span> Rec:</span>
              <span class="text-principal font-bold text-xs">${dados.rec.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
            </div>
            <div class="flex justify-between items-center gap-3">
              <span class="text-perigo font-bold flex items-center text-xs"><span class="material-icons" style="font-size: 0.9rem;">arrow_downward</span> Desp:</span>
              <span class="text-principal font-bold text-xs">${dados.desp.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
            </div>
          </div>
          <div class="fluxo-barras-wrapper">
            <div class="fluxo-barra rec" style="height: ${hRec}%;"></div>
            <div class="fluxo-barra desp" style="height: ${hDesp}%;"></div>
          </div>
          <span class="fluxo-label">${rotuloX}</span>
        </div>`;
    });
    
    const formatY = (val) => val >= 1000 ? 'R$ ' + (val/1000).toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 1}) + 'k' : 'R$ ' + val.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0});
    
    const v4 = maxValorEixo; const v3 = maxValorEixo * 0.75; const v2 = maxValorEixo * 0.5; const v1 = maxValorEixo * 0.25;
    const classeContainer = visaoDashboard === 'mensal' ? 'scroll-diario' : 'fit-anual';

    boxFluxo.innerHTML = `
      <div class="fluxo-wrapper">
        <div class="fluxo-eixo-y">
          <span>${formatY(v4)}</span>
          <span>${formatY(v3)}</span>
          <span>${formatY(v2)}</span>
          <span>${formatY(v1)}</span>
          <span>R$ 0</span>
        </div>
        <div class="fluxo-scroll">
          <div class="fluxo-container ${classeContainer}">
            ${htmlFluxo}
          </div>
        </div>
      </div>`;
  }

  function renderizarNotificacoesDashboard() {
    const lista = document.getElementById('dashListaNotificacoes');
    if (!lista) return;

    let htmlFinal = '';

    const contasRegistradas = new Set(configContas.map(c => c.nome));
    const catsRegistradas = new Set(configCategorias.map(c => c.nome));
    const contasInc = new Set();
    const catsInc = new Set();

    allLancamentos.forEach(l => {
      if (l.conta && !contasRegistradas.has(l.conta)) contasInc.add(l.conta);
      if (l.categoria && !catsRegistradas.has(l.categoria)) catsInc.add(l.categoria);
    });

    if (contasInc.size > 0 || catsInc.size > 0) {
      const totalErros = contasInc.size + catsInc.size;
      htmlFinal += `
        <div class="notificacao-item noti-bg-urgente cursor-pointer border-l-6" onclick="navigateToSection('config'); alternarSubAba('auditoria');">
          <div class="flex flex-col gap-1 overflow-hidden flex-1">
            <strong class="text-principal text-base flex items-center gap-1">
              <span class="material-icons text-lg text-perigo">security</span> Falha de Auditoria
            </strong>
            <div class="text-xs text-suave flex items-center gap-1">
              <span class="text-perigo font-bold">Ação Necessária</span> <span>• ${totalErros} item(ns) desconhecido(s)</span>
            </div>
          </div>
          <div class="text-suave pl-3 flex items-center justify-end">
            <span class="text-xs mr-1">Resolver</span>
            <span class="material-icons text-lg">chevron_right</span>
          </div>
        </div>`;
    }

    const hojeData = new Date();
    const hojeStr = `${hojeData.getFullYear()}-${String(hojeData.getMonth()+1).padStart(2,'0')}-${String(hojeData.getDate()).padStart(2,'0')}`;
    
    let pendentes = allLancamentos.filter(l => {
      const isCred = (l.no_credito === true || l.no_credito === 'SIM' || String(l.no_credito).toUpperCase() === 'TRUE');
      return !l.pago && l.valor < 0 && l.categoria !== 'Movimentações' && !isCred;
    });

    const hojeTime = new Date(hojeStr + 'T00:00:00').getTime();
    const limiteFuturo = new Date(hojeTime + 30 * 24 * 60 * 60 * 1000);
    const limiteFuturoStr = `${limiteFuturo.getFullYear()}-${String(limiteFuturo.getMonth()+1).padStart(2,'0')}-${String(limiteFuturo.getDate()).padStart(2,'0')}`;

    pendentes = pendentes.filter(l => {
      const dp = l.data_pag ? l.data_pag.split('T')[0] : '';
      return dp && dp <= limiteFuturoStr; 
    });

    pendentes.sort((a, b) => a.data_pag.localeCompare(b.data_pag));

    if (pendentes.length === 0 && htmlFinal === '') {
      lista.innerHTML = `
        <div class="flex flex-col items-center justify-center p-5 text-center">
          <span class="material-icons text-sucesso mb-2" style="font-size: 2.5rem;">task_alt</span>
          <h4 class="m-0 text-principal text-lg">Tudo em dia!</h4>
          <p class="m-0 mt-1 text-suave text-sm">Nenhuma pendência para os próximos 30 dias.</p>
        </div>`;
      return;
    }

    pendentes.forEach(l => {
      const dp = l.data_pag.split('T')[0];
      let corClasse = 'noti-bg-futura'; let statusTxt = 'No radar'; let corIcone = 'var(--cor-destaque)';

      if (dp < hojeStr) { corClasse = 'noti-bg-urgente'; statusTxt = 'Atrasada'; corIcone = 'var(--cor-perigo)'; } 
      else if (dp === hojeStr) { corClasse = 'noti-bg-urgente'; statusTxt = 'Vence Hoje'; corIcone = 'var(--cor-perigo)'; } 
      else if (dp <= new Date(hojeTime + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) { corClasse = 'noti-bg-atencao'; statusTxt = 'Próxima'; corIcone = 'var(--cor-aviso)'; }

      const pts = dp.split('-'); const dataFormatada = `${pts[2]}/${pts[1]}`;
      
      let nomeExibicao = l.descricao;
      if (l.categoria === 'Faturas') nomeExibicao = `Fatura do cartão ${l.conta || ''}`;

      htmlFinal += `
        <div class="notificacao-item ${corClasse} cursor-pointer" onclick="prepararEdicao('${l.id}')" title="Clique para editar ou marcar como pago">
          <div class="flex flex-col gap-1 overflow-hidden flex-1">
            <strong class="text-principal text-base truncate">${nomeExibicao}</strong>
            <div class="text-xs text-suave flex items-center gap-1">
              <span style="color:${corIcone};" class="font-bold">${statusTxt}</span>
              <span>• Venc: ${dataFormatada}</span>
            </div>
          </div>
          <div class="font-bold text-principal text-base pl-3 flex items-center justify-end gap-2">
            ${Math.abs(l.valor).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}
            <span class="material-icons text-base text-suave opacity-80">edit</span>
          </div>
        </div>`;
    });
    
    lista.innerHTML = htmlFinal;
  }

  function renderizarPosicaoPatrimonial(saldosPorConta, balancoMesesAno, balPeriodoEfetivo, balPeriodoProj, periodo, mesFiltro, anoFiltro) {
    const listaSaldos = document.getElementById('dashListaSaldos');
    if (!listaSaldos) return;

    const titulo = document.getElementById('dashTituloSaldos');
    if (titulo) {
      titulo.innerHTML = visaoDashboard === 'mensal' 
        ? `<span class="material-icons text-sucesso">account_balance</span> Posição Patrimonial (${mesFiltro}/${anoFiltro})` 
        : `<span class="material-icons text-sucesso">account_balance</span> Balanço Mensal (${periodo})`;
    }

    let htmlSaldos = '';

    if (visaoDashboard === 'mensal') {
      const gruposSaldos = {};
      Object.keys(saldosPorConta).forEach(nome => {
        const dados = saldosPorConta[nome]; 
        const tipo = dados.tipo;
        if (!tipo.toUpperCase().includes('CRÉDITO') || tipo.toUpperCase().includes('C.C.')) {
          if (!gruposSaldos[tipo]) gruposSaldos[tipo] = { itens: [], totalProj: 0, totalEfetivo: 0 };
          gruposSaldos[tipo].itens.push({ nome: nome, saldoProj: dados.saldoProj, saldoEfetivo: dados.saldoEfetivo, cor: dados.cor }); 
          gruposSaldos[tipo].totalProj += dados.saldoProj;
          gruposSaldos[tipo].totalEfetivo += dados.saldoEfetivo;
        }
      });
      
      if (Object.keys(gruposSaldos).length === 0) {
        htmlSaldos += '<p class="text-center text-suave w-full p-5">Nenhuma conta.</p>';
      } else {
        Object.keys(gruposSaldos).sort().forEach(tipo => {
          const grupo = gruposSaldos[tipo];
          const totalParaProporcao = Math.abs(grupo.totalEfetivo) || 1; 
          const iconeWatermark = tipo.toUpperCase().includes('INVESTIMENTO') ? 'trending_up' : 'account_balance';

          htmlSaldos += `
            <div class="carousel-card">
              <div class="p-4 bg-principal border-b flex flex-col items-center justify-center text-center relative overflow-hidden shrink-0" style="border-color: var(--borda);">
                <span class="material-icons absolute opacity-5 pointer-events-none" style="font-size: 90px; right: -15px; top: -15px; color: var(--texto-principal);">${iconeWatermark}</span>
                <span class="text-xs font-bold text-suave uppercase tracking-wider z-10">${tipo}</span>
                <span class="text-2xl font-bold ${grupo.totalEfetivo >= 0 ? 'text-sucesso' : 'text-perigo'} mt-1 z-10" title="Saldo Efetivo">${grupo.totalEfetivo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                <span class="text-xs text-suave mt-1 z-10">Projetado: <strong class="text-principal">${grupo.totalProj.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></span>
              </div>
              <div class="flex flex-col p-2 gap-1 scroll-y-elegante" style="flex: 1;">`;
          
          grupo.itens.sort((a,b) => b.saldoEfetivo - a.saldoEfetivo).forEach(item => {
            const perc = Math.min(100, Math.max(0, (Math.abs(item.saldoEfetivo) / totalParaProporcao) * 100));
            htmlSaldos += `
                <div class="flex flex-col p-2 rounded hover:bg-principal transition-all shrink-0">
                  <div class="flex justify-between items-center mb-1">
                    <div class="flex items-center gap-2 overflow-hidden mr-2">
                      <span class="bolinha-cor shrink-0" style="background:${item.cor};"></span>
                      <strong class="text-principal text-sm truncate">${item.nome}</strong>
                    </div>
                    <div class="flex flex-col items-end shrink-0">
                      <span class="text-sm font-bold ${item.saldoEfetivo >= 0 ? 'text-principal' : 'text-perigo'}">${item.saldoEfetivo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                      <span class="text-xs text-suave" style="font-size: 0.65rem;">Proj: ${item.saldoProj.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                    </div>
                  </div>
                  <div class="w-full bg-principal rounded-full h-1 mt-1 overflow-hidden" style="background: var(--borda);">
                    <div class="h-full rounded-full opacity-80" style="width: ${perc}%; background: ${item.cor};"></div>
                  </div>
                </div>`;
          });
          htmlSaldos += `</div></div>`;
        });
      }
    } else {
      const mediaMensal = balPeriodoEfetivo / 12;
      
      htmlSaldos += `
        <div class="carousel-card justify-center items-center p-5 bg-principal gap-6">
          <span class="material-icons absolute opacity-5 pointer-events-none" style="font-size: 140px; left: -20px; bottom: -20px; color: var(--texto-principal);">query_stats</span>
          
          <div class="flex flex-col items-center z-10 w-full">
            <span class="material-icons text-suave mb-1" style="font-size: 1.8rem;">account_balance_wallet</span>
            <div class="text-suave text-xs font-bold uppercase tracking-wider text-center">Saldo Anual Efetivo</div>
            <div class="${balPeriodoEfetivo >= 0 ? 'text-sucesso' : 'text-perigo'} text-xl font-bold mt-1 text-center">${balPeriodoEfetivo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</div>
            <div class="text-xs text-suave mt-1">Proj: <strong class="text-principal">${balPeriodoProj.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></div>
          </div>
          
          <div class="flex flex-col items-center z-10 w-full">
            <span class="material-icons text-suave mb-1" style="font-size: 1.8rem;">insights</span>
            <div class="text-suave text-xs font-bold uppercase tracking-wider text-center">Média Efetiva</div>
            <div class="${mediaMensal >= 0 ? 'text-sucesso' : 'text-perigo'} text-xl font-bold mt-1 text-center">${mediaMensal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</div>
            <div class="text-xs text-suave mt-1">por mês</div>
          </div>
        </div>`;
        
      ORDEM_MESES.forEach(mes => {
        const dadosMes = balancoMesesAno[mes];
        if (dadosMes.totalProj !== 0 || Object.keys(dadosMes.contas).length > 0) {
          const totalParaProporcao = Math.abs(dadosMes.totalEfetivo) || 1;
          htmlSaldos += `
            <div class="carousel-card">
              <div class="p-4 bg-principal border-b flex flex-col items-center justify-center text-center relative overflow-hidden shrink-0" style="border-color: var(--borda);">
                <span class="material-icons absolute opacity-5 pointer-events-none" style="font-size: 90px; right: -15px; top: -15px; color: var(--texto-principal);">event</span>
                <span class="text-xs font-bold text-suave uppercase tracking-wider z-10">${NOME_MESES[mes]}</span>
                <span class="text-2xl font-bold ${dadosMes.totalEfetivo >= 0 ? 'text-sucesso' : 'text-perigo'} mt-1 z-10">${dadosMes.totalEfetivo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                <span class="text-xs text-suave mt-1 z-10">Proj: <strong class="text-principal">${dadosMes.totalProj.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></span>
              </div>
              <div class="flex flex-col p-2 gap-1 scroll-y-elegante" style="flex: 1;">`;
              
          Object.keys(dadosMes.contas).map(k => ({nome: k, ...dadosMes.contas[k]})).sort((a,b) => b.valorEfetivo - a.valorEfetivo).forEach(c => {
            const perc = Math.min(100, Math.max(0, (Math.abs(c.valorEfetivo) / totalParaProporcao) * 100));
            htmlSaldos += `
                <div class="flex flex-col p-2 rounded hover:bg-principal transition-all shrink-0">
                  <div class="flex justify-between items-center mb-1">
                    <div class="flex items-center gap-2 overflow-hidden mr-2">
                      <span class="bolinha-cor shrink-0" style="background:${c.cor};"></span>
                      <strong class="text-principal text-sm truncate">${c.nome}</strong>
                    </div>
                    <div class="flex flex-col items-end shrink-0">
                      <span class="text-sm font-bold ${c.valorEfetivo >= 0 ? 'text-principal' : 'text-perigo'}">${c.valorEfetivo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                      <span class="text-xs text-suave" style="font-size: 0.65rem;">Proj: ${c.valorProj.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                    </div>
                  </div>
                  <div class="w-full bg-principal rounded-full h-1 mt-1 overflow-hidden" style="background: var(--borda);">
                    <div class="h-full rounded-full opacity-80" style="width: ${perc}%; background: ${c.cor};"></div>
                  </div>
                </div>`;
          });
          htmlSaldos += `</div></div>`;
        }
      });
    }
    listaSaldos.innerHTML = htmlSaldos;
  }

  function renderizarPainelCredito(anoFiltro, mesFiltro, periodo) {
      const infoCartoes = {};
      configContas.forEach(c => {
          if (c.tipo && c.tipo.toUpperCase().includes('CRÉDITO')) {
            let lim = typeof c.limite === 'number' ? c.limite : parseFloat(String(c.limite).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
            infoCartoes[c.nome] = { limite: lim, cor: c.cor || '#e74c3c', fechamento: parseInt(c.fechamento) || 31, vencimento: parseInt(c.vencimento) || 31, meses: {}, totalGasto: 0, totalPago: 0 };
          }
      });

      const creditoAnual = {}; 
      ORDEM_MESES.forEach(m => creditoAnual[m] = { total: 0, cartoes: {} });

      allLancamentos.forEach(l => {
          if (!l.conta || !infoCartoes[l.conta]) return;
          const c = infoCartoes[l.conta];
          const dtPagStr = l.data_pag ? l.data_pag.split('T')[0] : null;
          if (!dtPagStr) return;

          const mesLanc = dtPagStr.substring(0, 7);
          const valor = parseFloat(l.valor) || 0;
          const ehCredito = (l.no_credito === true || l.no_credito === 'SIM' || String(l.no_credito).toUpperCase() === 'TRUE');
          const ehFatura = (l.categoria === 'Faturas');

          if (!c.meses[mesLanc]) c.meses[mesLanc] = { gasto: 0, pago: 0 };

          let impacto = 0;
          if (ehCredito && !ehFatura) impacto = (valor < 0) ? Math.abs(valor) : -Math.abs(valor);
          let pago = 0;
          if (ehFatura) pago = Math.abs(valor);

          c.meses[mesLanc].gasto += impacto;
          c.meses[mesLanc].pago += pago;
          c.totalGasto += impacto;
          c.totalPago += pago;

          if (visaoDashboard === 'anual' && mesLanc.substring(0,4) === anoFiltro) {
              const mesJusto = mesLanc.substring(5,7);
              if (!creditoAnual[mesJusto].cartoes[l.conta]) creditoAnual[mesJusto].cartoes[l.conta] = { gastoMes: 0, pagoMes: 0, cor: c.cor, fechamento: c.fechamento, vencimento: c.vencimento };
              if (impacto !== 0) { creditoAnual[mesJusto].cartoes[l.conta].gastoMes += impacto; creditoAnual[mesJusto].total += impacto; }
              if (pago > 0) creditoAnual[mesJusto].cartoes[l.conta].pagoMes += pago;
          }
      });

      function gerarSeloFatura(gasto, pago, anoFiltroNum, mesFiltroNum, diaFechamento) {
          if (gasto <= 0.05 && pago <= 0.05) return '';
          if (pago >= (gasto - 0.05)) return '<span class="badge-selo" style="background:rgba(46, 204, 113, 0.15); color:var(--cor-sucesso);">PAGA</span>';
          const hoje = new Date(); const anoAtual = hoje.getFullYear(); const mesAtual = hoje.getMonth() + 1; const diaAtual = hoje.getDate();
          if (anoFiltroNum < anoAtual || (anoFiltroNum === anoAtual && mesFiltroNum < mesAtual)) return '<span class="badge-selo" style="background:rgba(231, 76, 60, 0.15); color:var(--cor-perigo);">ATRASADA</span>';
          if (anoFiltroNum === anoAtual && mesFiltroNum === mesAtual) {
              if (diaFechamento && diaAtual > diaFechamento) return '<span class="badge-selo" style="background:rgba(243, 156, 18, 0.15); color:var(--cor-aviso);">FECHADA</span>';
              return '<span class="badge-selo" style="background:rgba(52, 152, 219, 0.15); color:var(--cor-destaque);">ABERTA</span>';
          }
          if (anoFiltroNum === anoAtual && mesFiltroNum === mesAtual + 1) return '<span class="badge-selo" style="background:rgba(52, 152, 219, 0.15); color:var(--cor-destaque);">ABERTA</span>';
          return '<span class="badge-selo" style="background:rgba(149, 165, 166, 0.15); color:var(--texto-suave);"><i class="material-icons" style="font-size:0.75rem;">event</i> FUTURA</span>';
      }

      const listaCredito = document.getElementById('dashListaCredito');
      if (listaCredito) {
          let htmlCredito = '';
          const hojeObj = new Date();
          const hojeYMD = `${hojeObj.getFullYear()}-${String(hojeObj.getMonth()+1).padStart(2,'0')}-${String(hojeObj.getDate()).padStart(2,'0')}`;

          Object.keys(infoCartoes).forEach(nome => {
              const c = infoCartoes[nome];
              const mesesOrdenados = Object.keys(c.meses).sort();
              let mesAtivo = null;

              for (let i = 0; i < mesesOrdenados.length; i++) {
                  const m = mesesOrdenados[i];
                  if (c.meses[m].gasto - c.meses[m].pago > 0.05) { mesAtivo = m; break; }
              }

              if (!mesAtivo) {
                  let mFatura = hojeObj.getMonth() + 1; let aFatura = hojeObj.getFullYear();
                  if (hojeObj.getDate() > c.fechamento) { mFatura++; if (mFatura > 12) { mFatura = 1; aFatura++; } }
                  mesAtivo = `${aFatura}-${String(mFatura).padStart(2,'0')}`;
                  if (!c.meses[mesAtivo]) c.meses[mesAtivo] = { gasto: 0, pago: 0 };
              }

              c.mesAtivo = mesAtivo;
              c.gastoAtivo = c.meses[mesAtivo].gasto;
              c.pagoAtivo = c.meses[mesAtivo].pago;
              c.saldoAtivo = Math.max(0, c.gastoAtivo - c.pagoAtivo);

              const [anoA, mesA] = mesAtivo.split('-').map(Number);
              const dtVenc = new Date(anoA, mesA - 1, c.vencimento);
              c.vencimentoStr = `${dtVenc.getFullYear()}-${String(dtVenc.getMonth()+1).padStart(2,'0')}-${String(dtVenc.getDate()).padStart(2,'0')}`;
              c.vencimentoFormatado = `${String(dtVenc.getDate()).padStart(2,'0')}/${String(dtVenc.getMonth()+1).padStart(2,'0')}`;

              let dtFech = (c.fechamento > c.vencimento) ? new Date(anoA, mesA - 2, c.fechamento) : new Date(anoA, mesA - 1, c.fechamento);
              const fechStr = `${dtFech.getFullYear()}-${String(dtFech.getMonth()+1).padStart(2,'0')}-${String(dtFech.getDate()).padStart(2,'0')}`;

              if (hojeYMD > c.vencimentoStr) { c.status = 'ATRASADA'; c.corSelo = 'var(--cor-perigo)'; c.bgSelo = 'rgba(231,76,60,0.15)'; }
              else if (hojeYMD > fechStr) { c.status = 'FECHADA'; c.corSelo = 'var(--cor-aviso)'; c.bgSelo = 'rgba(243,156,18,0.15)'; }
              else { c.status = 'ABERTA'; c.corSelo = 'var(--cor-destaque)'; c.bgSelo = 'rgba(52,152,219,0.15)'; }

              c.gastoFuturo = 0;
              mesesOrdenados.forEach(m => { if (m > mesAtivo) c.gastoFuturo += Math.max(0, c.meses[m].gasto - c.meses[m].pago); });
              c.usoTotalRealCard = Math.max(0, c.totalGasto - c.totalPago);
          });

          // Painel: Faturas Ativas
          if (visaoDashboard === 'mensal' && modoVisaoCredito === 'aberta') {
              let qtdAtrasada = 0, qtdFechada = 0, qtdAberta = 0;
              let vencAtrasada = null, vencFechada = null, vencAberta = null;
              let totFaturaAtiva = 0, totComprometido = 0, totFuturas = 0, totLimiteLivre = 0;

              const updateMinDate = (curr, nova) => (!curr || nova < curr) ? nova : curr;

              Object.values(infoCartoes).forEach(c => {
                  if (c.gastoAtivo <= 0 && c.usoTotalRealCard <= 0) return;
                  totFaturaAtiva += c.saldoAtivo;
                  totComprometido += c.usoTotalRealCard;
                  totFuturas += c.gastoFuturo;
                  totLimiteLivre += Math.max(0, c.limite - c.usoTotalRealCard);

                  if (c.status === 'ATRASADA') { qtdAtrasada++; vencAtrasada = updateMinDate(vencAtrasada, c.vencimentoStr); }
                  else if (c.status === 'FECHADA') { qtdFechada++; vencFechada = updateMinDate(vencFechada, c.vencimentoStr); }
                  else if (c.status === 'ABERTA') { qtdAberta++; vencAberta = updateMinDate(vencAberta, c.vencimentoStr); }
              });

              const formatarResumo = (qtd, txt, dataIso, cor) => {
                  if (qtd === 0) return '';
                  const dIso = new Date(dataIso + 'T00:00:00'); const dHj = new Date(hojeYMD + 'T00:00:00');
                  const diff = Math.ceil((dIso.getTime() - dHj.getTime()) / 86400000);
                  const txtTempo = diff < 0 ? `há ${Math.abs(diff)} dia(s)` : (diff === 0 ? 'hoje' : `em ${diff} dia(s)`);
                  const dtF = `${String(dIso.getDate()).padStart(2,'0')}/${String(dIso.getMonth()+1).padStart(2,'0')}`;
                  return `<div class="mb-1 text-sm text-suave"><strong style="color: ${cor};">${qtd} fatura(s) ${txt}</strong> | Venc. ${txtTempo} (${dtF})</div>`;
              };

              let htmlResumoCol1 = formatarResumo(qtdAtrasada, 'atrasada(s)', vencAtrasada, 'var(--cor-perigo)') + formatarResumo(qtdFechada, 'fechada(s)', vencFechada, 'var(--cor-aviso)') + formatarResumo(qtdAberta, 'aberta(s)', vencAberta, 'var(--cor-destaque)');
              if (!htmlResumoCol1) htmlResumoCol1 = '<div class="text-sucesso font-bold text-sm py-2 flex items-center gap-1"><span class="material-icons text-base">check_circle</span> Nenhuma fatura pendente</div>';

              htmlCredito += `
              <div class="flex flex-wrap gap-2 mb-3">
                  <div id="cred-resumo-ativa" class="flex-1 flex-col justify-center min-w-250 bg-principal p-3 rounded border border-borda">
                      ${htmlResumoCol1}
                  </div>
                  <div class="flex-2 min-w-250 bg-principal p-3 rounded border border-borda flex justify-between items-center">
                      <div>
                          <div class="text-xs uppercase font-bold text-suave mb-1">Total das Faturas</div>
                          <div class="text-xl font-bold text-principal">${totFaturaAtiva.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>
                      </div>
                      <div class="text-right text-xs text-suave flex-col gap-1">
                          <div>Saldo comprometido <strong class="text-principal">${totComprometido.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
                          <div>Desp. Futuras <strong class="text-principal">${totFuturas.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
                          <div>Limite Disponível <strong class="text-principal">${totLimiteLivre.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
                      </div>
                  </div>
              </div>`;

              let exibiuAlgo = false;
              Object.keys(infoCartoes).sort((a,b) => infoCartoes[b].saldoAtivo - infoCartoes[a].saldoAtivo).forEach(nome => {
                  const c = infoCartoes[nome];
                  if (c.gastoAtivo > 0 || c.pagoAtivo > 0) {
                      exibiuAlgo = true;
                      let limiteLivre = Math.max(0, c.limite - c.usoTotalRealCard);
                      let pA = 0, pF = 0;
                      if (c.limite > 0) {
                          pA = Math.max(0, Math.min((c.gastoAtivo / c.limite) * 100, 100));
                          pF = Math.max(0, Math.min((c.gastoFuturo / c.limite) * 100, 100 - pA));
                      }
                      htmlCredito += `
                      <div class="card-credito">
                          <div class="card-header">
                              <div class="credito-nome-selo">
                                  <strong class="card-titulo">
                                      <span style="width:10px; height:10px; border-radius:50%; background:${c.cor}; flex-shrink:0;"></span><span>${nome}</span>
                                  </strong>
                                  <div class="credito-selo-vencimento flex items-center gap-2">
                                    <span class="badge-selo" style="background:${c.bgSelo}; color:${c.corSelo};">${c.status}</span>
                                    <span class="text-xs text-suave">(Venc. ${c.vencimentoFormatado})</span>
                                  </div>
                              </div>
                              <div class="card-valores-dir">
                                  <span class="card-valor-principal">${c.gastoAtivo.toLocaleString('pt-BR', {style:'currency',currency:'BRL'})}</span>
                                  ${c.pagoAtivo > 0 ? `<span class="card-valor-abatido">Pago: ${c.pagoAtivo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span>` : ''}
                              </div>
                          </div>
                          <div class="flex items-center gap-2 mb-2">
                              <div class="flex-1 flex-col gap-1">
                                  <div class="w-full h-1 bg-principal rounded-full overflow-hidden"><div style="width: ${pA}%; height:100%; background: ${c.cor};"></div></div>
                                  <div class="w-full h-1 bg-principal rounded-full overflow-hidden"><div style="width: ${pF}%; height:100%; background: var(--texto-suave); opacity: 0.5;"></div></div>
                              </div>
                              <span class="text-xs font-bold text-suave min-w-[40px] text-right">${pA.toFixed(1)}%</span>
                          </div>
                          <div class="credito-footer-grid">
                              <div>Limite: <strong>${c.limite.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
                              <div>Futuro: <strong>${c.gastoFuturo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
                              <div>Uso Total: <strong>${c.usoTotalRealCard.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
                              <div>Livre: <strong class="text-principal">${limiteLivre.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
                          </div>
                      </div>`;
                  }
              });
              if (!exibiuAlgo) htmlCredito += '<p class="text-center p-3 text-suave">Nenhum uso registrado.</p>';
          }
          // Painel: Crédito Mensal Filtrado
          else if (visaoDashboard === 'mensal' && modoVisaoCredito === 'filtrado') {
              let totFatura = 0, totPago = 0, totFuturoGeral = 0, totUsoRealGlobal = 0, totLivreGlobal = 0, totAtualEAtrasado = 0;
              
              Object.keys(infoCartoes).forEach(nome => { 
                  const c = infoCartoes[nome];
                  c.gMesSnapshot = 0; c.pMesSnapshot = 0; c.atrasadaAtualSnapshot = 0; c.futurasSnapshot = 0;
              });
              
              allLancamentos.forEach(l => {
                  if (!l.conta || !infoCartoes[l.conta]) return;
                  const c = infoCartoes[l.conta];
                  
                  const dtPagStr = l.data_pag ? l.data_pag.split('T')[0] : null;
                  const dtCompraStr = l.data_compra ? l.data_compra.split('T')[0] : null;
                  if (!dtPagStr || !dtCompraStr) return;

                  const mesLanc = dtPagStr.substring(0, 7);
                  const mesCompra = dtCompraStr.substring(0, 7);
                  const valor = parseFloat(l.valor) || 0;
                  
                  const ehCredito = (l.no_credito === true || l.no_credito === 'SIM' || String(l.no_credito).toUpperCase() === 'TRUE');
                  const ehFatura = (l.categoria === 'Faturas');

                  let impacto = 0;
                  if (ehCredito && !ehFatura) impacto = (valor < 0) ? Math.abs(valor) : -Math.abs(valor);
                  let pago = 0;
                  if (ehFatura) pago = Math.abs(valor);

                  if (mesLanc === periodo && mesCompra <= periodo) {
                      c.gMesSnapshot += impacto;
                      c.pMesSnapshot += pago;
                  }

                  if (mesLanc <= periodo && mesCompra <= periodo) {
                      c.atrasadaAtualSnapshot += impacto;
                      c.atrasadaAtualSnapshot -= pago;
                  }

                  if (mesCompra <= periodo && mesLanc > periodo) {
                      c.futurasSnapshot += impacto;
                  }
              });

              Object.keys(infoCartoes).forEach(nome => { 
                  const c = infoCartoes[nome];
                  
                  let saldoBruto = c.atrasadaAtualSnapshot; 
                  let usoTotalNoPeriodo = saldoBruto + c.futurasSnapshot;
                  usoTotalNoPeriodo = Math.max(0, usoTotalNoPeriodo); 
                  
                  let atrasadaExibicao = Math.max(0, saldoBruto);
                  let futurasExibicao = c.futurasSnapshot;
                  
                  if (saldoBruto < 0) {
                      futurasExibicao = Math.max(0, c.futurasSnapshot + saldoBruto);
                  }
                  
                  let livreNoPeriodo = Math.max(0, c.limite - usoTotalNoPeriodo);
                  
                  totFatura += c.gMesSnapshot; 
                  totPago += c.pMesSnapshot;
                  totFuturoGeral += futurasExibicao;
                  totAtualEAtrasado += atrasadaExibicao;
                  totUsoRealGlobal += usoTotalNoPeriodo;
                  totLivreGlobal += livreNoPeriodo;
                  
                  c.usoNoPeriodo = usoTotalNoPeriodo;
                  c.livreNoPeriodo = livreNoPeriodo;
                  c.atrasadaExibicao = atrasadaExibicao;
                  c.futurasExibicao = futurasExibicao;
              });
              
              let totPendente = Math.max(0, totFatura - totPago);

              htmlCredito += `
              <div class="flex flex-wrap gap-2 mb-3">
                  <div class="flex-1 min-w-250 bg-principal p-3 rounded border border-borda flex justify-between items-center">
                      <div>
                          <div class="text-xs uppercase font-bold text-suave mb-1">Fatura do Período</div>
                          <div class="text-xl font-bold text-principal">${totFatura.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</div>
                      </div>
                      <div class="text-right text-xs text-suave flex-col gap-1">
                          <div>Já pago <span class="text-sucesso font-bold">${totPago.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span></div>
                          <div>Pendente <strong class="text-principal">${totPendente.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></div>
                      </div>
                  </div>
                  <div class="flex-1 min-w-250 bg-principal p-3 rounded border border-borda flex justify-between items-center">
                      <div>
                          <div class="text-xs uppercase font-bold text-suave mb-1">Saldo Comprometido</div>
                          <div class="text-xl font-bold text-principal">${totUsoRealGlobal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</div>
                      </div>
                      <div class="text-right text-xs text-suave flex-col gap-1">
                          <div>Atrasada/Atual <strong class="text-principal">${totAtualEAtrasado.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></div>
                          <div>Futuras <strong class="text-principal">${totFuturoGeral.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></div>
                          <div>Livre <strong class="text-principal">${totLivreGlobal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></div>
                      </div>
                  </div>
              </div>`;

              let exibiuAlgo = false;
              Object.keys(infoCartoes).sort((a, b) => infoCartoes[b].usoNoPeriodo - infoCartoes[a].usoNoPeriodo).forEach(nome => {
                  const c = infoCartoes[nome];
                  if (c.gMesSnapshot > 0 || c.pMesSnapshot > 0) {
                      exibiuAlgo = true;
                      
                      let pA = 0, pF = 0;
                      if (c.limite > 0) {
                          pA = Math.max(0, Math.min((c.gMesSnapshot / c.limite) * 100, 100));
                          pF = Math.max(0, Math.min((c.futurasExibicao / c.limite) * 100, 100 - pA));
                      }

                      const selo = gerarSeloFatura(c.gMesSnapshot, c.pMesSnapshot, parseInt(anoFiltro), parseInt(mesFiltro), c.fechamento);

                      htmlCredito += `
                      <div class="card-credito">
                          <div class="card-header">
                              <div class="credito-nome-selo">
                                  <strong class="card-titulo">
                                      <span style="width:10px; height:10px; border-radius:50%; background:${c.cor}; flex-shrink:0;"></span><span>${nome}</span>
                                  </strong>
                                  ${selo}
                              </div>
                              <div class="card-valores-dir">
                                  <span class="card-valor-principal">${c.gMesSnapshot.toLocaleString('pt-BR', {style:'currency',currency:'BRL'})}</span>
                                  ${c.pMesSnapshot > 0 ? `<span class="card-valor-abatido">Abatido: ${c.pMesSnapshot.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span>` : ''}
                              </div>
                          </div>
                          <div class="flex items-center gap-2 mb-2">
                              <div class="flex-1 flex-col gap-1">
                                  <div class="w-full h-1 bg-principal rounded-full overflow-hidden"><div style="width: ${pA}%; height:100%; background: ${c.cor};"></div></div>
                                  <div class="w-full h-1 bg-principal rounded-full overflow-hidden"><div style="width: ${pF}%; height:100%; background: var(--texto-suave); opacity: 0.5;"></div></div>
                              </div>
                              <span class="text-xs font-bold text-suave min-w-[40px] text-right">${pA.toFixed(1)}%</span>
                          </div>
                          <div class="credito-footer-grid">
                              <div>Limite: <strong>${c.limite.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
                              <div>Futuro: <strong>${c.futurasExibicao.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
                              <div>Uso Total: <strong>${c.usoNoPeriodo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
                              <div>Livre: <strong class="text-principal">${c.livreNoPeriodo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
                          </div>
                      </div>`;
                  }
              });
              if (!exibiuAlgo) htmlCredito += '<p class="text-center p-3 text-suave">Nenhum uso registrado no período.</p>';
          }
          // Painel: Crédito Anual
          else if (visaoDashboard === 'anual') {
              let totFaturaAno = 0, totPagoAno = 0;
              let totUsoRealGlobal = 0, totAtualEAtrasado = 0, totFuturoGeral = 0, totLivreGlobal = 0;

              const hojeObj = new Date();
              const hojeMes = `${hojeObj.getFullYear()}-${String(hojeObj.getMonth() + 1).padStart(2, '0')}`;

              const faturasAnuais = {};
              ORDEM_MESES.forEach(m => faturasAnuais[m] = { total: 0, cartoes: {} });

              Object.keys(infoCartoes).forEach(nome => {
                  const c = infoCartoes[nome];
                  let atrasadaAtual = 0, futuras = 0;
                  Object.keys(c.meses).forEach(m => {
                      let pendente = Math.max(0, c.meses[m].gasto - c.meses[m].pago);
                      if (m <= hojeMes) atrasadaAtual += pendente;
                      else futuras += pendente;
                  });
                  
                  let usoTotal = atrasadaAtual + futuras;
                  let livre = Math.max(0, c.limite - usoTotal);
                  
                  totAtualEAtrasado += atrasadaAtual;
                  totFuturoGeral += futuras;
                  totUsoRealGlobal += usoTotal;
                  totLivreGlobal += livre;

                  Object.keys(c.meses).forEach(m => {
                      if (m.substring(0, 4) === anoFiltro) {
                          const mesJusto = m.substring(5, 7);
                          const gMes = c.meses[m].gasto;
                          const pMes = c.meses[m].pago;
                          
                          totFaturaAno += gMes;
                          totPagoAno += pMes;

                          if (gMes > 0 || pMes > 0) {
                              if (!faturasAnuais[mesJusto].cartoes[nome]) {
                                  faturasAnuais[mesJusto].cartoes[nome] = { gastoMes: 0, pagoMes: 0, cor: c.cor, fechamento: c.fechamento, vencimento: c.vencimento };
                              }
                              faturasAnuais[mesJusto].cartoes[nome].gastoMes += gMes;
                              faturasAnuais[mesJusto].cartoes[nome].pagoMes += pMes;
                              faturasAnuais[mesJusto].total += gMes;
                          }
                      }
                  });
              });

              let totPendenteAno = Math.max(0, totFaturaAno - totPagoAno);

              htmlCredito += `
              <div class="flex flex-wrap gap-2 mb-3">
                  <div class="flex-1 min-w-250 bg-principal p-3 rounded border border-borda flex justify-between items-center">
                      <div>
                          <div class="text-xs uppercase font-bold text-suave mb-1">Faturas do Ano</div>
                          <div class="text-xl font-bold text-principal">${totFaturaAno.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</div>
                      </div>
                      <div class="text-right text-xs text-suave flex-col gap-1">
                          <div>Já pago <span class="text-sucesso font-bold">${totPagoAno.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span></div>
                          <div>Pendente <strong class="text-principal">${totPendenteAno.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></div>
                      </div>
                  </div>
                  <div class="flex-1 min-w-250 bg-principal p-3 rounded border border-borda flex justify-between items-center">
                      <div>
                          <div class="text-xs uppercase font-bold text-suave mb-1">Saldo Comprometido</div>
                          <div class="text-xl font-bold text-principal">${totUsoRealGlobal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</div>
                      </div>
                      <div class="text-right text-xs text-suave flex-col gap-1">
                          <div>Atrasada/Atual <strong class="text-principal">${totAtualEAtrasado.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></div>
                          <div>Futuras <strong class="text-principal">${totFuturoGeral.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></div>
                          <div>Livre <strong class="text-principal">${totLivreGlobal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></div>
                      </div>
                  </div>
              </div>`;

              ORDEM_MESES.forEach(mes => {
                  const dadosMes = faturasAnuais[mes];
                  if (dadosMes.total > 0 || Object.keys(dadosMes.cartoes).length > 0) {
                      htmlCredito += `<details class="cat-group tema-neutro" ontoggle="const ic = this.querySelector('.material-icons'); if(ic) ic.innerText = this.open ? 'expand_less' : 'expand_more';">
                          <summary class="cat-summary">
                              <span class="text-sm flex items-center gap-2"><span class="material-icons text-base text-suave">expand_more</span> ${NOME_MESES[mes]}</span>
                              <span class="font-bold text-perigo">${(dadosMes.total || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                          </summary><div class="cat-content">`;
                      
                      Object.keys(dadosMes.cartoes).map(k => ({nome: k, ...dadosMes.cartoes[k]})).sort((a,b) => (b.gastoMes||0) - (a.gastoMes||0)).forEach((c) => {
                          const selo = gerarSeloFatura(c.gastoMes||0, c.pagoMes||0, parseInt(anoFiltro), parseInt(mes), c.fechamento);
                          htmlCredito += `
                          <div class="cat-item">
                              <div class="credito-nome-selo gap-1">
                                  <strong class="text-principal text-sm flex items-center gap-2">
                                      <span class="bolinha-cor shrink-0" style="background:${c.cor};"></span><span>${c.nome}</span>
                                  </strong>
                                  ${selo}
                              </div>
                              <div class="flex flex-col gap-1 text-right shrink-0">
                                  <span class="text-principal font-bold">${(c.gastoMes||0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                                  ${c.pagoMes > 0 ? `<span class="text-xs text-sucesso">Pago: ${(c.pagoMes||0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>` : ''}
                              </div>
                          </div>`;
                      });
                      htmlCredito += `</div></details>`;
                  }
              });
          }
          listaCredito.innerHTML = htmlCredito;
      }
  }

  function renderizarGraficoDespesas(totalDespesasGrafico, gruposGrafico) {
    const boxGrafico = document.getElementById('boxGraficoDespesas');
    if(!boxGrafico) return;

    document.getElementById('dashTituloGrafico').innerHTML = `<span class="material-icons ${fluxoGrafico === 'DESPESA' ? 'text-perigo' : 'text-sucesso'}">pie_chart</span> ${fluxoGrafico === 'DESPESA' ? 'Despesas' : 'Receitas'}`;

    if (totalDespesasGrafico === 0) {
        boxGrafico.innerHTML = '<p class="text-center text-suave w-full py-5">Nenhum registro para este fluxo.</p>';
        return;
    }

    const paletaCores = ['#e74c3c', '#f39c12', '#3498db', '#9b59b6', '#34495e', '#16a085', '#27ae60', '#2980b9'];
    let cumulativePercent = 0; let svgSlices = '';
    const arrayGrupos = Object.keys(gruposGrafico).map(k => ({nome: k, valor: gruposGrafico[k]})).sort((a,b) => b.valor - a.valor);
    
    const totalPaginas = Math.ceil(arrayGrupos.length / ITENS_POR_PAGINA_LEGENDA);
    if (paginaLegendaAtual > totalPaginas) paginaLegendaAtual = totalPaginas;
    const inicioSlice = (paginaLegendaAtual - 1) * ITENS_POR_PAGINA_LEGENDA;
    
    let legendHtml = '<div style="width: 100%; margin-top: 10px;">';

    arrayGrupos.forEach((g, idx) => {
        const perc = (g.valor / totalDespesasGrafico) * 100;
        const cor = paletaCores[idx % paletaCores.length];
        
        // Aumentamos o stroke-width para 10 (fechando o buraco) e alteramos o cx/cy para 21
        svgSlices += `<circle r="15.9155" cx="21" cy="21" fill="transparent" stroke="${cor}" stroke-width="10" stroke-dasharray="${perc} ${100 - perc}" stroke-dashoffset="${-cumulativePercent}" style="transition: all 0.3s ease; cursor:pointer;" onmouseover="interagirDonut(this, '${g.nome}', '${g.valor.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}', '${perc.toFixed(1)}%')" onmouseout="resetarDonut(this)"></circle>`;
        cumulativePercent += perc;
        
        if (idx >= inicioSlice && idx < inicioSlice + ITENS_POR_PAGINA_LEGENDA) {
            const iconeG = agrupamentoDashboard === 'categoria' ? getCatIcon(g.nome) : 'local_offer';
            
            legendHtml += `<div class="flex justify-between items-center py-2" style="border-bottom: 1px dashed var(--borda);">
                             <span class="flex items-center gap-2 text-sm text-principal">
                               <span class="bolinha-cor shrink-0" style="background:${cor};"></span>
                               <span class="material-icons text-suave text-base">${iconeG}</span>
                               <span class="truncate">${g.nome}</span>
                             </span>
                             <div class="text-right shrink-0 ml-2">
                               <strong class="text-sm text-principal">${g.valor.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong>
                               <span class="text-xs text-suave ml-2">${perc.toFixed(1)}%</span>
                             </div>
                           </div>`;
        }
    });
    
    if (totalPaginas > 1) {
        legendHtml += `<div class="flex justify-between items-center mt-2 text-sm">
                         <button class="btn-visao" onclick="mudarPaginaLegenda(-1)" ${paginaLegendaAtual === 1 ? 'disabled style="opacity:0.5;"' : ''}>&laquo; Anterior</button>
                         <span class="text-suave">Pág ${paginaLegendaAtual} de ${totalPaginas}</span>
                         <button class="btn-visao" onclick="mudarPaginaLegenda(1)" ${paginaLegendaAtual === totalPaginas ? 'disabled style="opacity:0.5;"' : ''}>Próxima &raquo;</button>
                       </div>`;
    }
    legendHtml += '</div>';

    boxGrafico.innerHTML = `
      <div class="flex items-center justify-center gap-6 w-full mt-2 mb-3">
        <div style="width: 110px; height: 110px; position: relative; flex-shrink: 0;">
          <svg viewBox="0 0 42 42" style="width: 100%; height: 100%; transform: rotate(-90deg); overflow: visible;">
            <circle r="15.9155" cx="21" cy="21" fill="transparent" stroke="var(--bg-principal)" stroke-width="10"></circle>
            ${svgSlices}
          </svg>
        </div>
        <div class="flex flex-col justify-center" id="donutInfoText" style="width: 150px; flex-shrink: 0;">
           <span class="text-xs text-suave font-bold uppercase tracking-wider">Total</span>
           <strong class="text-2xl text-principal font-bold mt-1" style="line-height: 1;">${totalDespesasGrafico.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong>
        </div>
      </div>
      ${legendHtml}
    `;
  }

  function interagirDonut(elemento, titulo, valor, perc) {
    elemento.setAttribute('stroke-width', '13'); 
    const info = document.getElementById('donutInfoText');
    if (!donutCentroOriginal) donutCentroOriginal = info.innerHTML;
    
    // Texto blindado no container de 150px para não empurrar o gráfico
    info.innerHTML = `
       <span class="text-xs text-suave font-bold uppercase tracking-wider truncate block w-full" title="${titulo}">${perc} - ${titulo}</span>
       <strong class="text-xl text-destaque font-bold mt-1 block w-full truncate" style="line-height: 1;">${valor}</strong>
    `;
  }
  
  function resetarDonut(elemento) {
    elemento.setAttribute('stroke-width', '10'); 
    const info = document.getElementById('donutInfoText');
    if (donutCentroOriginal) info.innerHTML = donutCentroOriginal;
  }

  function renderizarRankingTop5(despesasParaRanking) {
    const boxTop5 = document.getElementById('dashTop5Despesas');
    if(!boxTop5) return;

    document.getElementById('dashTituloRanking').innerHTML = `<span class="material-icons ${fluxoRanking === 'DESPESA' ? 'text-aviso' : 'text-sucesso'}">format_list_numbered</span> Top 5 ${fluxoRanking === 'DESPESA' ? 'Despesas' : 'Receitas'}`;

    const rankingAgrupado = {};
    despesasParaRanking.forEach(l => {
      const cat = l.categoria || 'Sem Categoria';
      if (!rankingAgrupado[cat]) rankingAgrupado[cat] = { total: 0, itens: [] };
      rankingAgrupado[cat].total += Math.abs(parseFloat(l.valor));
      rankingAgrupado[cat].itens.push(l);
    });
    
    // Pega as 5 maiores categorias
    const categoriasOrdenadas = Object.keys(rankingAgrupado).map(k => ({nome: k, ...rankingAgrupado[k]})).sort((a,b) => b.total - a.total).slice(0, 5);

    if (categoriasOrdenadas.length === 0) {
        boxTop5.innerHTML = '<p class="text-center text-suave w-full py-5">Nenhum registro.</p>';
        return;
    }
    
    let htmlTop5 = '';
    categoriasOrdenadas.forEach((cat, index) => {
      let htmlItens = '';
      
      // Ordena os itens da categoria do maior para o menor e pega apenas os 5 primeiros
      const itensOrdenados = cat.itens.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
      const top5Itens = itensOrdenados.slice(0, 5);
      const totalItensOcultos = itensOrdenados.length - 5;

      top5Itens.forEach(l => {
          const dataF = l.data_compra ? new Date(l.data_compra).toLocaleDateString('pt-BR', {timeZone:'UTC'}).substring(0,5) : '';
          const iconeCredito = (l.no_credito === true || l.no_credito === 'SIM' || String(l.no_credito).toUpperCase() === 'TRUE') ? `<span class="material-icons text-perigo" style="font-size:0.8rem;" title="Crédito">credit_card</span>` : '';
          
          htmlItens += `<div class="cat-item p-2" style="border-bottom: 1px dashed var(--borda);">
                          <div class="flex flex-col overflow-hidden">
                            <strong class="text-principal text-xs flex items-center gap-1">${l.descricao} ${iconeCredito}</strong>
                            <span class="text-suave text-xs" style="font-size:0.65rem;">${dataF} • ${l.conta || 'Sem conta'}</span>
                          </div>
                          <span class="text-suave text-sm">${Math.abs(l.valor).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                        </div>`;
      });

      // Se houver mais de 5 itens, adiciona um rodapé informando quantos foram ocultados
      if (totalItensOcultos > 0) {
          htmlItens += `<div class="text-center p-2 text-xs text-suave italic bg-principal">
                          + ${totalItensOcultos} outro(s) lançamento(s) menor(es)
                        </div>`;
      }

      let mC = index === 0 ? 'background:#f1c40f; color:#8a6d00;' : (index === 1 ? 'background:#bdc3c7; color:#444;' : (index === 2 ? 'background:#cd7f32; color:#fff;' : 'background:var(--cor-destaque); color:#fff;'));
      
      htmlTop5 += `<details class="cat-group tema-neutro" ontoggle="const ic = this.querySelector('.icone-expansao'); if(ic) ic.innerText = this.open ? 'expand_less' : 'expand_more';">
                     <summary class="cat-summary py-2 px-3">
                       <div class="flex items-center gap-2">
                         <span class="material-icons icone-expansao text-suave text-base">expand_more</span>
                         <div style="width:20px; height:20px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-size:0.65rem; font-weight:bold; ${mC}">${index + 1}</div>
                         <span class="material-icons text-suave text-base">${getCatIcon(cat.nome)}</span>
                         <span class="text-sm font-bold text-principal">${cat.nome}</span>
                       </div>
                       <span style="color:${fluxoRanking === 'DESPESA' ? 'var(--cor-perigo)' : 'var(--cor-sucesso)'}; font-weight:bold; font-size:0.85rem;">${cat.total.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                     </summary>
                     <div class="cat-content bg-principal">${htmlItens}</div>
                   </details>`;
    });
    
    boxTop5.innerHTML = htmlTop5;
  }

  function renderizarPivotAnual(anoPivot) {
    const boxPivot = document.getElementById('dashListaPivotAnual');
    if (!boxPivot) return;

    document.getElementById('dashTituloPivot').classList.add('justify-between');
    // Injetando ambos os botões ao lado do título. O CSS decide qual mostrar!
    document.getElementById('dashTituloPivot').innerHTML = `
        <div class="flex items-center gap-2">
          <span class="material-icons text-destaque">calendar_view_month</span> 
          <span>Matriz Anual (${anoPivot})</span>
        </div>
        <div class="flex items-center gap-2">
          <button id="btnTopPivotDetalhes" onclick="toggleFullScreenPivot()" class="btn btn-secundario hidden px-3 py-1 text-xs font-bold flex items-center gap-1">
             Ver Detalhes <span class="material-icons text-sm">open_in_full</span>
          </button>
          <button id="btnTopPivotFull" onclick="toggleFullScreenPivot()" class="btn-icone text-suave flex items-center justify-center" title="Tela Cheia">
              <span class="material-icons text-lg" id="iconeFullScreen">fullscreen</span>
          </button>
        </div>`;
    
    const mapCatTipo = {}; configCategorias.forEach(c => mapCatTipo[c.nome] = c.tipo || 'Outros');
    const dadosPivot = {}; const totaisGerais = { rec: {}, desp: {} };
    for (let i = 1; i <= 12; i++) { const m = String(i).padStart(2, '0'); totaisGerais.rec[m] = 0; totaisGerais.desp[m] = 0; }
    
    let temDados = false;

    allLancamentos.forEach(l => {
      const dtBase = l.data_pag || l.data_compra;
      if (!dtBase) return;
      const d = new Date(dtBase);
      if (isNaN(d.getTime()) || d.getFullYear().toString() !== anoPivot || l.categoria === 'Movimentações' || l.categoria === 'Faturas') return; 
      
      temDados = true;
      const mesStr = String(d.getMonth() + 1).padStart(2, '0');
      const tipo = mapCatTipo[l.categoria] || 'Outros'; const cat = l.categoria || 'Sem Categoria';
      const valorReal = parseFloat(l.valor) || 0; const valorAbsoluto = Math.abs(valorReal); 
      
      if (!dadosPivot[tipo]) { dadosPivot[tipo] = { totalTipo: {}, categorias: {} }; for (let i = 1; i <= 12; i++) dadosPivot[tipo].totalTipo[String(i).padStart(2, '0')] = 0; }
      if (!dadosPivot[tipo].categorias[cat]) { dadosPivot[tipo].categorias[cat] = {}; for (let i = 1; i <= 12; i++) dadosPivot[tipo].categorias[cat][String(i).padStart(2, '0')] = 0; }
      
      dadosPivot[tipo].categorias[cat][mesStr] += valorAbsoluto; dadosPivot[tipo].totalTipo[mesStr] += valorAbsoluto;
      if (valorReal > 0) totaisGerais.rec[mesStr] += valorAbsoluto; else totaisGerais.desp[mesStr] += valorAbsoluto;
    });

    if (!temDados) {
         boxPivot.innerHTML = '<p class="text-center text-suave w-full py-5">Nenhum dado para a matriz neste ano.</p>';
         return;
    }
    
    const mesesAbrev = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    let theadHtml = '<tr><th class="col-fixa">Categoria</th>'; 
    // Classes col-mes adicionadas nas colunas que sumirão no mobile
    mesesAbrev.forEach(m => { theadHtml += `<th class="col-mes text-right">${m}</th>`; });
    theadHtml += '<th class="text-right">Total</th><th class="text-right" title="Média Anual">M. Ano</th><th class="text-right" title="Média Ocorrência">M. Ocor.</th></tr>';
    
    let tbodyHtml = '';
    const tiposOrdenados = Object.keys(dadosPivot).sort((a, b) => { if (a.toLowerCase().includes('receita') || a.toLowerCase().includes('retorno')) return -1; if (b.toLowerCase().includes('receita') || b.toLowerCase().includes('retorno')) return 1; return a.localeCompare(b); });
    
    const formatarMoeda = (v) => v === 0 ? '<span style="color:var(--borda); font-weight:normal;">-</span>' : v.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    const classeCor = (v, isReceita) => { if (v === 0) return ''; return isReceita ? 'text-sucesso font-bold' : 'text-perigo font-bold'; };
    
    tiposOrdenados.forEach(tipo => {
      const objTipo = dadosPivot[tipo]; const isReceita = tipo.toLowerCase().includes('receita') || tipo.toLowerCase().includes('retorno');
      const cats = Object.keys(objTipo.categorias).sort((a, b) => a.localeCompare(b));
      cats.forEach(cat => {
          let htmlLinha = `<tr><th class="col-fixa"><div class="flex items-center gap-1"><span class="material-icons text-suave" style="font-size:1rem;">${getCatIcon(cat)}</span><span>${cat}</span></div></th>`;
          let somaCat = 0; let mesesAtivos = 0; 
          for(let i=1; i<=12; i++) { const m = String(i).padStart(2, '0'); const v = objTipo.categorias[cat][m]; if (v > 0) mesesAtivos++; somaCat += v; htmlLinha += `<td class="col-mes text-right ${classeCor(v, isReceita)}">${formatarMoeda(v)}</td>`; }
          const mediaUso = mesesAtivos > 0 ? somaCat / mesesAtivos : 0;
          // Classes unificadas e style de borda removido!
          htmlLinha += `<td class="text-right ${classeCor(somaCat, isReceita)}">${formatarMoeda(somaCat)}</td><td class="text-right ${classeCor(somaCat/12, isReceita)}">${formatarMoeda(somaCat/12)}</td><td class="text-right italic ${classeCor(mediaUso, isReceita)}">${formatarMoeda(mediaUso)}</td></tr>`;
          tbodyHtml += htmlLinha;
      });
      let htmlSubtotal = `<tr class="row-total-sub"><th class="col-fixa">Subtotal ${tipo}</th>`;
      let somaTipo = 0; let mesesAtivosTipo = 0;
      for(let i=1; i<=12; i++) { const m = String(i).padStart(2, '0'); const v = objTipo.totalTipo[m]; if (v > 0) mesesAtivosTipo++; somaTipo += v; htmlSubtotal += `<td class="col-mes text-right ${classeCor(v, isReceita)}">${formatarMoeda(v)}</td>`; }
      const mediaUsoTipo = mesesAtivosTipo > 0 ? somaTipo / mesesAtivosTipo : 0;
      // Classes unificadas e style de borda removido!
      htmlSubtotal += `<td class="text-right ${classeCor(somaTipo, isReceita)}">${formatarMoeda(somaTipo)}</td><td class="text-right ${classeCor(somaTipo/12, isReceita)}">${formatarMoeda(somaTipo/12)}</td><td class="text-right italic ${classeCor(mediaUsoTipo, isReceita)}">${formatarMoeda(mediaUsoTipo)}</td></tr>`;
      tbodyHtml += htmlSubtotal;
    });
    
    let htmlTotalRec = `<tr class="row-total-rec"><th class="col-fixa">Total Receitas</th>`; 
    let htmlTotalDesp = `<tr class="row-total-desp"><th class="col-fixa">Total Despesas</th>`; 
    let htmlBalanco = `<tr class="row-total-bal"><th class="col-fixa">Balanço Anual</th>`;
    
    let somaTotalRec = 0, somaTotalDesp = 0, somaTotalBal = 0; let mesesRec = 0, mesesDesp = 0, mesesBal = 0;
    for(let i=1; i<=12; i++) {
        const m = String(i).padStart(2, '0'); const r = totaisGerais.rec[m]; const d = totaisGerais.desp[m]; const b = r - d;
        if (r > 0) mesesRec++; if (d > 0) mesesDesp++; if (r > 0 || d > 0) mesesBal++; 
        somaTotalRec += r; somaTotalDesp += d; somaTotalBal += b;
        htmlTotalRec += `<th class="col-mes text-right">${formatarMoeda(r)}</th>`; 
        htmlTotalDesp += `<th class="col-mes text-right">${formatarMoeda(d)}</th>`; 
        htmlBalanco += `<th class="col-mes text-right">${b === 0 ? '<span style="color:rgba(255,255,255,0.4);">-</span>' : b.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</th>`;
    }
    
    const mUsoRec = mesesRec > 0 ? somaTotalRec / mesesRec : 0; const mUsoDesp = mesesDesp > 0 ? somaTotalDesp / mesesDesp : 0; const mUsoBal = mesesBal > 0 ? somaTotalBal / mesesBal : 0;
    
    // Bordas removidas dos totais também!
    htmlTotalRec += `<th class="text-right">${formatarMoeda(somaTotalRec)}</th><th class="text-right">${formatarMoeda(somaTotalRec/12)}</th><th class="text-right italic">${formatarMoeda(mUsoRec)}</th></tr>`;
    htmlTotalDesp += `<th class="text-right">${formatarMoeda(somaTotalDesp)}</th><th class="text-right">${formatarMoeda(somaTotalDesp/12)}</th><th class="text-right italic">${formatarMoeda(mUsoDesp)}</th></tr>`;
    htmlBalanco += `<th class="text-right">${somaTotalBal.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</th><th class="text-right">${(somaTotalBal/12).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</th><th class="text-right italic">${mUsoBal.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</th></tr>`;
    
    boxPivot.innerHTML = `
      <table class="data-table pivot-table">
        <thead>${theadHtml}</thead>
        <tbody>${tbodyHtml}</tbody>
        <tfoot>${htmlTotalRec}${htmlTotalDesp}${htmlBalanco}</tfoot>
      </table>`;
  }

  function mudarVisaoDashboard(tipo) {
    visaoDashboard = tipo;
    const btnM = document.getElementById('btnVisaoMensal'); const btnA = document.getElementById('btnVisaoAnual');
    if(btnM) btnM.classList.toggle('active', tipo === 'mensal'); if(btnA) btnA.classList.toggle('active', tipo === 'anual');
    
    const toggleCredito = document.getElementById('toggleCreditoContainer');
    if (toggleCredito) {
      tipo === 'anual' ? toggleCredito.classList.add('hidden') : toggleCredito.classList.remove('hidden');
    }
    
    preencherSeletorDashboard();
  }

  function mudarVisaoCredito(modo) {
      modoVisaoCredito = modo;
      document.getElementById('btnCreditoFiltrado').classList.toggle('active', modo === 'filtrado');
      document.getElementById('btnCreditoAberta').classList.toggle('active', modo === 'aberta');
      atualizarDadosDashboard();
  }

  function mudarAgrupamentoDashboard(modo) {
    agrupamentoDashboard = modo; paginaLegendaAtual = 1; 
    const btnC = document.getElementById('btnAgrupaCategoria'); const btnT = document.getElementById('btnAgrupaTipo');
    if(btnC) btnC.classList.toggle('active', modo === 'categoria'); if(btnT) btnT.classList.toggle('active', modo === 'tipo');
    atualizarDadosDashboard();
  }

  function mudarFluxoGrafico(tipo) {
    fluxoGrafico = tipo; paginaLegendaAtual = 1;
    document.getElementById('btnFluxoGraficoDespesa').classList.toggle('active', tipo === 'DESPESA');
    document.getElementById('btnFluxoGraficoReceita').classList.toggle('active', tipo === 'RECEITA');
    document.getElementById('dashTituloGrafico').querySelector('.material-icons').className = `material-icons ${tipo === 'DESPESA' ? 'text-perigo' : 'text-sucesso'}`;
    atualizarDadosDashboard();
  }

  function mudarFluxoRanking(tipo) {
    fluxoRanking = tipo;
    document.getElementById('btnFluxoRankingDespesa').classList.toggle('active', tipo === 'DESPESA');
    document.getElementById('btnFluxoRankingReceita').classList.toggle('active', tipo === 'RECEITA');
    document.getElementById('dashTituloRanking').querySelector('.material-icons').className = `material-icons ${tipo === 'DESPESA' ? 'text-aviso' : 'text-sucesso'}`;
    atualizarDadosDashboard();
  }

  function mudarPaginaLegenda(direcao) { paginaLegendaAtual += direcao; atualizarDadosDashboard(); }

  function toggleFullScreenPivot() {
    const card = document.getElementById('dashListaPivotAnual').closest('.card-painel');
    const icone = document.getElementById('iconeFullScreen');
    if (!card || !icone) return;
    
    if (card.classList.contains('pivot-fullscreen')) {
      card.classList.remove('pivot-fullscreen');
      icone.innerHTML = 'fullscreen';
      document.body.style.overflow = ''; 
    } else {
      card.classList.add('pivot-fullscreen');
      icone.innerHTML = 'fullscreen_exit';
      document.body.style.overflow = 'hidden'; 
    }
  }

  // ==========================================================================
  // 🌐 18. COMUNICADOR HEADLESS E AUTENTICAÇÃO API (VERCEL ONLY)
  // ==========================================================================

  function verificarConexao() {
    const token = localStorage.getItem('finance_api_token');
    const url = localStorage.getItem('finance_api_url');
    
    const overlay = document.getElementById('loginOverlay');
    const appContainer = document.querySelector('.app-container');
    const boxSair = document.getElementById('boxDesconectarApp');

    if (url && token) {
        overlay.classList.add('hidden');
        appContainer.style.display = 'flex';
        if(boxSair) boxSair.classList.remove('hidden');
        if(document.getElementById('inpConfigApiUrl')) document.getElementById('inpConfigApiUrl').value = url;
        if(document.getElementById('inpConfigApiToken')) document.getElementById('inpConfigApiToken').value = token;
        carregarParametrosIniciais();
    } else {
        appContainer.style.display = 'none';
        overlay.classList.remove('hidden');
    }
  }

  function conectarApp() {
    const token = document.getElementById('inpApiToken').value.trim();
    const url = document.getElementById('inpApiUrl').value.trim();
    const btn = document.getElementById('btnLoginSystem');
    
    if (!token || !url) {
      mostrarNotificacao("Preencha a URL e o Token da sua planilha.", "aviso");
      return;
    }
    
    if (btn) { btn.disabled = true; btn.innerHTML = "Autenticando..."; }

    localStorage.setItem('finance_api_url', url);
    localStorage.setItem('finance_api_token', token);
    
    chamarBackend('obterDadosFormularioConfig')
      .then(dados => {
         if (btn) { btn.disabled = false; btn.innerHTML = `<span class="material-icons">login</span> Desbloquear Sistema`; }
         mostrarNotificacao("Conexão autorizada! Carregando dados...", "sucesso");
         
         try {
             document.getElementById('loginOverlay').classList.add('hidden');
             document.querySelector('.app-container').style.display = 'flex';
             
             const boxSair = document.getElementById('boxDesconectarApp');
             if(boxSair) boxSair.classList.remove('hidden');
             
             if(document.getElementById('inpConfigApiUrl')) document.getElementById('inpConfigApiUrl').value = url;
             if(document.getElementById('inpConfigApiToken')) document.getElementById('inpConfigApiToken').value = token;
             
             navigateToSection('dashboard');
             
             // OTIMIZAÇÃO: Usa os dados recebidos do teste de login para pular uma requisição!
             configContas = dados.contas || [];
             configCategorias = dados.categorias || [];
             configModelos = dados.modelos || []; 
             renderizarSeletoresFormulario();
             carregarLancamentosDoSheets();
             
         } catch (e) { console.error(e); }
      })
      .catch(err => {
         if (btn) { btn.disabled = false; btn.innerHTML = `<span class="material-icons">login</span> Desbloquear Sistema`; }
         localStorage.removeItem('finance_api_token');
         localStorage.removeItem('finance_api_url');
         mostrarNotificacao("Acesso Negado: Credenciais inválidas.", "erro");
      });
  }

  function salvarConfiguracoesConexao() {
    const url = document.getElementById('inpConfigApiUrl').value.trim();
    const token = document.getElementById('inpConfigApiToken').value.trim();
    const btn = document.getElementById('btnSalvarCredenciais');

    if (!token || !url) {
        mostrarNotificacao("Preencha a URL e o Token.", "aviso");
        return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = "Verificando..."; }

    const oldUrl = localStorage.getItem('finance_api_url');
    const oldToken = localStorage.getItem('finance_api_token');

    localStorage.setItem('finance_api_url', url);
    localStorage.setItem('finance_api_token', token);

    chamarBackend('obterDadosFormularioConfig')
      .then(dados => {
         if (btn) { btn.disabled = false; btn.innerHTML = `<span class="material-icons text-base">security</span> <span class="texto-oculto-celular">Validar Credenciais</span>`; }
         mostrarNotificacao("Credenciais validadas e atualizadas!", "sucesso");
         
         configContas = dados.contas || [];
         configCategorias = dados.categorias || [];
         configModelos = dados.modelos || []; 
         renderizarSeletoresFormulario();
         carregarLancamentosDoSheets(); // Recarrega os dados sem piscar a tela
      })
      .catch(err => {
         if (btn) { btn.disabled = false; btn.innerHTML = `<span class="material-icons text-base">security</span> <span class="texto-oculto-celular">Validar Credenciais</span>`; }
         if (oldToken) localStorage.setItem('finance_api_token', oldToken);
         if (oldUrl) localStorage.setItem('finance_api_url', oldUrl);
         
         if(document.getElementById('inpConfigApiUrl')) document.getElementById('inpConfigApiUrl').value = oldUrl || '';
         if(document.getElementById('inpConfigApiToken')) document.getElementById('inpConfigApiToken').value = oldToken || '';
         
         mostrarNotificacao("Token ou URL incorretos. Alteração revertida.", "erro");
      });
  }

  function desconectarApp() {
    // 1. Apaga as credenciais de acesso
    localStorage.removeItem('finance_api_url');
    localStorage.removeItem('finance_api_token');
    
    // 2. APAGA O CACHE DE DADOS DO CELULAR
    limparCacheDados();
    
    // 3. Esconde a interface do App e revela a tela de Login
    document.querySelector('.app-container').style.display = 'none';
    document.getElementById('loginOverlay').classList.remove('hidden');
    
    const boxSair = document.getElementById('boxDesconectarApp');
    if (boxSair) boxSair.classList.add('hidden');
    
    if (document.getElementById('inpApiToken')) document.getElementById('inpApiToken').value = '';
    if (document.getElementById('inpConfigApiToken')) document.getElementById('inpConfigApiToken').value = '';
    
    // 4. Limpa a memória RAM para evitar vazamentos
    allLancamentos = []; dadosFiltrados = []; dadosFuturos = [];
    configContas = []; configCategorias = []; configModelos = [];
  }

  function chamarBackend(acao, dados = {}) {
    return new Promise((resolve, reject) => {
        const urlSegura = localStorage.getItem('finance_api_url');
        const tokenSeguro = localStorage.getItem('finance_api_token');
        
        if (!urlSegura || !tokenSeguro) {
            reject(new Error("Aplicativo não autenticado."));
            return;
        }

        fetch(urlSegura, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ token: tokenSeguro, acao: acao, dados: dados })
        })
        .then(res => res.json())
        .then(json => {
          if (json.error) {
              if(json.error.includes("Token") || json.error.includes("Acesso Negado")) desconectarApp(); // Kick inteligente
              reject(new Error(json.error));
          }
          else resolve(json.data); 
        })
        .catch(err => {
          console.error("Erro na API:", err);
          reject(new Error("Falha na comunicação. Verifique a URL do Google Apps Script."));
        });
    });
  }