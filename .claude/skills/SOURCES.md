# Skills de terceros

Copias fijadas a un commit. Para actualizar, vuelve a copiar desde el commit nuevo y revisa el diff antes de aceptarlo.

Cada skill existe dos veces, en `.claude/skills/` (Claude Code) y en `.agents/skills/` (otros agentes). Son copias y no symlinks porque el repo tiene `core.symlinks=false` en Windows. Actualiza ambas a la vez y compruébalo con `diff -r .claude/skills/<skill> .agents/skills/<skill>`.

| Carpeta | Origen | Commit | Licencia | Cambios locales |
|---|---|---|---|---|
| `chrome-extensions/` | https://github.com/GoogleChrome/modern-web-guidance/tree/4f2b13e/skills/chrome-extensions | `4f2b13e` (2026-10-26) | Apache-2.0 | Se añadió `LICENSE` del repo. |
| `chrome-extension/` | https://github.com/samber/cc-skills/tree/123cb15/skills/chrome-extension | `123cb15` (2026-10-01) | MIT | Se eliminó `allowed-tools` del frontmatter para no preaprobar `Bash(git/gh/npm)`. Se añadió `LICENSE` del repo. |
| `rust-skills/` | https://github.com/leonardomso/rust-skills/tree/fd2a861 | `fd2a861` (2026-06-14) | MIT | Solo `SKILL.md`, `rules/` (265 reglas) y `LICENSE`. Se omitió `checks/`, que es la herramienta de desarrollo que compila los ejemplos y no forma parte de la skill publicada. |

## Avisos de la revisión

- `chrome-extension` propone `chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })` como patrón por defecto. Eso expone el estado de sesión a los content scripts. No usarlo salvo que un content script lo necesite.
- Ninguna de las dos cubre Native Messaging, Local Network Access ni pruebas e2e de extensiones. Para eso, la documentación oficial de Chrome.
- `rust-skills` contiene reglas `doc-*` (por ejemplo `doc-all-public` y `doc-errors-section`) y otras que piden comentarios. Chocan con la regla del proyecto de escribir código sin comentarios, y manda la regla del proyecto. El resto de categorías sí se aplican.
- `rust-skills` no trae reglas específicas de axum. Para axum, la documentación oficial vía Context7.
- Se evaluó y descartó https://github.com/actionbook/rust-skills (`5c40d3a`). Son 38 skills con triggers en chino, un router que reclama todas las preguntas de Rust, dependencias de la MCP de actionbook y ejemplos sin compilar.
