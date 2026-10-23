// ==========================================================================
// CONSTANTES GLOBAIS DE CONFIGURAÇÃO E PLANILHA
// ==========================================================================
const SHEET_LANCAMENTOS = 'Lançamentos';
const SHEET_CONFIG      = 'Config';

const HEADERS_LANCAMENTOS = ["ID", "Data_Compra", "Data_Pag", "Descricao", "Observacoes", "Categoria", "Conta", "No_Credito", "Valor", "Pago"];
const HEADERS_CONTAS      = ["Conta_Cartao", "Tipo_Principal", "Dia_Fechamento", "Dia_Vencimento", "Limite_Total", "Cor_Hex"];
const HEADERS_CATEGORIAS  = ["Categoria_Base", "Tipo", "Icone_Material", "Descricao"];
const HEADERS_MODELOS     = ["Nome_Modelo", "Tipo_Fluxo", "Descricao", "Observacoes", "Valor_Padrao", "Categoria", "Conta", "No_Credito"];

const COLUNA_INICIAL_CATEGORIAS = 8;  // Coluna H
const COLUNA_INICIAL_MODELOS    = 13; // Coluna M
const CELULA_TOKEN_LABEL        = 'V1';
const CELULA_TOKEN_VALOR        = 'V2';

const COR_BG_CONTAS     = "#ebf5fb"; 
const COR_BG_CATEGORIAS = "#eaf2f8"; 
const COR_BG_MODELOS    = "#f5eef8";
const FORMATO_DATA      = "dd/mm/yyyy";
const FORMATO_MOEDA     = "R$ #,##0.00;[Red]-R$ #,##0.00"; 

// ==========================================================================
// SEGURANÇA E MOTOR DE RENDERIZAÇÃO (HEADLESS API)
// ==========================================================================

function obterTokenPlanilha() {
  const cache = CacheService.getScriptCache();
  const tokenEmCache = cache.get('financeData_token_v4');
  
  if (tokenEmCache) return tokenEmCache;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONFIG);
  if (!sheet) return "SENHA_NAO_CONFIGURADA";
  
  const token = sheet.getRange(CELULA_TOKEN_VALOR).getValue().toString().trim();
  const tokenFinal = token || "SENHA_NAO_CONFIGURADA";
  
  cache.put('financeData_token_v4', tokenFinal, 900); 
  return tokenFinal;
}

function doGet(e) {
  const resposta = {
    status: 403,
    error: "Acesso direto via navegador desativado. API Headless restrita para requisições POST autenticadas pelo PWA (Vercel)."
  };
  return ContentService.createTextOutput(JSON.stringify(resposta)).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================================================
// INICIALIZAÇÃO E GESTÃO DE BASE DE DADOS
// ==========================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ ID Finanças')
    .addItem('🚀 Inicializar / Reparar Planilha', 'inicializarBancoDeDados')
    .addToUi();
}

