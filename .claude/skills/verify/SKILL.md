---
name: verify
description: Check that a change in Vrtnar compiles, lints, and works in the browser. Use after editing code and before committing.
---

# Verify a change

1. `npm run build` — runs `tsc -b` (strict, `noUnusedLocals`/`noUnusedParameters`) then `vite build`. Must pass; unused imports/vars fail the build.
2. `npm run lint` — fix new errors in files you touched; pre-existing warnings elsewhere can stay.
3. For UI changes, run `npm run dev` and check in the browser:
   - log in, open `/garden`
   - desktop mouse **and** mobile emulation (touch, long press, pinch)
   - no new errors in the console (Supabase errors are logged with `console.error`)
4. Report what was and wasn't verified. There are no automated tests in this repo.
