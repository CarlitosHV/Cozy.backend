# Documentación Técnica de Backend: Cozy Leap Online

## 1. Stack Tecnológico Recomendado

| Componente | Tecnología | Justificación |
| :--- | :--- | :--- |
| **Runtime / Lenguaje** | **Node.js (LTS) + TypeScript** | Mismo ecosistema tipado que el cliente; permite compartir interfaces y tipos de Three.js / modelos. |
| **Framework HTTP** | **Fastify** o **Express** | Fastify ofrece mejor rendimiento en throughput y validación JSON con schemas integrados. |
| **Base de Datos No Relacional** | **MongoDB (Mongoose / MongoDB Driver)** | Ideal para documentos semi-estructurados como el árbol de personalización del personaje (`CharacterAppearance`), estado de slots de mochila y progreso de niveles. |
| **Cache y Estado en Tiempo Real** | **Redis (ioredis / Redis Stack)** | - Manejo de tokens de revocación y lista negra.<br>- Rate limiting de fuerza bruta.<br>- Almacén de presencia y sesiones de salas de juego (Rooms).<br>- Pub/Sub para escalar WebSockets en múltiples réplicas.<br>- Tablas de clasificación rápida (Sorted Sets `ZSET`). |
| **Servidor en Tiempo Real** | **Socket.io** o **ws** | Socket.io gestiona salas automáticas por nivel, reconexiones instantáneas y heartbeat/ping-pong. |
| **Seguridad y Criptografía** | **Argon2id** (o **bcrypt** con salt cost 12), **jsonwebtoken** (JWT) | Argon2id es el algoritmo estándar ganador del Password Hashing Competition (resistente a GPUs y ASICs). |

---

## 2. Lo que actualmente está en el Frontend y DEBE ir en el Backend

Actualmente, el juego almacena todo en memoria y `localStorage`. Para un entorno online y seguro, estos componentes deben residir en el backend:

1. **Gestión de Cuentas y Credenciales:**
   - Hashing de contraseñas con Argon2id / bcrypt.
   - Generación y rotación de tokens (Access Token corto de 15 min + Refresh Token en cookie `HttpOnly`).
2. **Autoridad y Validación de Niveles Desbloqueados (`progress.ts`):**
   - Actualmente: el cliente decide si `isLevelUnlocked(levelId)` es válido.
   - En el backend: el servidor debe verificar que el usuario realmente completó los niveles previos antes de permitirle unirse a la sala de un nivel superior o registrar recompensas.
3. **Validación de Récords y Modos de Juego (`Contrarreloj` / `Persecución`):**
   - El tiempo de partida debe registrarse con un timestamp de inicio en el backend (`startTime`). Al cruzar la meta, el backend valida que `elapsedSeconds` sea humanamente posible según la física del mapa, evitando trampas de velocidad o teletransporte.
4. **Persistencia del Personaje y Mochila (`CharacterAppearance` y `InventoryStatus`):**
   - El cuerpo, colores, compañero y los 5 slots de la mochila se sincronizan con la base de datos tras cada hito o uso de ítems.
5. **Estado de Salas Multijugador (Lobbies en tiempo real):**
   - El backend gestiona quién está en cada nivel, sus coordenadas 3D, rotación e impulsos para sincronizarlos entre todos los clientes conectados.

---

## 3. Modelo de Datos (MongoDB)