function inicializarBancoDeDados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. ABA LANÇAMENTOS
  let sheetLan = ss.getSheetByName(SHEET_LANCAMENTOS);
  if (!sheetLan) {
    sheetLan = ss.insertSheet(SHEET_LANCAMENTOS);
    sheetLan.appendRow(HEADERS_LANCAMENTOS);
  } else {
    sheetLan.getRange(1, 1, 1, HEADERS_LANCAMENTOS.length).setValues([HEADERS_LANCAMENTOS]);
  }
  
  sheetLan.setFrozenRows(1);
  sheetLan.getRange(1, 1, 1, HEADERS_LANCAMENTOS.length)
    .setBackground("#2c3e50")
    .setFontColor("#ffffff")
    .setFontWeight("bold");

  sheetLan.getRange("B2:C").setNumberFormat(FORMATO_DATA);
  sheetLan.getRange("I2:I").setNumberFormat(FORMATO_MOEDA);
  sheetLan.getRange("H2:H").insertCheckboxes();
  sheetLan.getRange("J2:J").insertCheckboxes(); 
  
  // 2. ABA CONFIG
  let sheetConfig = ss.getSheetByName(SHEET_CONFIG);
  if (!sheetConfig) {
    sheetConfig = ss.insertSheet(SHEET_CONFIG);
  }
  
  sheetConfig.setFrozenRows(1);
  sheetConfig.getRange(1, 1, 1, HEADERS_CONTAS.length).setValues([HEADERS_CONTAS]).setBackground(COR_BG_CONTAS).setFontWeight("bold");
  sheetConfig.getRange(1, COLUNA_INICIAL_CATEGORIAS, 1, HEADERS_CATEGORIAS.length).setValues([HEADERS_CATEGORIAS]).setBackground(COR_BG_CATEGORIAS).setFontWeight("bold");
  sheetConfig.getRange(1, COLUNA_INICIAL_MODELOS, 1, HEADERS_MODELOS.length).setValues([HEADERS_MODELOS]).setBackground(COR_BG_MODELOS).setFontWeight("bold");
  
  // Rótulo do Token de Segurança
  sheetConfig.getRange(CELULA_TOKEN_LABEL).setValue("Token_API").setBackground("#f8d7da").setFontWeight("bold");
  
  // Define senha/token inicial (se ainda não existir)
  const rangeTokenValor = sheetConfig.getRange(CELULA_TOKEN_VALOR);
  if (!rangeTokenValor.getValue().toString().trim()) {
    rangeTokenValor.setValue("123456").setFontWeight("bold");
  }

  // 3. DADOS PADRÃO (SEED INICIAL SE ESTIVER EM BRANCO)
  // Contas padrão
  if (sheetConfig.getRange(2, 1).getValue() === "") {
    const contasPadrao = [
      ["Carteira", "Dinheiro", "", "", "", "#27ae60"],
      ["Conta Corrente Principal", "Conta Corrente;Crédito", 10, 17, 3000, "#3498db"],
      ["Cartão de Crédito Reserva", "Crédito", 5, 12, 1500, "#e74c3c"],
      ["Vale Refeição / Alimentação", "Benefício", "", "", "", "#e67e22"],
      ["Reserva de Emergência", "Investimentos", "", "", "", "#f39c12"]
    ];
    sheetConfig.getRange(2, 1, contasPadrao.length, HEADERS_CONTAS.length).setValues(contasPadrao);
  }

  // Categorias essenciais padrão com ícones Material Icons
  if (sheetConfig.getRange(2, COLUNA_INICIAL_CATEGORIAS).getValue() === "") {
    const categoriasPadrao = [
      // Despesas Essenciais
      ["Moradia", "Despesas Essenciais", "home", "Aluguel, condomínio, IPTU e seguros residenciais."],
      ["Contas Básicas", "Despesas Essenciais", "receipt_long", "Água, luz, internet, celular e gás."],
      ["Mercado", "Despesas Essenciais", "shopping_cart", "Compras de supermercado, feira, padaria e açougue."],
      ["Saúde", "Despesas Essenciais", "medical_services", "Plano de saúde, consultas, exames e farmácia."],
      ["Educação", "Despesas Essenciais", "school", "Mensalidades, cursos, livros e materiais escolares."],
      ["Casa", "Despesas Essenciais", "chair", "Manutenção, limpeza, móveis e utilidades do lar."],
      ["Dívidas", "Despesas Essenciais", "account_balance", "Parcelas de empréstimos, financiamentos e renegociações."],

      // Despesas Não Essenciais
      ["Comer Fora", "Despesas Não Essenciais", "restaurant", "Restaurantes, lanchonetes, delivery e barzinhos."],
      ["Transporte", "Despesas Não Essenciais", "directions_car", "Combustível, aplicativos (Uber/99) e manutenção."],
      ["Compras Pessoais", "Despesas Não Essenciais", "shopping_bag", "Roupas, calçados, perfumes e cuidados pessoais."],
      ["Lazer", "Despesas Não Essenciais", "attractions", "Cinema, passeios, viagens, shows e esportes."],
      ["Assinaturas", "Despesas Não Essenciais", "subscriptions", "Streaming de vídeo/música e softwares mensais."],
      ["Família", "Despesas Não Essenciais", "family_restroom", "Gastos diretos e necessidades da família e dependentes."],
      ["Multas e Juros", "Despesas Não Essenciais", "warning", "Juros por atraso, tarifas evitáveis e penalidades."],

      // Montante Investido
      ["Aportes", "Montante Investido", "trending_up", "Transferência para corretora ou aplicações financeiras."],
      ["Custos de Invest.", "Montante Investido", "receipt", "Taxas B3, emolumentos e IR retido na fonte."],

      // Receitas (inclui Estornos com regra especial para cartão de crédito)
      ["Salários", "Receitas", "payments", "Salário principal, adiantamentos e renda fixa do trabalho."],
      ["Renda Extra", "Receitas", "savings", "Trabalhos freelancers, vendas e bicos esporádicos."],
      ["Bônus e Benefícios", "Receitas", "card_giftcard", "13º salário, férias, PLR e vales empresariais."],
      ["Estornos", "Receitas", "currency_exchange", "Estornos de compras, devoluções e créditos em cartão/conta."],

      // Retorno Investimentos
      ["Proventos", "Retorno Investimentos", "pie_chart", "Dividendos, JCP, aluguéis de FIIs e rendimentos."],
      ["Resgates", "Retorno Investimentos", "account_balance_wallet", "Retirada de aplicações que retorna para a conta corrente."],

      // Transferências Pessoais
      ["Faturas", "Transferências Pessoais", "credit_score", "Pagamento de fatura do cartão de crédito."],
      ["Movimentações", "Transferências Pessoais", "sync_alt", "Transferências entre contas próprias e ajustes neutros."]
    ];
    sheetConfig.getRange(2, COLUNA_INICIAL_CATEGORIAS, categoriasPadrao.length, HEADERS_CATEGORIAS.length).setValues(categoriasPadrao);
  }

  // Modelos Rápidos padrão
  if (sheetConfig.getRange(2, COLUNA_INICIAL_MODELOS).getValue() === "") {
    const modelosPadrao = [
      ["Supermercado", "DESPESA", "Compras do mês", "Alimentos e limpeza", "", "Mercado", "Conta Corrente Principal", true],
      ["Almoço / Lanche", "DESPESA", "Almoço diário", "Refeição no trabalho", "", "Comer Fora", "Vale Refeição / Alimentação", false],
      ["Salário Mensal", "RECEITA", "Salário", "Entrada mensal", "", "Salários", "Conta Corrente Principal", false],
      ["Rendimentos / Proventos", "RECEITA", "Proventos recebidos", "Dividendos e JCP", "", "Proventos", "Conta Corrente Principal", false]
    ];
    sheetConfig.getRange(2, COLUNA_INICIAL_MODELOS, modelosPadrao.length, HEADERS_MODELOS.length).setValues(modelosPadrao);
  }
  
  // 4. LIMPEZA DE ABAS PADRÃO DO GOOGLE SHEETS
  const abasParaDeletar = ["Página1", "Sheet1", "Movimentações", "Configurações"];
  abasParaDeletar.forEach(nomeAba => {
    let aba = ss.getSheetByName(nomeAba);
    if (aba && ss.getSheets().length > 1) ss.deleteSheet(aba);
  });
  
  limparCacheConfiguracoes();
  return "Banco de dados e estrutura configurados com sucesso! Token inicial em V2: 123456";
}

