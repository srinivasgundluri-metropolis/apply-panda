# Modo: pipeline — Inbox de URLs (Second Brain)

Procesa URLs de ofertas acumuladas en `data/pipeline.md`. El usuario agrega URLs cuando quiera y luego ejecuta `/career-ops pipeline` para procesarlas todas.

## Workflow

1. **Leer** `data/pipeline.md` → buscar items `- [ ]` en la sección "Pendientes"
2. **Para cada URL pendiente**:
   a. Calcular siguiente `REPORT_NUM` secuencial (leer `reports/`, tomar el número más alto + 1)
   b. **Extraer JD** usando Playwright (browser_navigate + browser_snapshot) → WebFetch → WebSearch
   c. Si la URL no es accesible → marcar como `- [!]` con nota y continuar
   d. **Ejecutar auto-pipeline completo**: Evaluación A-G → Report .md → CV PDF (si score >= 3.0) → Cover Letter PDF (si score >= 3.0) → Tracker
   e. **Mover de "Pendientes" a "Procesadas"**: `- [x] #NNN | URL | Empresa | Rol | Score/5 | CV ✅/❌ | Cover Letter ✅/❌`
3. **Si hay 3+ URLs pendientes**, lanzar agentes en paralelo (Agent tool con `run_in_background`) para maximizar velocidad.
4. **Al terminar**, mostrar tabla resumen:

```
| # | Empresa | Rol | Score | CV PDF | Cover Letter | Acción recomendada |
```

## Formato de pipeline.md

```markdown
## Pendientes
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — Error: login required

## Procesadas
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | CV ✅ | Cover Letter ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | CV ❌ | Cover Letter ❌
```

## Detección inteligente de JD desde URL

1. **Playwright (preferido):** `browser_navigate` + `browser_snapshot`. Funciona con todas las SPAs.
2. **WebFetch (fallback):** Para páginas estáticas o cuando Playwright no está disponible.
3. **WebSearch (último recurso):** Buscar en portales secundarios que indexan el JD.

**Casos especiales:**
- **LinkedIn**: Puede requerir login → marcar `[!]` y pedir al usuario que pegue el texto
- **PDF**: Si la URL apunta a un PDF, leerlo directamente con Read tool
- **`local:` prefix**: Leer el archivo local. Ejemplo: `local:jds/linkedin-pm-ai.md` → leer `jds/linkedin-pm-ai.md`

## Numeración automática

1. Listar todos los archivos en `reports/`
2. Extraer el número del prefijo (e.g., `142-medispend...` → 142)
3. Nuevo número = máximo encontrado + 1

## Sincronización de fuentes

Antes de procesar cualquier URL, verificar sync:
```bash
node cv-sync-check.mjs
```
Si hay desincronización, advertir al usuario antes de continuar.

## Cover Letter PDF

El pipeline debe generar cover letter automaticamente cuando el score final sea >= 3.0, usando el paso correspondiente de `modes/auto-pipeline.md`.

- Markdown fuente: `output/cover-letters/cover-letter-{candidate-slug}-{company-slug}-{YYYY-MM-DD}.md`
- PDF final: `output/cover-letters/cover-letter-{candidate-slug}-{company-slug}-{YYYY-MM-DD}.pdf`
- Comando:

```bash
node generate-cover-letter-pdf.mjs output/cover-letters/cover-letter-{candidate-slug}-{company-slug}-{YYYY-MM-DD}.md output/cover-letters/cover-letter-{candidate-slug}-{company-slug}-{YYYY-MM-DD}.pdf
```

Si falla la exportacion a PDF, conservar el markdown y reportar `Cover Letter pendiente`.
