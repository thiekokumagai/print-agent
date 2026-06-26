require('dotenv').config();
const { io } = require('socket.io-client');
const ThermalPrinter = require("node-thermal-printer").printer;
const PrinterTypes = require("node-thermal-printer").types;
const { execSync } = require('child_process');

// Configurações do .env
const API_URL = process.env.API_URL || 'http://localhost:3000'; // Ajuste para a URL da sua API
const STORE_ID = process.env.STORE_ID || '1';
let PRINTER_INTERFACE = process.env.PRINTER_INTERFACE || 'auto';

// Função para auto-detectar impressora no Windows
function autoDetectPrinter() {
  try {
    console.log(`🔎 Buscando impressoras instaladas no Windows...`);
    const output = execSync('powershell "Get-Printer | Select-Object -ExpandProperty Name"', { encoding: 'utf-8' });
    const printers = output.split('\n').map(p => p.trim()).filter(p => p.length > 0);
    
    // Palavras-chave comuns em impressoras térmicas
    const keywords = ['POS', 'Receipt', 'Bematech', 'Epson', 'Daruma', 'Elgin', 'Thermal', 'Generic', 'Generic / Text Only'];
    
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
      console.log(`💡 Impressora térmica detectada automaticamente: ${foundPrinter}`);
      return `printer:${foundPrinter}`;
    } else {
      console.log(`⚠️ Nenhuma impressora térmica padrão encontrada. Impressoras disponíveis:`);
      printers.forEach(p => console.log(`   - ${p}`));
      // Usa a primeira disponível como fallback se quiser, ou deixa sem imprimir
      if (printers.length > 0) {
        console.log(`⚠️ Usando a primeira impressora encontrada como fallback: ${printers[0]}`);
        return `printer:${printers[0]}`;
      }
      return 'printer:Nenhuma_Impressora_Instalada';
    }
  } catch (err) {
    console.log(`❌ Erro ao auto-detectar impressora: ${err.message}`);
    return 'printer:Generic / Text Only';
  }
}

// Se não preencheu no .env ou deixou o texto de exemplo, tentamos auto-detectar
if (PRINTER_INTERFACE === 'auto' || PRINTER_INTERFACE.includes('NomeDaSuaImpressora')) {
  PRINTER_INTERFACE = autoDetectPrinter();
}

console.log(`\n===========================================`);
console.log(`      🚀 INICIANDO PRINT AGENT`);
console.log(`===========================================`);
console.log(`🔌 API: ${API_URL}`);
console.log(`🏢 Loja/Vape Shop ID: ${STORE_ID}`);
console.log(`🖨️  Impressora: ${PRINTER_INTERFACE}`);
console.log(`===========================================\n`);

// Conecta ao WebSocket do backend
const socket = io(API_URL, {
  query: { store_id: STORE_ID },
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log(`✅ Print Agent Conectado ao Servidor! (Socket ID: ${socket.id})`);
  console.log('⏳ Aguardando novos pedidos para imprimir...\n');
});

socket.on('disconnect', () => {
  console.log('⚠️ Desconectado do Servidor. Tentando reconectar...');
});

socket.on('connect_error', (err) => {
  console.error(`❌ Erro de conexão com WebSocket: ${err.message}`);
});

// Escuta o evento de novo pedido
socket.on('novo_pedido_imprimir', async (pedido) => {
  console.log('\n🔔 ===========================================');
  console.log(`🔔 Novo pedido recebido para impressão: #${pedido.id || 'N/A'}`);
  console.log('🔔 ===========================================\n');
  
  try {
    // Configura a impressora
    let printer = new ThermalPrinter({
      type: PrinterTypes.EPSON, // Se for Bematech/Daruma/Epson (Pode ser STAR também)
      interface: PRINTER_INTERFACE,
      characterSet: 'PC852_LATIN2',
      removeSpecialCharacters: false,
      lineCharacter: "="
    });

    // --- MONTAGEM DO CUPOM ---
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
    
    // Lista os itens
    if (pedido.itens && Array.isArray(pedido.itens)) {
      pedido.itens.forEach(item => {
        let qtd = String(item.quantidade).padEnd(3, ' ');
        let nome = String(item.nome).substring(0, 20).padEnd(20, ' ');
        let preco = `R$ ${Number(item.preco).toFixed(2)}`.padStart(12, ' ');
        printer.println(`${qtd}x ${nome} ${preco}`);
      });
    } else {
        // Mock de teste caso venha vazio
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
    
    printer.cut(); // Corta o papel
    
    // Executa a impressão física
    console.log('⏳ Enviando comando para a impressora...');
    await printer.execute();
    console.log(`✅ Pedido impresso com sucesso na impressora: ${PRINTER_INTERFACE}`);
    
    // Avisa a API que o pedido foi impresso com sucesso!
    if (pedido.id) {
      socket.emit('marcar_como_impresso', pedido.id);
      console.log(`📡 Confirmação enviada para a API (Pedido #${pedido.id})`);
    }

  } catch (error) {
    console.error(`❌ Erro ao tentar imprimir:`, error.message);
    console.log(`💡 Dica: Verifique se o nome da impressora no Windows bate exatamente com o do arquivo .env`);
  }
});

// Adicionando um teste de impressão manual ao iniciar (opcional)
// Para testar, basta descomentar as linhas abaixo
/*
setTimeout(() => {
  socket.emit('novo_pedido_imprimir', { id: 9999, cliente_nome: "Teste de Impressão" });
}, 3000);
*/