function criarDataSegura(dataString) {
  if (!dataString) return "";
  const partes = dataString.split('-');
  if (partes.length === 3) {
    return new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]), 12, 0, 0);
  }
  return dataString;
}

// ==========================================================================
// CRUD: LANÇAMENTOS (ENVIANDO MATRIZES COMPRIMIDAS)
// ==========================================================================

function obterLancamentos() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LANCAMENTOS);
    if (!sheet) return { formato: "compacto", colunas: [], registros: [] };

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { formato: "compacto", colunas: ["id", "data_compra", "data_pag", "descricao", "observacoes", "categoria", "conta", "no_credito", "valor", "pago"], registros: [] };

    const matriz = sheet.getRange(2, 1, lastRow - 1, HEADERS_LANCAMENTOS.length).getValues();
    const registros = [];
    
    for (let i = 0; i < matriz.length; i++) {
      const linha = matriz[i];
      if (!linha[0]) continue; 
      
      registros.push([
        linha[0], // id
        linha[1] instanceof Date ? linha[1].toISOString() : linha[1], // data_compra
        linha[2] instanceof Date ? linha[2].toISOString() : linha[2], // data_pag
        linha[3], // descricao
        linha[4] || "", // observacoes
        linha[5], // categoria
        linha[6], // conta
        linha[7] === true || String(linha[7]).toUpperCase() === 'TRUE' || String(linha[7]).toUpperCase() === 'SIM', // no_credito
        parseFloat(linha[8]) || 0, // valor
        linha[9] === true || String(linha[9]).toUpperCase() === 'TRUE' || String(linha[9]).toUpperCase() === 'SIM' // pago
      ]);
    }
    
    return {
      formato: "compacto",
      colunas: ["id", "data_compra", "data_pag", "descricao", "observacoes", "categoria", "conta", "no_credito", "valor", "pago"],
      registros: registros.reverse()
    };
  } catch (e) {
    return { error: e.message };
  }
}

