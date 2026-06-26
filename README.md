# Guia do Print Agent 🖨️

Acabamos de criar a estrutura base do **Print Agent** na pasta `c:\sites\podemais\print-agent`. Ele é um serviço Node.js independente que ficará responsável apenas por ouvir os pedidos e mandar para a impressora.

## 1. Como testar o Agent localmente

1. Abra um terminal e vá para a pasta do agente:
   ```bash
   cd c:\sites\podemais\print-agent
   ```
2. Abra o arquivo `.env` gerado e configure o `PRINTER_INTERFACE` para o nome exato da sua impressora no Windows.
3. Inicie o agente:
   ```bash
   node index.js
   ```
Você verá logs dizendo que ele está aguardando conexão.

---

## 2. O que falta fazer no seu Backend (NestJS)?

Atualmente, sua API precisa avisar o agente quando um novo pedido chega. Para isso, vamos precisar instalar o WebSockets no NestJS:

1. **Instalar pacotes no NestJS** (na pasta `ecommerce-api`):
   ```bash
   npm install @nestjs/websockets @nestjs/platform-socket.io
   ```

2. **Criar um Gateway (WebSocket)**:
   Criar um arquivo `print.gateway.ts` na sua API:
   ```typescript
   import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
   import { Server, Socket } from 'socket.io';

   @WebSocketGateway({ cors: true })
   export class PrintGateway implements OnGatewayConnection {
     @WebSocketServer()
     server: Server;

     handleConnection(client: Socket) {
       // O Agent passa o ID do restaurante ao conectar
       const restaurantId = client.handshake.query.restaurant_id;
       if (restaurantId) {
         client.join(`restaurante_${restaurantId}`);
         console.log(`Print Agent conectado para a loja ${restaurantId}`);
       }
     }

     // Função para ser chamada quando um novo pedido é pago
     enviarPedidoParaImpressao(restaurantId: string, pedido: any) {
       this.server.to(`restaurante_${restaurantId}`).emit('novo_pedido_imprimir', pedido);
     }
   }
   ```

3. **Injetar o Gateway no Service de Pedidos**:
   No momento em que o pedido muda de status para "Confirmado" (ou logo após a criação), você chama:
   ```typescript
   this.printGateway.enviarPedidoParaImpressao(pedido.restaurantId, pedido);
   ```

## 3. Próximos Passos
Se quiser, eu mesmo posso:
1. Implementar o `PrintGateway` na sua `ecommerce-api` (NestJS).
2. Colocar o evento de impressão diretamente na criação/atualização do pedido.
3. Gerar um executável `.exe` desse `print-agent` para você testar como se fosse o cliente final.

Qual parte quer que eu faça agora?
