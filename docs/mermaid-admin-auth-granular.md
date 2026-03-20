```mermaid
%% Diagram: Admin Authentication (Granular)
graph TD
  subgraph src/lib/auth/admin.ts [Admin Auth]
    RequireAdmin[requireAdmin]
    RequireAdmin --> CookieToken[Cookie: egac_admin_token]
    RequireAdmin --> AuthHeader[Authorization: Bearer]
    RequireAdmin --> XAdminToken[x-admin-token header]
    RequireAdmin --> CheckAdminToken[checkAdminToken]
    CheckAdminToken --> DevTokenRule['dev' token (dev env only)]
    CheckAdminToken --> EnvTokenMatch[env.ADMIN_TOKEN match]
    RequireAdmin -.-> Failure[Failure: Unauthorized]
    RequireAdmin -.-> Success[Success: Authorized]
  end
  subgraph src/api/admin/memberships.ts [Admin Memberships API]
    AdminMemberships[handleAdminMemberships] --> RequireAdmin
    AdminMemberships -.-> Err[err (Unauthorized)]
    AdminMemberships -.-> Ok[ok (Authorized)]
  end
  subgraph src/api/admin/templates.ts [Admin Templates API]
    AdminTemplates[handleAdminTemplates] --> RequireAdmin
    AdminTemplates -.-> Err[err (Unauthorized)]
    AdminTemplates -.-> Ok[ok (Authorized)]
  end
```