function adicionarLancamento(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LANCAMENTOS);
    if (!sheet) throw new Error("Aba Lançamentos não encontrada.");

    const idUnico = "LAN_" + new Date().getTime();
    let valorFinal = parseFloat(dados.valor);
    
    if (dados.tipo_fluxo === "DESPESA" && valorFinal > 0) valorFinal = -valorFinal;
    else if (dados.tipo_fluxo === "RECEITA" && valorFinal < 0) valorFinal = Math.abs(valorFinal);

    const novaLinha = [
      idUnico,
      criarDataSegura(dados.data_compra),
      criarDataSegura(dados.data_pag),    
      dados.descricao,
      dados.observacoes,
      dados.categoria, 
      dados.conta,     
      dados.no_credito, 
      valorFinal,
      dados.pago || false
    ];

    const colunaID = sheet.getRange("A1:A").getValues();
    let ultimaLinhaReal = 1;
    for (let i = colunaID.length - 1; i >= 0; i--) {
      if (colunaID[i][0] !== "") { ultimaLinhaReal = i + 1; break; }
    }

    sheet.getRange(ultimaLinhaReal + 1, 1, 1, novaLinha.length).setValues([novaLinha]);
    SpreadsheetApp.flush(); 
    return { success: true, id: idUnico };
  } catch (e) {
    return { error: e.message };
  }
}

function atualizarLancamento(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LANCAMENTOS);
    if (!sheet) throw new Error("Aba Lançamentos não encontrada.");

    let valorFinal = parseFloat(dados.valor);
    if (dados.tipo_fluxo === "DESPESA" && valorFinal > 0) valorFinal = -valorFinal;
    else if (dados.tipo_fluxo === "RECEITA" && valorFinal < 0) valorFinal = Math.abs(valorFinal);
    
    const dadosAtualizados = [
      dados.id,
      criarDataSegura(dados.data_compra),
      criarDataSegura(dados.data_pag),
      dados.descricao,
      dados.observacoes,
      dados.categoria,
      dados.conta,
      dados.no_credito,
      valorFinal,
      dados.pago !== undefined ? dados.pago : false
    ];
    
    const colunaID = sheet.getRange("A1:A" + sheet.getLastRow()).getValues();
    for (let i = 0; i < colunaID.length; i++) {
      if (colunaID[i][0] && colunaID[i][0].toString().trim() === dados.id.toString().trim()) {
        sheet.getRange(i + 1, 1, 1, dadosAtualizados.length).setValues([dadosAtualizados]);
        SpreadsheetApp.flush();
        return { success: true };
      }
    }
    throw new Error("Registro não encontrado para atualização.");
  } catch (e) {
    return { error: e.message };
  }
}

function excluirLancamento(id) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LANCAMENTOS);
    if (!sheet) throw new Error("Aba Lançamentos não encontrada.");

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === id.toString().trim()) {
        sheet.deleteRow(i + 1);
        SpreadsheetApp.flush();
        return { success: true };
      }
    }
    throw new Error("Registro não encontrado para exclusão.");
  } catch (e) {
    return { error: e.message };
  }
}

function adicionarTransferenciaServidor(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LANCAMENTOS);
    if (!sheet) throw new Error("Aba Lançamentos não encontrada.");

    const timestamp = new Date().getTime();
    const idOut = "TRF_" + timestamp + "_OUT";
    const idIn = "TRF_" + timestamp + "_IN";

    let valorOut = -Math.abs(parseFloat(dados.valor));
    let valorIn = Math.abs(parseFloat(dados.valor));

    const linhaOut = [idOut, criarDataSegura(dados.data_compra), criarDataSegura(dados.data_pag), dados.descricao, dados.observacoes, "Movimentações", dados.origem, false, valorOut, true];
    const linhaIn = [idIn, criarDataSegura(dados.data_compra), criarDataSegura(dados.data_pag), dados.descricao, dados.observacoes, "Movimentações", dados.destino, false, valorIn, true];

    const colunaID = sheet.getRange("A1:A").getValues();
    let ultimaLinhaReal = 1;
    for (let i = colunaID.length - 1; i >= 0; i--) {
      if (colunaID[i][0] !== "") { ultimaLinhaReal = i + 1; break; }
    }

    sheet.getRange(ultimaLinhaReal + 1, 1, 2, 10).setValues([linhaOut, linhaIn]);
    SpreadsheetApp.flush(); 
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ==========================================================================
// AÇÕES EM LOTE (IMPORTAÇÃO E OTIMIZAÇÃO EM RAM)
// ==========================================================================

