# Angular vs Vue vs React — a short note

Written against the `frontend/` app in this repo, which is React 19 + TypeScript
+ Vite + Tailwind. The point of this note is to record *why* React was a
reasonable fit here, not to crown a winner — all three would have shipped this
product.

## The one-line difference

| | What it actually is |
|---|---|
| **React** | A rendering library. Routing, state, forms and HTTP are your choices. |
| **Angular** | A framework. Routing, HTTP, forms, DI and testing ship in the box. |
| **Vue** | A framework with a light core. Router and store are official but opt-in. |

Everything below follows from that sentence. React gives you a small surface and
a large decision budget; Angular gives you a large surface and almost no
decisions; Vue sits deliberately in between.

## At a glance

| | React | Angular | Vue |
|---|---|---|---|
| Language | JS or TS (TS optional) | TypeScript, effectively mandatory | JS or TS |
| Template | JSX — markup inside JavaScript | HTML templates + own syntax | SFC (`.vue`) with `<template>` |
| Reactivity | Explicit — re-render on `setState` | Signals (modern) or zone-based change detection | Proxy-based, tracked automatically |
| Routing | `react-router` (third party) | `@angular/router` (built in) | `vue-router` (official) |
| State | Context, or Redux/Zustand/Jotai | Services + DI, or NgRx | `provide/inject`, or Pinia |
| HTTP | `fetch` / axios, your call | `HttpClient` with interceptors | `fetch` / axios, your call |
| Forms | Controlled inputs by hand, or a library | Reactive Forms, validation included | `v-model`, or VeeValidate |
| DI | None | First-class, central to the design | None |
| CLI | `create-vite`, then you assemble | `ng` scaffolds, builds, tests, upgrades | `create-vue` |
| Learning curve | Small API, many decisions | Large API, few decisions | Gentlest of the three |

## Where each one is genuinely stronger

**React** — the ecosystem. Anything niche has a maintained library, and that
mattered here: `@react-three/fiber` let the 3D venue be written as ordinary
components sharing state with the rest of the app, instead of an imperative
three.js island bolted onto the page. Its escape hatches are also honest; when
we needed a real WebGL camera controller, dropping to `useFrame` and mutating
the camera directly was straightforward.

**Angular** — consistency at scale. Every team member writes the same shapes,
because there's one router, one HTTP client, one forms system. `ng update`
performing automated code migrations across major versions is something neither
other framework matches. On a long-lived product with rotating staff, that
uniformity is worth more than flexibility.

**Vue** — the ratio of power to effort. Single-file components keep template,
logic and scoped styles together, and the reactivity system tracks dependencies
for you, so there is no `useMemo`/`useCallback` bookkeeping and no dependency
arrays to get wrong. It is the fastest of the three to become productive in.

## The costs, stated plainly

**React** hands you the assembly problem. This app needed decisions on routing,
auth storage, data fetching, and a design-token strategy — none of which the
library has an opinion about. Manual memoisation is a real tax: a genuine bug
here was regenerating a 1,500-seat venue plan on every click because selection
was an input to the generator, which Vue's reactivity would likely have made
less tempting to write in the first place.

**Angular** is heavy for something this size. DI, modules or standalone
bootstrapping, RxJS in the HTTP layer — a lot of concepts before the first
screen renders. RxJS in particular is a second language teams must learn.

**Vue** has the smallest ecosystem of the three. For mainstream needs that is a
non-issue, but for the 3D work here the React binding is the most mature option
by a distance.

## Why React for this app

1. **`@react-three/fiber`.** The seat booking view is the core feature, and it
   needed 3D sharing state with normal UI. This is React's strongest niche.
2. **Small surface, small app.** 61 source files across 14 folders. Angular's
   structure pays off well beyond this size; here it would mostly be ceremony.
3. **TypeScript without mandate.** Strict TS by choice rather than obligation.

Had this been an internal admin tool with heavy forms and a large rotating team,
**Angular** would have been the better answer — its Reactive Forms and DI would
have removed most of what we hand-rolled. Had the 3D requirement not existed,
**Vue** would have been an easier build with less boilerplate.

## Rough shape of the same component

**React** — logic and markup in one function, explicit dependencies:

```tsx
function SeatCount({ seats }: { seats: Seat[] }) {
  const free = useMemo(() => seats.filter((s) => s.status !== 'sold').length, [seats])
  return <p>{free} seats available</p>
}
```

**Vue** — same idea, dependencies tracked for you:

```vue
<script setup lang="ts">
const props = defineProps<{ seats: Seat[] }>()
const free = computed(() => props.seats.filter((s) => s.status !== 'sold').length)
</script>

<template><p>{{ free }} seats available</p></template>
```

**Angular** — separate template syntax, signals for derived state:

```ts
@Component({
  selector: 'seat-count',
  standalone: true,
  template: `<p>{{ free() }} seats available</p>`,
})
export class SeatCountComponent {
  seats = input.required<Seat[]>()
  free = computed(() => this.seats().filter((s) => s.status !== 'sold').length)
}
```

## Summary

Pick **React** for ecosystem reach and unusual requirements, and accept that you
own the architecture. Pick **Angular** when uniformity across a big team matters
more than flexibility, and you want batteries included. Pick **Vue** when you
want most of React's model with less ceremony and better ergonomics out of the
box.

For this app the deciding factor was `@react-three/fiber`. Without the 3D venue,
the choice would have been much closer.
