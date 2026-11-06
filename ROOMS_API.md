# Especificación de Salas, Sincronización de Nivel y Modo Espectador (Cozy Leap Online)

Este documento detalla exhaustivamente todos los endpoints REST y eventos WebSocket para la gestión de salas multijugador, sincronización simultánea de niveles en grupo y el sistema de espectadores.

---

## 1. Endpoints REST de Salas (`/api/v1/rooms`)

Base URL: `http://<host>:3000/api/v1/rooms`

---

### 1.1. Crear o Registrar una Sala
- **Método & Ruta:** `POST /api/v1/rooms/create`
- **Autenticación:** Opcional (permite generar códigos para partidas privadas o públicas).
- **Headers:** `Content-Type: application/json`

#### Request Body (JSON):
```json
{
  "levelId": 1,
  "customCode": "amigos_2026"
}
```
*Si se omite `customCode`, el servidor genera un ID único con formato `party_<timestamp>_<hash>`.*

#### Response `201 Created`:
```json
{
  "status": "success",
  "data": {
    "roomId": "party_amigos_2026",
    "levelId": 1,
    "wsEndpoint": "/socket.io",
    "joinInstruction": "Emit 'room:join' with { levelId: 1, roomId: 'party_amigos_2026' } over WebSocket"
  }
}
```

---

### 1.2. Obtener Salas Activas en Tiempo Real
- **Método & Ruta:** `GET /api/v1/rooms`
- **Autenticación:** Opcional.

#### Response `200 OK`:
```json
{
  "status": "success",
  "totalActiveRooms": 1,
  "rooms": [
    {
      "roomId": "party_amigos_2026",
      "levelId": 1,
      "playerCount": 3,
      "maxPlayers": 10,
      "finishedCount": 1,
      "allFinished": false,
      "spectatorCount": 1,
      "players": [
        {
          "userId": "usr_abc123",
          "id": "usr_abc123",
          "username": "carlos_pro",
          "displayName": "Carlos",
          "name": "Carlos",
          "playerName": "Carlos",
          "levelId": 1,
          "isFinished": true,
          "finishTimeSeconds": 14.85,
          "rank": 1,
          "isSpectating": true,
          "spectateTargetUserId": "usr_def456"
        },
        {
          "userId": "usr_def456",
          "id": "usr_def456",
          "username": "maria_gamer",
          "displayName": "María",
          "name": "María",
          "playerName": "María",
          "levelId": 1,
          "isFinished": false,
          "isSpectating": false
        }
      ]
    }
  ]
}
```

---

### 1.3. Obtener Estado de Mi Sala Actual
- **Método & Ruta:** `GET /api/v1/rooms/my-room`
- **Autenticación:** Requerida (`Authorization: Bearer <accessToken>`)

#### Response `200 OK`:
```json
{
  "status": "success",
  "data": {
    "roomId": "party_amigos_2026",
    "levelId": 1,
    "playerCount": 3,
    "maxPlayers": 10,
    "finishedCount": 1,
    "allFinished": false,
    "spectatorCount": 1,
    "players": [...]
  }
}
```

#### Response `404 Not Found` (si no está en ninguna sala):
```json
{
  "status": "error",
  "code": "NOT_IN_ROOM",
  "message": "You are not currently active in any multiplayer room"
}
```

---

### 1.4. Obtener Detalle de una Sala Específica
- **Método & Ruta:** `GET /api/v1/rooms/:roomId`

#### Response `200 OK`:
```json
{
  "status": "success",
  "data": {
    "roomId": "party_amigos_2026",
    "levelId": 1,
    "playerCount": 2,
    "maxPlayers": 10,
    "finishedCount": 0,
    "allFinished": false,
    "spectatorCount": 0,
    "players": [...]
  }
}
```

---

## 2. Eventos WebSocket en Tiempo Real (`ws://<host>:3000`)

Conexión inicial:
```javascript
import { io } from 'socket.io-client';

const socket = io('https://tu-dominio-api.com', {
  auth: { token: accessToken } // o query: { token: accessToken }
});
```

---

### 2.1. Unirse a una Sala (`room:join`)
Permite entrar a una sala específica o crearla al instante con tus amigos.
```javascript
// Cliente envía:
socket.emit('room:join', {
  levelId: 1,
  roomId: 'party_amigos_2026' // Opcional: si se omite, agrupa en 'party_level_1'
});
```

