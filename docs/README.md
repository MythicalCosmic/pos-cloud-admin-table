# Project documentation

Current source and the latest explicit product decision take precedence over
specifications. Each contract records its own date and scope; a requested
backend feature is not proof that it has been deployed.

## Development and design

- [Setup, commands, and project structure](../README.md)
- [Agent guide and product constraints](../AGENTS.md)
- [Current design system](design-system.md)

## Backend contracts

- [Product performance report and exports](backend/product-performance.md)
- [Money and supply control](backend/money-supply-control.md)
- [Stock and money follow-up](backend/stock-money-followup.md)
- [Supplier invoice contract](backend/supplier-invoices.md)
- [Supplier invoice deployment verification](backend/supplier-invoice-verification.md)
- [Warehouse and operational audit](backend/warehouse-audit.md)

## Product specifications

- [Period comparison](specs/period-comparison.md): approved demo-data exception.
- [Money and shifts](specs/money-and-shifts.md): historical target state; current
  implementation and the agent guide take precedence.

Completed operating notes, old TODO lists, design exports, and review histories
are available in Git history. Source comments mentioning historical handoff
files refer to that history, not to dependencies needed to run this project.
