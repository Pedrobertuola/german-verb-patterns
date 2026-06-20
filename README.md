# German Verb Patterns

PWA mobile-first em React, Vite e TypeScript para treinar padrões vocálicos de verbos alemães.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Fluxo

Cada rodada usa um verbo e passa por Infinitiv, Präteritum, Partizip II e identificação do padrão. Erros entram em revisão e saem apenas depois de 3 ciclos completos corretos. O progresso fica salvo em `localStorage`.