function importarEmLoteServidor(linhasDados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LANCAMENTOS);
    if (!sheet) throw new Error("Aba Lançamentos não encontrada.");
    if (linhasDados.length === 0) return { success: true, contagem: 0 };

    const matrizParaGravar = [];
    linhasDados.forEach(function(linha) {
      const obterDataReal = function(strData) {
        if (!strData) return "";
        if (strData.includes("/")) {
          const p = strData.split("/");
          return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
        }
        return new Date(strData + "T00:00:00");
      };

      matrizParaGravar.push([
        linha.id, obterDataReal(linha.data_compra), obterDataReal(linha.data_pag),
        linha.descricao, linha.observacoes || "", linha.categoria, linha.conta,
        linha.no_credito, parseFloat(linha.valor) || 0, linha.pago || false
      ]);
    });

    const valoresColA = sheet.getRange("A:A").getValues();
    let ultimaLinhaReal = 1;
    for (let i = valoresColA.length - 1; i >= 0; i--) {
      if (valoresColA[i][0] !== "") { ultimaLinhaReal = i + 1; break; }
    }
    
    const proximaLinha = ultimaLinhaReal + 1;
    sheet.getRange(proximaLinha, 1, matrizParaGravar.length, 10).setValues(matrizParaGravar);
    sheet.getRange(proximaLinha, 2, matrizParaGravar.length, 2).setNumberFormat(FORMATO_DATA);
    sheet.getRange(proximaLinha, 9, matrizParaGravar.length, 1).setNumberFormat(FORMATO_MOEDA);

    return { success: true, contagem: matrizParaGravar.length };
  } catch (e) {
    return { error: e.message };
  }
}

function atualizarLoteServidor(dadosLote) {
  try {
    const ids = dadosLote.ids;
    const alteracoes = dadosLote.alteracoes;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LANCAMENTOS);
    
    const range = sheet.getDataRange();
    const data = range.getValues();
    const headers = data[0];
    
    const idxDesc = headers.indexOf('Descricao');
    const idxCat = headers.indexOf('Categoria');
    const idxConta = headers.indexOf('Conta');
    const idxCredito = headers.indexOf('No_Credito');
    const idxDataComp = headers.indexOf('Data_Compra');
    const idxDataPag = headers.indexOf('Data_Pag');
    const idxObs = headers.indexOf('Observacoes');
    const idxPago = headers.indexOf('Pago'); 
    
    let atualizados = 0;
    let houveAlteracao = false;
    
    for (let i = 1; i < data.length; i++) {
      if (ids.includes(data[i][0])) { 
        if (alteracoes.descricao) data[i][idxDesc] = alteracoes.descricao;
        if (alteracoes.categoria) data[i][idxCat] = alteracoes.categoria;
        if (alteracoes.conta) data[i][idxConta] = alteracoes.conta;
        if (alteracoes.observacoes) data[i][idxObs] = alteracoes.observacoes;
        if (alteracoes.no_credito !== null && alteracoes.no_credito !== undefined) data[i][idxCredito] = alteracoes.no_credito;
        if (alteracoes.data_compra) data[i][idxDataComp] = criarDataSegura(alteracoes.data_compra);
        if (alteracoes.data_pag) data[i][idxDataPag] = criarDataSegura(alteracoes.data_pag);
        if (alteracoes.pago !== null && alteracoes.pago !== undefined) data[i][idxPago] = alteracoes.pago;
        
        atualizados++;
        houveAlteracao = true;
      }
    }
    
    if (houveAlteracao) {
      range.setValues(data);
      SpreadsheetApp.flush();
    }
    
    return { success: true, contagem: atualizados };
  } catch (e) {
    return { error: e.message };
  }
}

function excluirLoteServidor(ids) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LANCAMENTOS);
    const data = sheet.getDataRange().getValues();
    
    let deletados = 0;
    for (let i = data.length - 1; i >= 1; i--) {
      if (ids.includes(data[i][0])) {
        sheet.deleteRow(i + 1);
        deletados++;
      }
    }
    return { success: true, contagem: deletados };
  } catch (e) {
    return { error: e.message };
  }
}

function limparTodosLancamentosBanco() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LANCAMENTOS);
    const maxLinhas = sheet.getMaxRows();
    if (maxLinhas > 1) sheet.getRange(2, 1, maxLinhas - 1, 10).clearContent();
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ==========================================================================
// CRUD: CONFIGURAÇÕES E PARÂMETROS (ENVIANDO MATRIZES COMPRIMIDAS)
// ==========================================================================

function limparCacheConfiguracoes() {
  CacheService.getScriptCache().remove('financeData_config_v4');
}

