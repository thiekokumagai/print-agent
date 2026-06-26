const { app, Tray, Menu, nativeImage, dialog } = require('electron');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { io } = require('socket.io-client');
const ThermalPrinter = require("node-thermal-printer").printer;
const PrinterTypes = require("node-thermal-printer").types;
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
    { label: 'Print Agent - Vape Shop', enabled: false },
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
  tray.setToolTip(`Print Agent - ${statusText}`);
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
      let printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: PRINTER_INTERFACE,
        characterSet: 'PC852_LATIN2',
        removeSpecialCharacters: false,
        lineCharacter: "="
      });

      printer.alignCenter();
      printer.println("==========================================");
      printer.bold(true);
      printer.println("               VAPE SHOP                  ");
      printer.bold(false);
      printer.println("==========================================");
      printer.alignLeft();
      printer.println(`Pedido: #${pedido.id || Math.floor(Math.random() * 1000)}`);
      printer.println(`Data: ${new Date().toLocaleString('pt-BR')}`);
      printer.println(`Cliente: ${pedido.cliente_nome || 'Nao informado'}`);
      if (pedido.telefone) printer.println(`Telefone: ${pedido.telefone}`);
      
      printer.drawLine();
      printer.bold(true);
      printer.println("ITENS DO PEDIDO:");
      printer.bold(false);
      
      if (pedido.itens && Array.isArray(pedido.itens)) {
        pedido.itens.forEach(item => {
          let qtd = String(item.quantidade).padEnd(3, ' ');
          let nome = String(item.nome).substring(0, 20).padEnd(20, ' ');
          let preco = `R$ ${Number(item.preco).toFixed(2)}`.padStart(12, ' ');
          printer.println(`${qtd}x ${nome} ${preco}`);
        });
      } else {
          printer.println("1x  Ignite V15                  R$ 75.00");
          printer.println("2x  Juice Nasty 60ml            R$ 90.00");
      }

      printer.drawLine();
      printer.alignRight();
      printer.bold(true);
      printer.println(`TOTAL: R$ ${Number(pedido.total || 57).toFixed(2)}`);
      printer.bold(false);
      printer.alignCenter();
      printer.drawLine();
      printer.println("OBRIGADO PELA PREFERENCIA!");
      printer.println("==========================================");
      
      printer.cut();
      
      await printer.execute();
      
      if (pedido.id) {
        socket.emit('marcar_como_impresso', pedido.id);
      }

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
