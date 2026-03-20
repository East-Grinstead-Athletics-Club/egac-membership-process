Act as a systems architect reviewing a full production-ready TypeScript project.

Your goal is to generate a **series of Mermaid diagrams**, splitting the project into multiple manageable diagrams based on modules, workflows, or logical groups.

Guidelines:

1. **Analyze all files and modules recursively**.
2. **Automatically generate as many diagrams as needed**, without a fixed number, to keep each diagram clear (~15–20 nodes max).
3. **Focus areas per diagram**:
   - Entry points / usage contexts (API handlers, routes, workers, CLI commands)
   - Core business logic (functions, classes, services, data transformations)
   - Validation & error handling flows
   - External integrations (databases, APIs, email, third-party services)
   - Combine multiple aspects in a single diagram if logical, but keep clarity
4. **Diagram structure**:
   - Group nodes into subgraphs by file/module
   - Separate "Core Logic" from "Usage Contexts"
   - Collapse low-level utilities into single nodes if needed
   - Label edges to show data or action flow (e.g., "validates input", "writes to DB")
5. **Output format**:
   - Use valid Mermaid syntax
   - Precede each diagram with a descriptive comment, e.g.:
     ```mermaid
     %% Diagram: Auth Module
     graph TD
     ...
     ```
6. **Do not output anything other than Mermaid code**.
7. If the project is very large, **generate diagrams for modules in order**, then provide an optional "index diagram" summarizing high-level interactions between modules.

Input:

<PASTE ENTIRE PROJECT CODE OR FILE STRUCTURE HERE>