#### Servidor responde al cliente emisor: `room:state`
```json
{
  "levelId": 1,
  "roomId": "party_amigos_2026",
  "yourSpawn": { "x": 0.0, "y": 1.0, "z": 0.0 },
  "players": [
    {
      "userId": "usr_host_1",
      "id": "usr_host_1",
      "username": "carlos",
      "displayName": "Carlos",
      "name": "Carlos",
      "playerName": "Carlos",
      "tag": "Carlos",
      "label": "Carlos",
      "appearance": { ... },
      "x": 0.0,
      "y": 1.0,
      "z": 0.0,
      "yaw": 0,
      "anim": "idle",
      "position": { "x": 0.0, "y": 1.0, "z": 0.0, "yaw": 0 },
      "isFinished": false,
      "isSpectating": false,
      "levelId": 1
    }
  ],
  "self": {
    "userId": "usr_host_1",
    "id": "usr_host_1",
    "username": "carlos",
    "displayName": "Carlos",
    "name": "Carlos",
    "playerName": "Carlos",
    "tag": "Carlos",
    "label": "Carlos"
  }
}
```

#### Servidor emite a los demás jugadores de la sala: `player:joined`
```json
{
  "userId": "usr_amigo_2",
  "id": "usr_amigo_2",
  "username": "laura",
  "displayName": "Laura",
  "name": "Laura",
  "playerName": "Laura",
  "tag": "Laura",
  "label": "Laura",
  "appearance": { ... },
  "x": 2.5,
  "y": 1.0,
  "z": -1.5,
  "yaw": 0,
  "anim": "idle",
  "position": { "x": 2.5, "y": 1.0, "z": -1.5, "yaw": 0 },
  "levelId": 1
}
```

---

### 2.2. Sincronización de Movimiento (`player:sync` & `player:moved`)
```javascript
// Cliente envía cada ~50ms o al cambiar animación:
socket.emit('player:sync', {
  x: 12.4,
  y: 1.0,
  z: -8.1,
  yaw: 1.57,
  anim: 'run',
  action: 'jump'
});
```

El servidor retransmite `player:moved` a todos los compañeros en la misma sala con todos los alias de nombre intactos.

---

## 3. Modo Espectador (Cuando un Jugador Termina Antes)

> **Regla:** Si un jugador llega primero a la meta, entra automáticamente en **Modo Espectador** y puede ver a los compañeros que aún están jugando, hasta que todos completen el nivel.

### 3.1. Cliente notifica llegada a la meta (`room:player_finish`)
```javascript
// El jugador que cruzó la meta emite:
socket.emit('room:player_finish', {
  levelId: 1,
  timeSeconds: 14.85,
  relicsFound: 5
});
```

---

### 3.2. Servidor confirma al jugador que terminó: `spectate:started`
El servidor le informa que está en modo espectador y le asigna el primer compañero activo para fijar la cámara:
```json
{
  "isSpectating": true,
  "targetUserId": "usr_amigo_2",
  "rank": 1,
  "timeSeconds": 14.85,
  "activePlayers": [
    {
      "userId": "usr_amigo_2",
      "id": "usr_amigo_2",
      "username": "laura",
      "displayName": "Laura",
      "name": "Laura",
      "playerName": "Laura",
      "position": { "x": 8.5, "y": 1.0, "z": -4.2, "yaw": 0 }
    }
  ],
  "message": "¡Completaste el nivel en posición #1 (14.85s)! Entrando en modo espectador hasta que todos terminen."
}
```

---

### 3.3. Servidor avisa a toda la sala: `room:player_finished`
Todos los jugadores de la sala reciben este evento:
```json
{
  "userId": "usr_host_1",
  "id": "usr_host_1",
  "username": "carlos",
  "displayName": "Carlos",
  "name": "Carlos",
  "playerName": "Carlos",
  "timeSeconds": 14.85,
  "rank": 1,
  "isSpectating": true,
  "allFinished": false,
  "finishedCount": 1,
  "totalPlayers": 3,
  "remainingPlayers": [
    { "userId": "usr_amigo_2", "displayName": "Laura" },
    { "userId": "usr_amigo_3", "displayName": "Pedro" }
  ]
}
```

---

