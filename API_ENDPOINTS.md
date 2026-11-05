# Especificación de Endpoints: Cozy Leap Online Backend API (v1)

**Base URL:** `http://localhost:3000/api/v1`  
**Formato de Intercambio:** `application/json`  
**Autenticación:** Cabecera `Authorization: Bearer <accessToken>`

---

## 1. Tablas de Ranking / Leaderboards (`/api/v1/leaderboard`)

### 1.1. `GET /api/v1/leaderboard/:levelId`
Retorna las tablas de ranking de los **3 modos de juego**:
- **`normal`**: Partidas en modo regular / libre.
- **`contrareloj`**: Partidas contra el reloj (menor tiempo en segundos).
- **`persecucion`**: Partidas de persecución y escape.

> **Importante:** Esta tabla **no contiene datos falsos ni bots precargados**. Solo refleja partidas reales registradas por jugadores legítimos.

#### Parámetros:
- **Ruta:** `levelId` (número entero positivo, ej. `1`, `2`, `3`).
- **Query Params (Opcionales):**
  - `limit`: Cantidad máxima de registros por tabla (1 a 100, default: `50`).
  - `mode`: Si deseas filtrar una tabla específica (`normal`, `contrareloj`, `persecucion`). Si no se envía, retorna las 3 tablas completas en `tables`.

#### Ejemplo de Petición:
```http
GET /api/v1/leaderboard/1 HTTP/1.1
Host: localhost:3000
```

#### Ejemplo de Respuesta `200 OK`:
```json
{
  "status": "success",
  "levelId": 1,
  "mode": "all",
  "tables": {
    "normal": [
      {
        "rank": 1,
        "userId": "usr_98af7a",
        "username": "Saltarin_Pro",
        "timeSeconds": 16.42,
        "collectiblesFound": 4,
        "createdAt": "2026-11-05T18:10:00.000Z"
      }
    ],
    "contrareloj": [
      {
        "rank": 1,
        "userId": "usr_12bc4d",
        "username": "SpeedRunner",
        "timeSeconds": 11.25,
        "collectiblesFound": 5,
        "createdAt": "2026-11-05T18:12:30.000Z"
      }
    ],
    "persecucion": [
      {
        "rank": 1,
        "userId": "usr_77de8a",
        "username": "EscapeMaster",
        "timeSeconds": 21.80,
        "collectiblesFound": 3,
        "createdAt": "2026-11-05T18:14:00.000Z"
      }
    ]
  },
  "counts": {
    "normal": 1,
    "contrareloj": 1,
    "persecucion": 1,
    "total": 3
  }
}
```

---

### 1.2. `GET /api/v1/leaderboard`
Retorna el resumen de rankings de los 3 modos para todos los niveles activos (del 1 al 5).

---

## 2. Registro de Partidas & Anti-Cheat (`/api/v1/player/complete-level`)

### `POST /api/v1/player/complete-level`
Permite a un jugador registrar el resultado de un nivel en cualquiera de los 3 modos de juego.

- **Headers:**  
  `Authorization: Bearer <accessToken>`  
  `Content-Type: application/json`

- **Request Body:**
```json
{
  "levelId": 1,
  "timeSeconds": 14.85,
  "relicsFound": 5,
  "mode": "contrareloj"
}
```

| Campo | Tipo | Requerido | Descripción |
| :--- | :--- | :--- | :--- |
| `levelId` | `number` | **Sí** | Número del nivel completado (1 al 10). |
| `timeSeconds` | `number` | **Sí** | Tiempo registrado en segundos. Debe superar el umbral físico del nivel para evitar trampas. |
| `relicsFound` | `number` | No | Reliquias o coleccionables encontrados (0 a 50). Default: `0`. |
| `mode` | `string` | No | `"normal"`, `"contrareloj"` o `"persecucion"`. Default: `"normal"`. |

- **Response `200 OK`:**
```json
{
  "status": "success",
  "message": "Level completion validated and recorded",
  "data": {
    "record": {
      "_id": "rec_mw43a8_91f",
      "userId": "usr_98af7a",
      "username": "Saltarin_Pro",
      "levelId": 1,
      "mode": "contrareloj",
      "timeSeconds": 14.85,
      "collectiblesFound": 5,
      "createdAt": "2026-11-05T18:15:00.000Z"
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
      "verifiedAt": "2026-11-05T18:15:00.000Z",
      "minPhysicalTime": 4.5
    }
  }
}
```

---

## 3. Autenticación (`/api/v1/auth`)

| Método | Endpoint | Descripción | Body |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Crea una cuenta de jugador con hash Argon2/bcrypt | `{ username, email, password, displayName? }` |
| `POST` | `/api/v1/auth/login` | Inicia sesión con rate limit (5 intentos / 15m) | `{ email, password, deviceId? }` |
| `POST` | `/api/v1/auth/refresh` | Rota silenciosamente el Access Token | `{ refreshToken? }` o Cookie |
| `POST` | `/api/v1/auth/logout` | Revoca la sesión en Redis | `{ refreshToken?, userId? }` |

---

## 4. Jugador, Apariencia & Amigos (`/api/v1/player`)
*(Requieren `Authorization: Bearer <accessToken>`)*

| Método | Endpoint | Descripción | Body / Respuesta |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/player/me` | Obtiene perfil, progreso, apariencia y mochila | Perfil completo |
| `PUT` | `/api/v1/player/appearance` | Actualiza colores 3D, ropa y compañero | `CharacterAppearance` completo |
| `PUT` | `/api/v1/player/inventory` | Actualiza los 5 slots de la mochila | `{ slots: ['baya', 'nuez', ...] }` |
| `GET` | `/api/v1/player/friends` | Lista amigos aceptados y solicitudes pendientes | `{ friends, incomingPending, outgoingPending }` |
| `POST` | `/api/v1/player/friends/request` | Envía solicitud de amistad | `{ targetUsername: "nombre" }` |
| `POST` | `/api/v1/player/friends/accept/:requestId` | Acepta solicitud | Ninguno |
| `POST` | `/api/v1/player/friends/decline/:requestId` | Rechaza solicitud | Ninguno |
