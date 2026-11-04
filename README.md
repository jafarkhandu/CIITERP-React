# CIIT ERP – React + Vite + TypeScript (Phase 1)

Conversion of the Angular `CIITERPClientApp`. UI = Bootstrap 5 (same CSS as before).

```bash
npm install
npm run dev      # http://localhost:4200
npm run build
```

## Phase 1 – done
- Vite + React 18 + TypeScript, React Router 6, axios
- Auth: login, forgot password, reset password (UI only, same as Angular), change password, profile
- Token handling: access + refresh token, auto refresh on expiry / 401, one shared refresh for parallel calls
- Route guard (`ProtectedRoute`) with the same permission + role rules
- Main layout: navbar, sidebar (menus filtered by role + permission), dark/light theme, profile menu, logout
- Full route table. Screens of later phases show a "will be converted in Phase N" placeholder
  (guards + sidebar entries already work).

## Folder map
| Angular | React |
|---|---|
| `Core/Services/TokenService` | `src/core/services/tokenService.ts` |
| `Core/Services/PermissionService` | `src/core/services/permissionService.ts` |
| `Core/Services/UserSessionService` | `src/core/auth/session.ts` (+ `hooks.ts`) |
| `Core/guards/AuthGuards` | `src/core/auth/ProtectedRoute.tsx` |
| `Core/interceptors/AuthInterceptors` | `src/core/http/httpClient.ts` |
| `Infrastructure/Api/*` | `src/api/*` |
| `Domain/Entities`, `Domain/DTOs` | `src/types/*` |
| `Presentation/*` | `src/features/*` |
| `Maincomponent` | `src/layouts/MainLayout.tsx` |
| `UserRoutes.ts` | `src/routes/AppRoutes.tsx` |

The Angular Domain/Repository/UseCase layers (interfaces + DI tokens) are dropped: in React a screen
calls `src/api/*` directly. Endpoints are unchanged (`src/core/config/api-endpoints.ts`).

## Component CSS
Angular component CSS is scoped automatically; plain CSS in React is global. Use the helper:

```bash
node scripts/scope-css.mjs <old.css> cmp-my-screen src/features/x/MyScreen/MyScreen.css
```
and wrap the screen in `<div className="ciit-host cmp-my-screen">`.
