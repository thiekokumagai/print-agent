const { app, Tray, Menu, nativeImage, dialog, BrowserWindow } = require('electron');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { io } = require('socket.io-client');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let tray = null;
let statusText = 'Desconectado';
let currentPrinter = 'Buscando...';
let availablePrinters = [];

// Esconde o ícone na dock do macOS (se for rodar no mac)
if (app.dock) app.dock.hide();

// Configurar para abrir junto com o Windows automaticamente
app.setLoginItemSettings({
  openAtLogin: true,
  path: app.getPath('exe')
});

const API_URL = process.env.API_URL || 'https://ecommerce-core-api-production-3cc7.up.railway.app';
const STORE_ID = process.env.STORE_ID || '1';

// Função para ler/salvar a impressora escolhida
function getConfigPath() {
  return path.join(app.getPath('userData'), 'print_agent_config.json');
}

function loadConfig() {
  try {
    const data = fs.readFileSync(getConfigPath(), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { printer: 'auto' };
  }
}

function saveConfig(config) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config));
  } catch (err) {
    console.error('Erro ao salvar config', err);
  }
}

let PRINTER_INTERFACE = loadConfig().printer;

// Atualiza o menu da bandeja (relógio)
function updateTray() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Impressora - Pod e Mais', enabled: false },
    { type: 'separator' },
    { label: `Status: ${statusText}`, enabled: false },
    { label: `Loja ID: ${STORE_ID}`, enabled: false },
    { label: `Imp: ${currentPrinter}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Selecionar Impressora',
      submenu: availablePrinters.map(printerName => ({
        label: printerName,
        type: 'radio',
        checked: currentPrinter === printerName,
        click: () => {
          PRINTER_INTERFACE = `printer:${printerName}`;
          currentPrinter = printerName;
          saveConfig({ printer: PRINTER_INTERFACE });
          updateTray();
        }
      }))
    },
    { type: 'separator' },
    { label: 'Sair', click: () => {
      app.isQuiting = true;
      app.quit();
    }}
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip(`Pod e Mais - ${statusText}`);
}

function loadAvailablePrinters() {
  try {
    const output = execSync('powershell "Get-Printer | Select-Object -ExpandProperty Name"', { encoding: 'utf-8' });
    availablePrinters = output.split('\n').map(p => p.trim()).filter(p => p.length > 0);
  } catch (err) {
    availablePrinters = [];
  }
}

function autoDetectPrinter() {
  if (availablePrinters.length === 0) loadAvailablePrinters();
  
  const keywords = ['POS', 'Receipt', 'Bematech', 'Epson', 'Daruma', 'Elgin', 'Thermal', 'Generic'];
  let foundPrinter = null;
  
  for (const p of availablePrinters) {
    for (const kw of keywords) {
      if (p.toLowerCase().includes(kw.toLowerCase())) {
        foundPrinter = p;
        break;
      }
    }
    if (foundPrinter) break;
  }
  
  if (foundPrinter) {
    return `printer:${foundPrinter}`;
  } else if (availablePrinters.length > 0) {
    return `printer:${availablePrinters[0]}`;
  }
  return 'printer:Nenhuma';
}

app.whenReady().then(() => {
  // Configura a Tray (Bandeja)
  // Criar um ícone a partir do arquivo físico PNG
  const iconPath = path.join(__dirname, 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  
  loadAvailablePrinters();
  
  if (PRINTER_INTERFACE === 'auto' || PRINTER_INTERFACE.includes('NomeDaSuaImpressora')) {
    PRINTER_INTERFACE = autoDetectPrinter();
    saveConfig({ printer: PRINTER_INTERFACE });
  }
  
  currentPrinter = PRINTER_INTERFACE.replace('printer:', '');
  updateTray();

  // Conecta ao WebSocket do backend
  const socket = io(API_URL, {
    query: { store_id: STORE_ID },
    transports: ['websocket']
  });

  socket.on('connect', () => {
    statusText = '✅ Conectado';
    updateTray();
  });

  socket.on('disconnect', () => {
    statusText = '⚠️ Desconectado';
    updateTray();
  });

  socket.on('novo_pedido_imprimir', async (pedido) => {
    try {
      if (!currentPrinter || currentPrinter === 'Buscando...' || currentPrinter === 'Nenhuma') {
        throw new Error('Nenhuma impressora válida selecionada.');
      }

      // Montar o HTML do Cupom
      let itensHtml = '';
      const listaItens = pedido.items || pedido.orderItems || pedido.itens || [];
      
      if (listaItens && listaItens.length > 0) {
        listaItens.forEach(item => {
          let valorNumerico = Number(item.price || item.preco || item.unitPrice || 0);
          
          // Sempre formata com 2 casas decimais e vírgula
          let precoFormatado = valorNumerico.toFixed(2).replace('.', ',');
            
          let qtd = item.quantidade || item.quantity || 1;
          let nome = item.nome || item.productName || 'Produto Genérico';
          
          itensHtml += `
            <div class="item-row">
              <div class="item-name">${qtd}x ${nome}</div>
              <div class="item-price bold">${precoFormatado}</div>
            </div>
          `;
        });
      } else {
        itensHtml = `
          <div class="item-row"><div class="item-name">Nenhum item detectado</div><div class="item-price bold">0</div></div>
        `;
      }

      // Formatadores
      const formatarData = (dataIso) => {
        if (!dataIso) return new Date().toLocaleDateString('pt-BR');
        return new Date(dataIso).toLocaleDateString('pt-BR');
      };
      
      const numeroPedido = pedido.orderNumber || pedido.id || Math.floor(Math.random() * 1000);
      const dataPedido = formatarData(pedido.createdAt);
      const nomeCliente = pedido.customerName || pedido.cliente_nome || 'Nao informado';
      const telefoneCliente = pedido.customerPhone || pedido.telefone || '';
      
      // Endereço
      let enderecoHtml = '';
      const temEndereco = pedido.street || pedido.deliveryAddress || pedido.endereco;
      if (temEndereco) {
        let rua = pedido.street || pedido.deliveryAddress || pedido.endereco || '';
        let num = pedido.number || pedido.deliveryNumber || pedido.numero || '';
        let comp = pedido.complement || pedido.deliveryComplement || pedido.complemento || '';
        
        let enderecoFormatado = `${rua}, ${num}`;
        if (comp) {
          enderecoFormatado += ` - ${comp}`;
        }
        
        enderecoHtml = `<div class="info-block"><span class="bold">Entrega:</span> ${enderecoFormatado}</div>`;
      }

      // Pagamento e Parcelas
      let pagamentoHtml = '';
      const statusPagamento = pedido.paymentStatus === 'PAID' ? 'PAGO' : (pedido.paymentStatus || '');
      const metodoPagamento = pedido.paymentMethod || '';
      const parcelas = pedido.paymentInstallments || 1;
      
      const tradutorMetodos = {
        'CREDIT_CARD': 'Cartão de Crédito',
        'credit_card': 'Cartão de Crédito',
        'credit': 'Cartão de Crédito',
        'debit': 'Cartão de Débito',
        'DEBIT_CARD': 'Cartão de Débito',
        'PIX': 'Pix',
        'pix': 'Pix',
        'CASH': 'Dinheiro',
        'cash': 'Dinheiro',
        'money': 'Dinheiro'
      };
      
      if (statusPagamento === 'PAGO') {
        pagamentoHtml += `<div class="bold" style="font-size: 11px; margin-top: 3px;">PAGO</div>`;
      }
      
      if (metodoPagamento) {
        let chavePagamento = String(metodoPagamento).toLowerCase();
        let txtCartao = tradutorMetodos[metodoPagamento] || tradutorMetodos[chavePagamento] || metodoPagamento;
        if (parcelas > 1) txtCartao += ` em ${parcelas}x`;
        pagamentoHtml += `<div style="margin-top: 2px;">Forma de Pagamento: ${txtCartao}</div>`;
      }

      // Total
      const valorTotal = Number(pedido.totalOrder || pedido.total || 0).toFixed(2).replace('.', ',');
      let totalHtml = '';
      if (Number(pedido.totalOrder || pedido.total || 0) > 0) {
        totalHtml = `
          <div class="total-row" style="margin-top: 8px;">
            <div class="bold" style="font-size: 11px;">Valor Total</div>
            <div class="bold" style="font-size: 11px;">R$ ${valorTotal}</div>
          </div>
        `;
      }

      const receiptHtml = `
        <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            * { box-sizing: border-box; }
            @page { margin: 0; }
            body { 
              font-family: 'Inter', Arial, sans-serif; 
              font-size: 11px; 
              width: 240px;
              margin: 0; 
              padding: 5px 5px;
              color: black;
              line-height: 1.2;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .title { font-size: 13px; font-weight: bold; margin-bottom: 8px; }
            .info-block { margin-top: 8px; }
            .item-row { display: flex; justify-content: space-between; margin-top: 5px; align-items: flex-start; }
            .item-name { flex: 1; padding-right: 15px; }
            .item-price { white-space: nowrap; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .footer { margin-top: 10px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="center title">Pod & Mais</div>
          
          <div>
            <span class="bold">Pedido:</span> ${numeroPedido}<br>
            <span class="bold">Data:</span> ${dataPedido}<br>
            <span class="bold">Nome:</span> ${nomeCliente}<br>
            ${telefoneCliente}
          </div>

          ${itensHtml}
          ${enderecoHtml}
          ${totalHtml}
          ${pagamentoHtml}

          <div class="footer">Obrigado pela preferência!</div>
        </body>
        </html>
      `;

      // Criar janela oculta para imprimir
      let printWindow = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: true }
      });

      printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHtml)}`);

      printWindow.webContents.on('did-finish-load', () => {
        printWindow.webContents.print({
          silent: true,
          printBackground: true,
          deviceName: currentPrinter
        }, (success, failureReason) => {
          if (!success) {
            console.error('Falha ao imprimir:', failureReason);
      dialog.showErrorBox('Erro na Impressora', `Falha técnica ao imprimir o pedido: ${failureReason}`);
          } else {
            console.log('Impressão enviada com sucesso!');
            if (pedido.id) {
              socket.emit('marcar_como_impresso', pedido.id);
            }
          }
          // Fechar janela após imprimir
          printWindow.close();
        });
      });

    } catch (error) {
      console.error(`Erro ao tentar imprimir:`, error.message);
      dialog.showErrorBox(
        'Erro de Impressão',
        `Não foi possível imprimir o pedido #${pedido.id}.\n\nDetalhes do erro: ${error.message}\n\nVerifique se a impressora correta está selecionada no relógio e se ela está ligada.`
      );
    }
  });
});

// Impede que o app feche quando não tem janela (já que a gente roda na tray)
app.on('window-all-closed', e => e.preventDefault());