function obterConfiguracoesAtualizadas() {
  const cache = CacheService.getScriptCache();
  const cachedData = cache.get('financeData_config_v4');
  
  if (cachedData) return JSON.parse(cachedData);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = Math.max(sheet.getLastRow(), 2);
  
  const contas = [], categorias = [], modelos = [];
  
  const dadosContas = sheet.getRange(2, 1, lastRow, 6).getValues();
  for (let i = 0; i < dadosContas.length; i++) { 
    if (!dadosContas[i][0]) break; 
    contas.push([dadosContas[i][0], dadosContas[i][1], dadosContas[i][2], dadosContas[i][3], dadosContas[i][4], dadosContas[i][5]]); 
  }

  const dadosCats = sheet.getRange(2, COLUNA_INICIAL_CATEGORIAS, lastRow, 4).getValues();
  for (let i = 0; i < dadosCats.length; i++) { 
    if (!dadosCats[i][0]) break; 
    categorias.push([dadosCats[i][0], dadosCats[i][1], dadosCats[i][2] || 'local_offer', dadosCats[i][3] || '']); 
  }

  const dadosModelos = sheet.getRange(2, COLUNA_INICIAL_MODELOS, lastRow, 8).getValues();
  for (let i = 0; i < dadosModelos.length; i++) { 
    if (!dadosModelos[i][0]) break; 
    modelos.push([dadosModelos[i][0], dadosModelos[i][1], dadosModelos[i][2], dadosModelos[i][3], dadosModelos[i][4], dadosModelos[i][5], dadosModelos[i][6], dadosModelos[i][7]]); 
  }

  const resultadoFinal = { 
    formato: "compacto",
    contas: { colunas: ["nome", "tipo", "fechamento", "vencimento", "limite", "cor"], registros: contas },
    categorias: { colunas: ["nome", "tipo", "icone", "descricao"], registros: categorias },
    modelos: { colunas: ["nome", "tipo", "descricao", "observacoes", "valor", "categoria", "conta", "no_credito"], registros: modelos }
  };
  
  cache.put('financeData_config_v4', JSON.stringify(resultadoFinal), 21600); 

  return resultadoFinal;
}

function obterDadosFormularioConfig() {
   return obterConfiguracoesAtualizadas();
}

function salvarContaServidor(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_CONFIG);
    if (!sheet) throw new Error("Aba Config não encontrada.");

    const lastRow = Math.max(sheet.getLastRow(), 2);
    const valoresContas = sheet.getRange(1, 1, lastRow, 1).getValues();
    let linhaDestino = -1;

    const chaveProcura = dados.idAntigo || dados.nome;
    for (let i = 1; i < valoresContas.length; i++) {
      if (valoresContas[i][0] === chaveProcura) { linhaDestino = i + 1; break; }
    }

    if (linhaDestino === -1) {
      linhaDestino = 2;
      while (sheet.getRange(linhaDestino, 1).getValue() !== "") { linhaDestino++; }
    }

    const limiteNum = dados.limite ? parseFloat(dados.limite) : "";
    const arrayDados = [dados.nome, dados.tipo, dados.fechamento ? parseInt(dados.fechamento) : "", dados.vencimento ? parseInt(dados.vencimento) : "", limiteNum, dados.cor];

    sheet.getRange(linhaDestino, 1, 1, 6).setValues([arrayDados]);

    let qtdAtualizados = 0;
    if (dados.idAntigo && dados.idAntigo !== dados.nome) {
      const sheetLan = ss.getSheetByName(SHEET_LANCAMENTOS);
      if (sheetLan) {
        const rangeLan = sheetLan.getDataRange();
        const dataLan = rangeLan.getValues();
        const idxConta = dataLan[0].indexOf('Conta');
        let mudouAlgo = false;
        
        if (idxConta !== -1) {
          for (let i = 1; i < dataLan.length; i++) {
            if (dataLan[i][idxConta] === dados.idAntigo) {
              dataLan[i][idxConta] = dados.nome;
              qtdAtualizados++;
              mudouAlgo = true;
            }
          }
          if (mudouAlgo) {
            rangeLan.setValues(dataLan);
            SpreadsheetApp.flush();
          }
        }
      }
    }
    
    limparCacheConfiguracoes();
    return { success: true, atualizados: qtdAtualizados };
  } catch (e) { return { error: e.message }; }
}

