# Especificación y Referencia de Endpoints: Cozy Leap Online Backend API (v1)

**Base URL:** `http://localhost:3000/api/v1`  
**Formato de Intercambio:** `application/json`  
**Autenticación:** Cabecera `Authorization: Bearer <accessToken>` o Cookie `HttpOnly` para refresh.

---

## Índice de Endpoints

1. [Autenticación (`/api/v1/auth`)](#1-autenticación-apiv1auth)
   - [POST /register](#11-post-apiv1authregister---registro-de-usuario)
   - [POST /login](#12-post-apiv1authlogin---inicio-de-sesión)
   - [POST /refresh](#13-post-apiv1authrefresh---renovación-de-token-jwt)
   - [POST /logout](#14-post-apiv1authlogout---cierre-de-sesión-y-revocación-redis)
2. [Jugador y Progreso (`/api/v1/player`)](#2-jugador-y-progreso-apiv1player)
   - [GET /me](#21-get-apiv1playerme---obtener-perfil-progreso-e-inventario)
   - [PUT /appearance](#22-put-apiv1playerappearance---actualizar-apariencia-del-personaje)
   - [PUT /inventory](#23-put-apiv1playerinventory---actualizar-mochila-5-slots)
   - [POST /complete-level](#24-post-apiv1playercomplete-level---validación-y-registro-anti-cheat-de-nivel)
3. [Tablas de Clasificación (`/api/v1/leaderboard`)](#3-tablas-de-clasificación-apiv1leaderboard)
   - [GET /:levelId](#31-get-apiv1leaderboardlevelid---mejores-tiempos-redis-zset)
4. [Sistema y Diagnóstico (`/api/v1/system`)](#4-sistema-y-diagnóstico-apiv1system)
   - [GET /health](#41-get-apiv1systemhealth---salud-y-servicios)
   - [GET /redis-inspect](#42-get-apiv1systemredis-inspect---inspección-de-memoria-redis)
   - [GET /rooms](#43-get-apiv1systemrooms---estado-de-salas-multijugador)
5. [Protocolo WebSocket / Socket.io](#5-protocolo-en-tiempo-real-socketio)

---

## 1. Autenticación (`/api/v1/auth`)

### 1.1. `POST /api/v1/auth/register` - Registro de Usuario
Crea una cuenta nueva en la base de datos, encripta la contraseña y crea una sesión activa en Redis con emisión de tokens.

- **Headers Requeridos:**  
  `Content-Type: application/json`
- **Autenticación Requerida:** No.
- **Request Body:**
```json
{
  "username": "saltarin_pro",
  "displayName": "Saltarín Pro",
  "email": "saltarin@cozyleap.com",
  "password": "CozyLeap123!"
}
```
| Campo | Tipo | Requerido | Validaciones / Reglas |
| :--- | :--- | :--- | :--- |
| `username` | `string` | **Sí** | Min 3, Max 20 caracteres alfanuméricos y guion bajo (`/^[a-zA-Z0-9_]+$/`). Normalizado a minúsculas. |
| `displayName` | `string` | No | Min 2, Max 30 caracteres. Mantiene mayúsculas/minúsculas. Por defecto toma `username`. |
| `email` | `string` | **Sí** | Formato de email válido. Único en el sistema. |
| `password` | `string` | **Sí** | Min 8 caracteres. Debe incluir al menos una mayúscula, una minúscula y un número. |

- **Response `201 Created`:**
```json
{
  "status": "success",
  "message": "User registered successfully",
  "data": {
    "user": {
      "_id": "usr_mw03j9w5_cpuybz",
      "username": "saltarin_pro",
      "displayName": "Saltarín Pro",
      "email": "saltarin@cozyleap.com",
      "role": "player",
      "isActive": true,
      "lastLoginAt": "2026-11-03T02:56:22.997Z",
      "createdAt": "2026-11-03T02:56:22.997Z",
      "updatedAt": "2026-11-03T02:56:22.997Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "4299e308c0f68ae57f145c76e9e7723823f368841ab...",
    "tokenType": "Bearer",
    "expiresInSeconds": 900
  }
}
```
- **Cookies Emitidas:**
  `Set-Cookie: refreshToken=...; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=604800`
- **Posibles Errores:**
  - `400 Bad Request`: `VALIDATION_ERROR` (Formato inválido de contraseña, email o username).
  - `409 Conflict`: `EMAIL_EXISTS` o `USERNAME_EXISTS`.

---

### 1.2. `POST /api/v1/auth/login` - Inicio de Sesión
Verifica credenciales con hash Argon2/bcrypt, aplica rate limiting de 5 intentos por ventana de 15 min y genera un nuevo Access Token JWT y Refresh Token.

- **Headers Requeridos:**  
  `Content-Type: application/json`
- **Rate Limit:** Máximo 5 intentos fallidos cada 15 minutos por IP / Email en Redis.
- **Request Body:**
```json
{
  "email": "pionero@cozyleap.com",
  "password": "CozyLeap123!",
  "deviceId": "web-browser"
}
```
| Campo | Tipo | Requerido | Descripción |
| :--- | :--- | :--- | :--- |
| `email` | `string` | **Sí** | Correo electrónico o nombre de usuario registrado. |
| `password` | `string` | **Sí** | Contraseña en texto plano a verificar contra el hash. |
| `deviceId` | `string` | No | Identificador del dispositivo/cliente. Default: `"web-browser"`. |

- **Response `200 OK`:**
```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "usr_pionero123",
      "username": "pionero_cozy",
      "displayName": "Pionero Cozy",
      "email": "pionero@cozyleap.com",
      "role": "admin",
      "isActive": true,
      "lastLoginAt": "2026-11-03T03:00:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "7c9f8021d120a1...",
    "tokenType": "Bearer",
    "expiresInSeconds": 900
  }
}
```
- **Posibles Errores:**
  - `401 Unauthorized`: `INVALID_CREDENTIALS` (Devuelve `remainingAttemptsBeforeLockout`).
  - `429 Too Many Requests`: `RATE_LIMIT_EXCEEDED` (Superó los 5 intentos en 15 minutos).

---

### 1.3. `POST /api/v1/auth/refresh` - Renovación de Token JWT
Permite renovar silenciosamente el Access Token sin que el usuario tenga que volver a iniciar sesión. Aplica rotación de token (invalida el anterior en Redis y emite uno nuevo).

- **Headers Requeridos:**  
  `Content-Type: application/json`  
  *(Lee la cookie `refreshToken` automáticamente o el cuerpo JSON/cabecera `x-refresh-token`)*
- **Request Body (Opcional si viene en Cookie):**
```json
{
  "refreshToken": "7c9f8021d120a1...",
  "deviceId": "web-browser"
}
```
- **Response `200 OK`:**
```json
{
  "status": "success",
  "message": "Access token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "9d1b64ef02...",
    "tokenType": "Bearer",
    "expiresInSeconds": 900
  }
}
```
- **Posibles Errores:**
  - `401 Unauthorized`: `MISSING_REFRESH_TOKEN` o `INVALID_SESSION` (Sesión expirada o revocada en Redis).

---

### 1.4. `POST /api/v1/auth/logout` - Cierre de Sesión y Revocación Redis
Invalida la clave de sesión en Redis (`session:{userId}:{deviceId}`), remueve al usuario del Set de presencia online (`presence:online_users`) y limpia la cookie `refreshToken`.

- **Headers:**  
  `Authorization: Bearer <accessToken>` (Opcional)
- **Request Body (Opcional):**
```json
{
  "refreshToken": "9d1b64ef02...",
  "userId": "usr_pionero123"
}
```
- **Response `200 OK`:**
```json
{
  "status": "success",
  "message": "Logged out successfully, session invalidated in Redis."
}
```

---

## 2. Jugador y Progreso (`/api/v1/player`)
> **Nota de Seguridad:** Todos los endpoints de `/api/v1/player/*` requieren la cabecera:  
> `Authorization: Bearer <accessToken>`

### 2.1. `GET /api/v1/player/me` - Obtener Perfil, Progreso e Inventario
Obtiene el estado completo y consolidado del jugador autenticado.

- **Headers Requeridos:**  
  `Authorization: Bearer <accessToken>`
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "usr_mw03j9w5_cpuybz",
      "username": "pionero_cozy",
      "displayName": "Pionero Cozy",
      "email": "pionero@cozyleap.com",
      "role": "admin",
      "isActive": true
    },
    "appearance": {
      "bodyType": "chico",
      "skinColor": "#f8d5b8",
      "hairStyle": "cozy_messy",
      "hairColor": "#4a2e18",
      "eyesStyle": "bright_round",
      "eyesColor": "#2b5c8f",
      "shirtStyle": "hoodie",
      "shirtColor": "#059669",
      "pantsStyle": "joggers",
      "pantsColor": "#1e293b",
      "shoesColor": "#f97316",
      "hat": "gorro_explorador",
      "glasses": "none",
      "backpack": "explorer_pack",
      "companion": "estrella"
    },
    "inventory": {
      "slots": ["baya", "nuez", "llave", "baya", null]
    },
    "progress": {
      "maxUnlockedLevel": 4,
      "completedLevels": [1, 2, 3],
      "totalCollectiblesFound": 43,
      "unlockedCompanions": ["nube", "estrella", "luciernaga"]
    },
    "stats": {
      "totalPlayTimeSeconds": 4215,
      "totalJumps": 145,
      "totalFalls": 12
    }
  }
}
```

---

### 2.2. `PUT /api/v1/player/appearance` - Actualizar Apariencia del Personaje
Persiste en MongoDB `player_profiles.appearance` las modificaciones del modelo 3D del jugador.

- **Headers Requeridos:**  
  `Authorization: Bearer <accessToken>`  
  `Content-Type: application/json`
- **Request Body:**
```json
{
  "bodyType": "chica",
  "skinColor": "#f8d5b8",
  "hairStyle": "ponytail",
  "hairColor": "#d97706",
  "eyesStyle": "bright_round",
  "eyesColor": "#10b981",
  "shirtStyle": "hoodie",
  "shirtColor": "#db2777",
  "pantsStyle": "joggers",
  "pantsColor": "#1e293b",
  "shoesColor": "#06b6d4",
  "hat": "none",
  "glasses": "none",
  "backpack": "explorer_pack",
  "companion": "luciernaga"
}
```
| Campo | Tipo | Valores Válidos / Reglas |
| :--- | :--- | :--- |
| `bodyType` | `string` | `"chico"` \| `"chica"` |
| `skinColor`, `hairColor`, `eyesColor`, `shirtColor`, `pantsColor`, `shoesColor` | `string` | Hex Color válido (`#RGB` o `#RRGGBB`). |
| `companion` | `string` | `"nube"` \| `"estrella"` \| `"luciernaga"` \| `"catarina"` \| `"hada"` \| `"serpiente"` |
| `hat`, `glasses`, `backpack` | `string` | Identificadores de cosméticos o `"none"`. |

- **Response `200 OK`:**
```json
{
  "status": "success",
  "message": "Character appearance updated successfully",
  "data": {
    "appearance": { ... }
  }
}
```

---

### 2.3. `PUT /api/v1/player/inventory` - Actualizar Mochila (5 Slots)
Sincroniza el inventario del jugador. La especificación exige exactamente 5 ranuras.

- **Headers Requeridos:**  
  `Authorization: Bearer <accessToken>`  
  `Content-Type: application/json`
- **Request Body:**
```json
{
  "slots": ["baya", "nuez", "llave", null, "baya"]
}
```
| Campo | Tipo | Reglas |
| :--- | :--- | :--- |
| `slots` | `Array<string \| null>` | Array con longitud fija de 5 elementos. Valores permitidos: `"baya"`, `"nuez"`, `"llave"` o `null`. |

- **Response `200 OK`:**
```json
{
  "status": "success",
  "message": "Inventory slots updated successfully",
  "data": {
    "inventory": {
      "slots": ["baya", "nuez", "llave", null, "baya"]
    }
  }
}
```

---

### 2.4. `POST /api/v1/player/complete-level` - Validación y Registro Anti-Cheat de Nivel
Aplica las reglas de autoridad del servidor:
1. **Autoridad de Niveles:** Rechaza si el nivel está bloqueado (`levelId > progress.maxUnlockedLevel`).
2. **Anti-Cheat de Física:** Rechaza si `timeSeconds` es inferior al umbral físico mínimo humanamente posible para ese mapa (evita speedhacks o teletransporte).
3. **Persistencia & Redis:** Actualiza estadísticas, desbloquea el siguiente nivel e inserta la puntuación en el Sorted Set `leaderboard:level:{levelId}:{mode}`.

- **Headers Requeridos:**  
  `Authorization: Bearer <accessToken>`  
  `Content-Type: application/json`
- **Request Body:**
```json
{
  "levelId": 1,
  "timeSeconds": 14.85,
  "relicsFound": 5,
  "mode": "time_trial"
}
```
| Campo | Tipo | Requerido | Descripción |
| :--- | :--- | :--- | :--- |
| `levelId` | `number` | **Sí** | Número entero del nivel (1 a 10). |
| `timeSeconds` | `number` | **Sí** | Tiempo total en segundos. Debe superar el umbral mínimo del nivel. |
| `relicsFound` | `number` | No | Cantidad de coleccionables hallados (0 a 50). Default: `0`. |
| `mode` | `string` | No | `"time_trial"` (default), `"free"` o `"chase"`. |

- **Umbrales Físicos Mínimos por Nivel:**
  - Nivel 1: `4.5s`
  - Nivel 2: `7.0s`
  - Nivel 3: `10.0s`
  - Nivel 4: `14.0s`
  - Nivel 5: `18.0s`

- **Response `200 OK` (Partida Válida):**
```json
{
  "status": "success",
  "message": "Level completion validated and recorded",
  "data": {
    "record": {
      "_id": "rec_mw03jnbs_lkq73r",
      "userId": "usr_pionero123",
      "username": "Pionero Cozy",
      "levelId": 1,
      "mode": "time_trial",
      "timeSeconds": 14.85,
      "collectiblesFound": 5,
      "createdAt": "2026-11-03T03:05:00.000Z"
    },
    "rank": 1,
    "isNewBest": true,
    "progress": {
      "maxUnlockedLevel": 2,
      "completedLevels": [1],
      "totalCollectiblesFound": 5
    },
    "antiCheatCheck": {
      "passed": true,
      "verifiedAt": "2026-11-03T03:05:00.000Z",
      "minPhysicalTime": 4.5
    }
  }
}
```

- **Errores de Seguridad:**
  - `400 Bad Request` (`SPEED_HACK_DETECTED`):
    ```json
    {
      "status": "error",
      "code": "SPEED_HACK_DETECTED",
      "message": "Anti-Cheat Rejection: Completion time 0.5s is below the physical threshold of 4.5s for Level 1."
    }
    ```
  - `403 Forbidden` (`LEVEL_LOCKED`):
    ```json
    {
      "status": "error",
      "code": "LEVEL_LOCKED",
      "message": "Level authority rejection: Level 3 is locked. You must complete level 2 first."
    }
    ```

---

## 3. Tablas de Clasificación (`/api/v1/leaderboard`)

### 3.1. `GET /api/v1/leaderboard/:levelId` - Mejores Tiempos (Redis ZSET)
Consulta los mejores récords ordenados de menor a mayor tiempo desde la estructura Redis Sorted Set (`leaderboard:level:{levelId}:{mode}`).

- **Parámetros de Ruta:**  
  `levelId` (número entero positivo, ej. `1`).
- **Query Params:**
  - `mode`: Modo de juego (`time_trial`, `free`, `chase`). Default: `time_trial`.
  - `limit`: Cantidad máxima de registros a devolver (1 a 100). Default: `50`.
- **Autenticación Requerida:** No.
- **Ejemplo de Petición:**  
  `GET /api/v1/leaderboard/1?mode=time_trial&limit=50`
- **Response `200 OK`:**
```json
{
  "status": "success",
  "levelId": 1,
  "mode": "time_trial",
  "count": 3,
  "leaderboard": [
    {
      "rank": 1,
      "userId": "usr_pionero123",
      "username": "Pionero Cozy",
      "timeSeconds": 13.75,
      "collectiblesFound": 5
    },
    {
      "rank": 2,
      "userId": "usr_saltarin99",
      "username": "Saltarín 99",
      "timeSeconds": 17.45,
      "collectiblesFound": 5
    },
    {
      "rank": 3,
      "userId": "usr_luna_gamer",
      "username": "Luna Gamer",
      "timeSeconds": 22.18,
      "collectiblesFound": 4
    }
  ]
}
```

---

## 4. Sistema y Diagnóstico (`/api/v1/system`)

### 4.1. `GET /api/v1/system/health` - Salud y Servicios
- **Autenticación:** No.
- **Response `200 OK`:**
```json
{
  "status": "ok",
  "game": "Cozy Leap Online",
  "timestamp": "2026-11-03T02:56:27.017Z",
  "uptimeSeconds": 240,
  "environment": "development",
  "services": {
    "mongoDatabase": "connected (in-memory document store)",
    "redisCache": "connected (fast key-value & sorted sets)",
    "webSocketServer": "active (Socket.io 20-30Hz)"
  }
}
```

### 4.2. `GET /api/v1/system/redis-inspect` - Inspección de Memoria Redis
Devuelve las llaves activas de sesiones con su tiempo de vida restante (TTL), la lista de usuarios online en el Set de presencia y las salas de juego.
- **Autenticación:** No.
- **Response `200 OK`:**
```json
{
  "status": "success",
  "redis": {
    "kvKeysCount": 4,
    "setsCount": 1,
    "hashesCount": 2,
    "sortedSetsCount": 2,
    "activeSessions": [
      {
        "key": "session:usr_pionero123:web",
        "expiresAt": 1794279391000,
        "value": { "refreshTokenHash": "...", "userId": "usr_pionero123" }
      }
    ],
    "onlineUsers": ["usr_pionero123"],
    "rooms": {
      "room:level_1:players": 2,
      "room:level_2:players": 0
    }
  }
}
```

### 4.3. `GET /api/v1/system/rooms` - Estado de Salas Multijugador
- **Autenticación:** No.
- **Response `200 OK`:**
```json
{
  "status": "success",
  "rooms": {
    "room:level_1:players": 2
  },
  "onlineUsersCount": 1
}
```

---

## 5. Protocolo en Tiempo Real (Socket.io)

### Handshake de Conexión
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: accessToken }, // JWT emitido por /login o /register
  transports: ['websocket', 'polling']
});
```

### Eventos Cliente -> Servidor (Emisión)
| Evento | Payload | Frecuencia | Descripción |
| :--- | :--- | :--- | :--- |
| `room:join` | `{ levelId: number }` | Al entrar/cambiar nivel | Agrega el socket a la sala del nivel (`level_{levelId}`) y emite el estado inicial. |
| `player:sync` | `{ x, y, z, yaw, anim, action? }` | 20-30 Hz (cada 33–50ms) | Actualiza las coordenadas del personaje y las propaga a los demás jugadores. |
| `companion:power` | `{ powerType: string }` | Por demanda | Emite un efecto especial visual del compañero a toda la sala. |

### Eventos Servidor -> Cliente (Recepción)
| Evento | Payload | Descripción |
| :--- | :--- | :--- |
| `room:state` | `{ levelId, players: PlayerRemoteState[], yourSpawn }` | Lista completa de jugadores en la isla al entrar a la sala. |
| `player:joined` | `{ userId, username, appearance, position }` | Nuevo jugador entró a la isla. Permite instanciar su modelo 3D. |
| `player:moved` | `{ userId, x, y, z, yaw, anim, action? }` | Coordenadas actualizadas para interpolación lineal (`Vector3.lerp`). |
| `player:left` | `{ userId }` | El jugador abandonó la sala o se desconectó. |
| `companion:power:broadcast` | `{ userId, username, powerType, position, timestamp }` | Dispara el efecto de partículas del compañero en la escena. |
