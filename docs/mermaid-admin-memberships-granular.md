```mermaid
%% Diagram: Admin Memberships Flow (Granular)
graph TD
  subgraph src/api/admin/memberships.ts [Admin Memberships API]
    AdminMemberships[handleAdminMemberships]
    AdminMemberships --> RequireAdmin[requireAdmin]
    AdminMemberships --> MethodCheck[Check request.method]
    AdminMemberships --> ErrUnauthorized[err('Unauthorized')]
    AdminMemberships --> ErrMethod[err('Method not allowed')]
    AdminMemberships --> ListMembershipForms[listMembershipForms]
    AdminMemberships --> FormatCheck[Check format param]
    FormatCheck --> AsCsv[asCsv]
    AsCsv --> CsvHeaders[CSV headers]
    AsCsv --> CsvRows[CSV rows]
    AsCsv --> CsvEscape[csvEscape]
    AsCsv --> SafeParsePayload[safeParsePayload]
    AdminMemberships --> Ok[ok]
    AdminMemberships --> Response[Response]
  end
  subgraph src/lib/repositories/membership-forms.ts [Membership Forms Repository]
    ListMembershipForms --> MembershipDB[DB: SELECT membership_forms]
    MembershipDB --> EnquiriesJoin[LEFT JOIN enquiries]
  end
  AdminMemberships -.-> CSVExport[CSV Export]
  AdminMemberships -.-> JSONExport[JSON Export]
  AdminMemberships -.-> ErrorFlow[Error Response]
```