function excluirContaServidor(nomeConta) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_CONFIG);
    const lastRow = sheet.getLastRow();
    
    const valores = sheet.getRange(1, 1, lastRow, 1).getValues();
    for (let i = 1; i < valores.length; i++) {
      if (valores[i][0] === nomeConta) {
        const linha = i + 1;
        if (linha === lastRow) sheet.getRange(linha, 1, 1, 6).clearContent();
        else {
          const numLinhas = lastRow - linha;
          const valoresAbaixo = sheet.getRange(linha + 1, 1, numLinhas, 6).getValues();
          sheet.getRange(linha, 1, numLinhas, 6).setValues(valoresAbaixo);
          sheet.getRange(lastRow, 1, 1, 6).clearContent();
        }
        limparCacheConfiguracoes();
        return { success: true };
      }
    }
    throw new Error("Conta não localizada.");
  } catch (e) { return { error: e.message }; }
}

function salvarCategoriaServidor(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_CONFIG);
    const cIni = COLUNA_INICIAL_CATEGORIAS; 
    const lastRow = Math.max(sheet.getLastRow(), 2);
    const valoresCategorias = sheet.getRange(1, cIni, lastRow, 1).getValues();
    
    let linhaDestino = -1;
    const chaveProcura = dados.idAntigo || dados.nome;
    for (let i = 1; i < valoresCategorias.length; i++) {
      if (valoresCategorias[i][0] === chaveProcura) { linhaDestino = i + 1; break; }
    }

    if (linhaDestino === -1) {
      linhaDestino = 2;
      while (sheet.getRange(linhaDestino, cIni).getValue() !== "") { linhaDestino++; }
    }

    const arrayDados = [dados.nome, dados.tipo, dados.icone || "local_offer", dados.descricao || ""];
    sheet.getRange(linhaDestino, cIni, 1, 4).setValues([arrayDados]);

    let qtdAtualizados = 0;
    if (dados.idAntigo && dados.idAntigo !== dados.nome) {
      const sheetLan = ss.getSheetByName(SHEET_LANCAMENTOS);
      if (sheetLan) {
        const rangeLan = sheetLan.getDataRange();
        const dataLan = rangeLan.getValues();
        const idxCat = dataLan[0].indexOf('Categoria');
        let mudouAlgo = false;
        
        if (idxCat !== -1) {
          for (let i = 1; i < dataLan.length; i++) {
            if (dataLan[i][idxCat] === dados.idAntigo) {
              dataLan[i][idxCat] = dados.nome;
              qtdAtualizados++;
              mudouAlgo = true;
            }
          }
          if (mudouAlgo) {
            rangeLan.setValues(dataLan);
            SpreadsheetApp.flush();
          }
        }
      }
    }
    
    limparCacheConfiguracoes();
    return { success: true, atualizados: qtdAtualizados };
  } catch (e) { return { error: e.message }; }
}

function excluirCategoriaServidor(nomeCategoria) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_CONFIG);
    const cIni = COLUNA_INICIAL_CATEGORIAS;
    const lastRow = sheet.getLastRow();
    
    const valores = sheet.getRange(1, cIni, lastRow, 1).getValues();
    for (let i = 1; i < valores.length; i++) {
      if (valores[i][0] === nomeCategoria) {
        const linha = i + 1;
        if (linha === lastRow) sheet.getRange(linha, cIni, 1, 4).clearContent();
        else {
          const numLinhas = lastRow - linha;
          const valoresAbaixo = sheet.getRange(linha + 1, cIni, numLinhas, 4).getValues();
          sheet.getRange(linha, cIni, numLinhas, 4).setValues(valoresAbaixo);
          sheet.getRange(lastRow, cIni, 1, 4).clearContent();
        }
        limparCacheConfiguracoes();
        return { success: true };
      }
    }
    throw new Error("Categoria não localizada.");
  } catch (e) { return { error: e.message }; }
}

function salvarModeloServidor(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_CONFIG);
    const lastRow = Math.max(sheet.getLastRow(), 2);
    const valores = sheet.getRange(1, COLUNA_INICIAL_MODELOS, lastRow, 1).getValues();
    
    let linhaDestino = -1;
    const chaveProcura = dados.idAntigo || dados.nome;
    for (let i = 1; i < valores.length; i++) {
      if (valores[i][0] === chaveProcura) { linhaDestino = i + 1; break; }
    }

    if (linhaDestino === -1) {
      linhaDestino = 2;
      while (sheet.getRange(linhaDestino, COLUNA_INICIAL_MODELOS).getValue() !== "") { linhaDestino++; }
    }

    if (linhaDestino === 2 && sheet.getRange(1, COLUNA_INICIAL_MODELOS).getValue() === "") {
       sheet.getRange(1, COLUNA_INICIAL_MODELOS, 1, HEADERS_MODELOS.length).setValues([HEADERS_MODELOS]).setBackground("#f5eef8").setFontWeight("bold");
    }

    const valorLimpo = dados.valor ? parseFloat(dados.valor) : "";
    const obsTratada = dados.observacoes ? dados.observacoes : "";
    const arrayDados = [dados.nome, dados.tipo, dados.descricao, obsTratada, valorLimpo, dados.categoria, dados.conta, dados.no_credito];
    
    sheet.getRange(linhaDestino, COLUNA_INICIAL_MODELOS, 1, 8).setValues([arrayDados]);
    limparCacheConfiguracoes();
    return { success: true };
  } catch (e) { return { error: e.message }; }
}