### 3.1. Colección: `users`
Almacena la identidad y credenciales del usuario.
```typescript
interface UserDocument {
  _id: ObjectId;
  username: string;          // Único, normalizado a minúsculas para búsqueda, 3-20 caracteres
  displayName: string;       // Nombre visual con mayúsculas/minúsculas intactas
  email: string;             // Único, indexado, normalizado
  passwordHash: string;      // Hash Argon2id
  role: 'player' | 'admin';
  isActive: boolean;
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.2. Colección: `player_profiles`
Separado de las credenciales para consultas rápidas de otros jugadores en el mundo.
```typescript
interface PlayerProfileDocument {
  _id: ObjectId;
  userId: ObjectId;          // Referencia a users._id (Índice único)
  appearance: {
    bodyType: 'chico' | 'chica';
    skinColor: string;       // Hex (#f8d5b8)
    hairStyle: string;       // 'cozy_messy', 'short_crop', etc.
    hairColor: string;
    eyesStyle: string;
    eyesColor: string;
    shirtStyle: string;
    shirtColor: string;
    pantsStyle: string;
    pantsColor: string;
    shoesColor: string;
    hat: string;
    glasses: string;
    backpack: string;
    companion: 'nube' | 'estrella' | 'luciernaga' | 'catarina' | 'hada' | 'serpiente';
  };
  inventory: {
    slots: Array<'baya' | 'nuez' | 'llave' | null>; // Tamaño fijo: 5
  };
  progress: {
    maxUnlockedLevel: number; // Por defecto: 1
    completedLevels: number[]; // Ej. [1, 2, 3]
    totalCollectiblesFound: number;
    unlockedCompanions: string[];
  };
  stats: {
    totalPlayTimeSeconds: number;
    totalJumps: number;
    totalFalls: number;
  };
  updatedAt: Date;
}
```

### 3.3. Colección: `level_records`
Almacena los mejores tiempos en modo contrarreloj o partidas competitivas.
```typescript
interface LevelRecordDocument {
  _id: ObjectId;
  userId: ObjectId;
  username: string;
  levelId: number;
  mode: 'free' | 'time_trial' | 'chase';
  timeSeconds: number;
  collectiblesFound: number;
  createdAt: Date;
}
// Índices recomendados: { levelId: 1, mode: 1, timeSeconds: 1 }
```

---

## 4. Estructuras y Estrategia en Redis

Redis se utiliza para datos de alta velocidad y baja persistencia:

1. **Tokens de Refresco / Sesiones Activas:**
   - Clave: `session:{userId}:{deviceId}`
   - Valor: `{ refreshTokenHash, ip, userAgent, createdAt }`
   - TTL: 7 días (`EXPIRE 604800`)
2. **Rate Limiting de Autenticación (Prevención de Fuerza Bruta):**
   - Clave: `ratelimit:login:{ip}` o `ratelimit:login:{email}`
   - Límite: Máximo 5 intentos fallidos por ventana de 15 minutos.
3. **Presencia de Jugadores en Línea:**
   - Clave: `presence:online_users` (Set `SADD` con `userId`).
   - Clave por sala: `room:level_{levelId}:players` (Hash `HSET` con `socketId -> { userId, username, x, y, z, yaw }`).
4. **Tablas de Posiciones Rápidas (Leaderboards):**
   - Sorted Set: `leaderboard:level:{levelId}:time_trial`
   - Puntuación (`score`): `timeSeconds` (el menor tiempo queda en primer lugar mediante `ZRANGE`).

---

## 5. Arquitectura de Autenticación y Seguridad

### 5.1. Flujo de Doble Token (Access Token + Refresh Token)
1. **Registro / Login:**
   - El cliente envía `email` y `password` por HTTPS POST.
   - El servidor valida entradas (regex, longitud mínima 8 caracteres, mayúsculas, números).
   - Verifica el hash con `argon2.verify(user.passwordHash, plainPassword)`.
2. **Generación de Tokens:**
   - **Access Token:** JWT firmado con clave secreta (`HS256` o `RS256`), duración **15 minutos**.
     - Carga útil (Payload): `{ sub: userId, username, role }`.
     - Enviado en la respuesta JSON o en memoria de la aplicación cliente.
   - **Refresh Token:** String criptográfico aleatorio (`crypto.randomBytes(64).toString('hex')`), duración **7 días**.
     - Guardado en Redis con hash.
     - Enviado al cliente **exclusivamente en una Cookie HTTP-only**:
       ```http
       Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh; Max-Age=604800
       ```
3. **Renovación Silenciosa (`/api/auth/refresh`):**
   - Cuando el Access Token expira, el frontend hace una petición a este endpoint enviando la cookie. Si el token en Redis es válido, emite un nuevo Access Token.

### 5.2. Capas de Seguridad Críticas
* **Protección contra Inyección:** Uso de esquemas de validación estrictos con **Zod** o **Joi** antes de tocar la base de datos.
* **Cabeceras de Seguridad:** Implementación de `helmet` (HSTS, X-Content-Type-Options, etc.).
* **CORS estricto:** Permitir solo el dominio de origen del juego, con `credentials: true`.
* **Sanitización de nombres de usuario:** Bloquear caracteres especiales y tags HTML/script (prevención de XSS en la visualización del nombre en 3D).

---

## 6. Especificación de Endpoints REST (API Specs)

### Autenticación (`/api/v1/auth`)

| Método | Endpoint | Descripción | Body / Parámetros |
| :--- | :--- | :--- | :--- |
| `POST` | `/register` | Crea una nueva cuenta | `{ username, email, password }` |
| `POST` | `/login` | Inicia sesión | `{ email, password }` |
| `POST` | `/refresh` | Obtiene un nuevo Access Token usando la Cookie | Ninguno (Lee cookie) |
| `POST` | `/logout` | Invalida el Refresh Token en Redis y borra la cookie | Ninguno |

### Jugador y Progreso (`/api/v1/player`)
*(Requieren header `Authorization: Bearer <accessToken>`)*

| Método | Endpoint | Descripción | Body / Respuesta |
| :--- | :--- | :--- | :--- |
| `GET` | `/me` | Perfil del usuario, personaje e inventario | Respuesta: `{ user, appearance, progress, inventory }` |
| `PUT` | `/appearance` | Guarda personalización del personaje | Body: `CharacterAppearance` completo |
| `PUT` | `/inventory` | Actualiza los ítems de la mochila | Body: `{ slots: [ ... ] }` |
| `POST` | `/complete-level` | Valida y registra la finalización de un nivel | Body: `{ levelId, timeSeconds, relicsFound, authTicket }` |

### Tablas de Récords (`/api/v1/leaderboard`)

| Método | Endpoint | Descripción | Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/:levelId` | Top 50 mejores tiempos de un nivel | Query: `mode=time_trial` |

