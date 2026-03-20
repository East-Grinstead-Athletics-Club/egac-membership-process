```mermaid
%% Diagram: Admin Templates Flow (Granular)
graph TD
  subgraph src/api/admin/templates.ts [Admin Templates API]
    AdminTemplates[handleAdminTemplates]
    AdminTemplates --> RequireAdmin[requireAdmin]
    AdminTemplates --> MethodCheck[Check request.method]
    AdminTemplates --> HandleList[handleList]
    AdminTemplates --> HandleCreate[handleCreate]
    HandleCreate --> ParseBody[parseBody]
    HandleCreate --> KeyCheck[Check key]
    HandleCreate --> NameCheck[Check name]
    HandleCreate --> SubjectCheck[Check subject]
    HandleCreate --> HtmlCheck[Check html]
    HandleCreate --> GetEmailTemplateByKey[getEmailTemplateByKey]
    GetEmailTemplateByKey --> ErrKeyExists[err('KEY_EXISTS')]
    HandleCreate --> ExtractVars[extractTemplateVariables]
    HandleCreate --> CreateEmailTemplate[createEmailTemplate]
    CreateEmailTemplate --> GenerateId[generateId]
    CreateEmailTemplate --> Now[now]
    HandleCreate --> Ok[ok]
    HandleCreate --> Err[err]
    HandleCreate -.-> ErrorFlow[Error Response]
  end
  subgraph src/lib/repositories/templates.ts [Templates Repository]
    CreateEmailTemplate --> TemplateDB[DB: INSERT templates]
    ListEmailTemplates --> TemplateDB[DB: SELECT templates]
    GetEmailTemplateByKey --> TemplateDB[DB: SELECT templates]
  end
  HandleList --> ListEmailTemplates[listEmailTemplates]
```