function excluirModeloServidor(nome) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_CONFIG);
    const lastRow = sheet.getLastRow();
    const valores = sheet.getRange(1, COLUNA_INICIAL_MODELOS, lastRow, 1).getValues();
    
    for (let i = 1; i < valores.length; i++) {
      if (valores[i][0] === nome) {
        const linha = i + 1;
        if (linha === lastRow) sheet.getRange(linha, COLUNA_INICIAL_MODELOS, 1, 8).clearContent();
        else {
          const numLinhas = lastRow - linha;
          const valoresAbaixo = sheet.getRange(linha + 1, COLUNA_INICIAL_MODELOS, numLinhas, 8).getValues();
          sheet.getRange(linha, COLUNA_INICIAL_MODELOS, numLinhas, 8).setValues(valoresAbaixo);
          sheet.getRange(lastRow, COLUNA_INICIAL_MODELOS, 1, 8).clearContent();
        }
        limparCacheConfiguracoes();
        return { success: true };
      }
    }
    throw new Error("Modelo não localizado.");
  } catch (e) { return { error: e.message }; }
}

// ==========================================================================
// 🚀 ENDPOINT DA API REST (PARA O PWA NA VERCEL)
// ==========================================================================

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({error: "Requisição vazia."})).setMimeType(ContentService.MimeType.JSON);
    }

    const requisicao = JSON.parse(e.postData.contents);
    const tokenReal = obterTokenPlanilha();

    if (requisicao.token !== tokenReal) {
      return ContentService.createTextOutput(JSON.stringify({error: "Acesso Negado: Token de segurança inválido ou não configurado na aba Config."})).setMimeType(ContentService.MimeType.JSON);
    }

    let resultado;

    switch (requisicao.acao) {
      case 'obterDadosFormularioConfig':
        resultado = obterDadosFormularioConfig();
        break;
      case 'obterLancamentos':
        resultado = obterLancamentos();
        break;
      case 'adicionarLancamento':
        resultado = adicionarLancamento(requisicao.dados);
        break;
      case 'atualizarLancamento':
        resultado = atualizarLancamento(requisicao.dados);
        break;
      case 'excluirLancamento':
        resultado = excluirLancamento(requisicao.dados);
        break;
      case 'adicionarTransferenciaServidor':
        resultado = adicionarTransferenciaServidor(requisicao.dados);
        break;
      case 'importarEmLoteServidor':
        resultado = importarEmLoteServidor(requisicao.dados);
        break;
      case 'atualizarLoteServidor':
        resultado = atualizarLoteServidor(requisicao.dados);
        break;
      case 'excluirLoteServidor':
        resultado = excluirLoteServidor(requisicao.dados);
        break;
      case 'limparTodosLancamentosBanco':
        resultado = limparTodosLancamentosBanco();
        break;
      case 'obterConfiguracoesAtualizadas':
        resultado = obterConfiguracoesAtualizadas();
        break;
      case 'salvarContaServidor':
        resultado = salvarContaServidor(requisicao.dados);
        break;
      case 'excluirContaServidor':
        resultado = excluirContaServidor(requisicao.dados);
        break;
      case 'salvarCategoriaServidor':
        resultado = salvarCategoriaServidor(requisicao.dados);
        break;
      case 'excluirCategoriaServidor':
        resultado = excluirCategoriaServidor(requisicao.dados);
        break;
      case 'salvarModeloServidor':
        resultado = salvarModeloServidor(requisicao.dados);
        break;
      case 'excluirModeloServidor':
        resultado = excluirModeloServidor(requisicao.dados);
        break;
      default:
        return ContentService.createTextOutput(JSON.stringify({error: "Ação desconhecida: " + requisicao.acao})).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({success: true, data: resultado})).setMimeType(ContentService.MimeType.JSON);

  } catch (erro) {
    return ContentService.createTextOutput(JSON.stringify({error: erro.message})).setMimeType(ContentService.MimeType.JSON);
  }
}