const { app, Tray, Menu, nativeImage } = require('electron');
require('dotenv').config();
const { io } = require('socket.io-client');
const ThermalPrinter = require("node-thermal-printer").printer;
const PrinterTypes = require("node-thermal-printer").types;
const { execSync } = require('child_process');
const path = require('path');

let tray = null;
let statusText = 'Desconectado';
let currentPrinter = 'Buscando...';

// Esconde o ícone na dock do macOS (se for rodar no mac)
if (app.dock) app.dock.hide();

const API_URL = process.env.API_URL || 'http://localhost:3000';
const STORE_ID = process.env.STORE_ID || '1';
let PRINTER_INTERFACE = process.env.PRINTER_INTERFACE || 'auto';

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
    { label: 'Sair', click: () => {
      app.isQuiting = true;
      app.quit();
    }}
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip(`Print Agent - ${statusText}`);
}

function autoDetectPrinter() {
  try {
    const output = execSync('powershell "Get-Printer | Select-Object -ExpandProperty Name"', { encoding: 'utf-8' });
    const printers = output.split('\n').map(p => p.trim()).filter(p => p.length > 0);
    const keywords = ['POS', 'Receipt', 'Bematech', 'Epson', 'Daruma', 'Elgin', 'Thermal', 'Generic'];
    
    let foundPrinter = null;
    for (const p of printers) {
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
    } else if (printers.length > 0) {
      return `printer:${printers[0]}`;
    }
    return 'printer:Nenhuma';
  } catch (err) {
    return 'printer:Erro_Ao_Buscar';
  }
}

app.whenReady().then(() => {
  // Configura a Tray (Bandeja)
  // Criar um ícone em branco por padrão se não tivermos arquivo de ícone ainda
  // Criar um ícone simples em base64 (uma bolinha azul) para aparecer no relógio
  const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAHBJREFUWEft1sENgCAQRcGvEhu2ZVu2ZVqxAhMwkBDjI/LIPMzce1yZmffN+u9j985zS7v33vMsy5pX2E5ABzIQCwF0gA4khEJoAB0IGkIH6EBEEB1ABxJCIXRABiKCCqEDGUgIhdABOhA0hA5cB84v5dEDD7G0AAAAAElFTkSuQmCC';
  const icon = nativeImage.createFromDataURL(iconBase64);
  tray = new Tray(icon);
  
  if (PRINTER_INTERFACE === 'auto' || PRINTER_INTERFACE.includes('NomeDaSuaImpressora')) {
    PRINTER_INTERFACE = autoDetectPrinter();
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
    }
  });
});

// Impede que o app feche quando não tem janela (já que a gente roda na tray)
app.on('window-all-closed', e => e.preventDefault());