### 3.4. Cambiar de Jugador Especteado (`spectate:switch`)
El espectador puede presionar una tecla (ej. `E` o `Tab`) para cambiar de cámara entre los jugadores activos:
```javascript
// Cliente envía:
socket.emit('spectate:switch', {
  targetUserId: 'usr_amigo_3'
});

// Servidor responde confirmando:
socket.on('spectate:switched', (data) => {
  console.log('Ahora especteando a:', data.targetUserId);
});
```

---

### 3.5. Cuando TODOS los Jugadores Terminan el Nivel: `room:all_finished`
Cuando el último jugador activo cruza la meta, el servidor emite a **toda la sala** el resumen final:
```json
{
  "roomId": "party_amigos_2026",
  "levelId": 1,
  "summary": [
    {
      "rank": 1,
      "userId": "usr_host_1",
      "id": "usr_host_1",
      "username": "carlos",
      "displayName": "Carlos",
      "name": "Carlos",
      "playerName": "Carlos",
      "timeSeconds": 14.85
    },
    {
      "rank": 2,
      "userId": "usr_amigo_2",
      "id": "usr_amigo_2",
      "username": "laura",
      "displayName": "Laura",
      "name": "Laura",
      "playerName": "Laura",
      "timeSeconds": 18.20
    },
    {
      "rank": 3,
      "userId": "usr_amigo_3",
      "id": "usr_amigo_3",
      "username": "pedro",
      "displayName": "Pedro",
      "name": "Pedro",
      "playerName": "Pedro",
      "timeSeconds": 21.05
    }
  ],
  "canAdvance": true,
  "nextLevelId": 2,
  "message": "¡Todos los jugadores de la sala terminaron el Nivel 1! Pueden avanzar al siguiente."
}
```

---

## 4. Sincronización de Nivel en Grupo (Avanzar Juntos)

> **Regla:** Cuando en la sesión se avanza al siguiente nivel, **todos los jugadores de la sala cambian al nuevo nivel al mismo tiempo**, evitando que alguien quede rezagado.

### 4.1. Solicitar Cambio de Nivel
Cualquier jugador o el anfitrión puede emitir:

- **Avanzar al siguiente nivel automáticamente:**
```javascript
socket.emit('room:advance_level');
```

- **O cambiar a un nivel específico (del 1 al 10):**
```javascript
socket.emit('room:level_change', {
  levelId: 2
});
```

---

### 4.2. Evento Emitido por el Servidor a Toda la Sala: `room:level_changed`
**Todos los sockets de la sala reciben este evento simultáneamente:**
```json
{
  "roomId": "party_amigos_2026",
  "levelId": 2,
  "message": "El grupo avanzó al nivel 2",
  "players": [
    {
      "userId": "usr_host_1",
      "displayName": "Carlos",
      "levelId": 2,
      "x": 0.0,
      "y": 1.0,
      "z": 0.0,
      "anim": "idle",
      "isFinished": false,
      "isSpectating": false
    },
    {
      "userId": "usr_amigo_2",
      "displayName": "Laura",
      "levelId": 2,
      "x": 2.5,
      "y": 1.0,
      "z": -1.5,
      "anim": "idle",
      "isFinished": false,
      "isSpectating": false
    }
  ]
}
```
*Además, el servidor emite automáticamente `world:state` con los orbes y bloques correspondientes al nuevo nivel.*

---

## 5. Flujo de Invitaciones a la Misma Sala

1. **Anfitrión invita a amigo B (`invite:send`):**
   ```javascript
   socket.emit('invite:send', {
     toUserId: 'usr_amigo_2',
     levelId: 1,
     roomId: 'party_amigos_2026'
   });
   ```
2. **Amigo B acepta (`invite:respond`):**
   ```javascript
   socket.emit('invite:respond', {
     inviteId: 'inv_123',
     accept: true
   });
   ```
3. **Ambos reciben `invite:result`:**
   ```json
   {
     "inviteId": "inv_123",
     "accepted": true,
     "roomId": "party_amigos_2026",
     "levelId": 1
   }
   ```
4. **Anfitrión invita a amigo C:**  
   Amigo C recibe la invitación con el mismo `roomId: "party_amigos_2026"`. Al aceptar, se une a la misma sala donde ya están el anfitrión y el amigo B.