---

## 7. Protocolo de Sincronización en Tiempo Real (WebSockets)

Para ver a otros jugadores correr, saltar y explorar las islas en vivo, el cliente establece una conexión WebSocket autenticada.

### 7.1. Handshake de Conexión
```javascript
// Cliente Three.js
const socket = io('wss://servidor-juego.com', {
  auth: { token: accessToken },
  transports: ['websocket']
});
```

### 7.2. Ciclo de Eventos del Servidor

```
[ Cliente ]                                      [ Servidor WebSocket ]
     |                                                     |
     |---- Evento: "room:join" { levelId: 1 } ------------>|
     |                                                     |-- Agrega al jugador al Room "level_1"
     |                                                     |-- Notifica a la sala: "player:joined"
     |<--- Evento: "room:state" { playersInLevel: [...] } -|
     |                                                     |
     |==== LOOP DE MOVIMIENTO (Tick Rate 20-30 Hz) ========|
     |---- Evento: "player:sync" { x, y, z, yaw, anim } -->|
     |                                                     |-- Retransmite: "player:moved"
     |<--- Evento: "players:update" { [userId]: pos, ... } |
     |                                                     |
```

### 7.3. Diccionario de Eventos WebSocket

#### Cliente -> Servidor:
* `room:join` (`{ levelId: number }`): Cambia de isla o nivel. El servidor lo remueve de la sala anterior y lo une a la nueva.
* `player:sync` (`{ x: number, y: number, z: number, yaw: number, anim: 'idle'|'walk'|'run'|'jump'|'fall', action?: string }`): Enviado cada 33–50 ms.
* `companion:power` (`{ powerType: string }`): Emite efectos visuales del compañero a otros jugadores.

#### Servidor -> Cliente:
* `room:state` (`{ players: PlayerRemoteState[] }`): Estado inicial de todos los personajes presentes al entrar al nivel.
* `player:joined` (`{ userId, username, appearance, position }`): Instancia el modelo 3D del nuevo jugador en Three.js.
* `player:moved` (`{ userId, x, y, z, yaw, anim }`): Actualiza las coordenadas objetivo para que el cliente aplique **interpolación lineal (`Vector3.lerp`)**.
* `player:left` (`{ userId }`): Elimina el modelo Three.js de la escena.

---

## 8. Estructura de Carpetas Recomendada para el Backend

```text
backend-cozyleap/
├── src/
│   ├── config/              # Variables de entorno, conexiones a Mongo y Redis
│   │   ├── env.ts
│   │   ├── mongo.ts
│   │   └── redis.ts
│   ├── middlewares/         # Autenticación JWT, Rate Limiter, Error Handler
│   │   ├── auth.middleware.ts
│   │   ├── rateLimiter.middleware.ts
│   │   └── validate.middleware.ts
│   ├── models/              # Modelos Mongoose
│   │   ├── User.model.ts
│   │   ├── PlayerProfile.model.ts
│   │   └── LevelRecord.model.ts
│   ├── modules/
│   │   ├── auth/            # Rutas, controladores y servicios de Auth
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.schema.ts
│   │   └── auth.routes.ts
│   │   ├── player/          # Progreso, apariencia e inventario
│   │   │   ├── player.controller.ts
│   │   │   └── player.service.ts
│   │   └── leaderboard/     # Récords y tiempos
│   ├── websocket/           # Lógica en tiempo real
│   │   ├── socketServer.ts  # Instancia y middlewares de Socket.io
│   │   ├── roomManager.ts   # Control de salas por nivel
│   │   └── handlers/
│   │       ├── movement.handler.ts
│   │       └── connection.handler.ts
│   └── app.ts               # Punto de entrada Fastify / Express
├── tsconfig.json
├── package.json
└── .env.example
```
