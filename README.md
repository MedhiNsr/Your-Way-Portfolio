# Your Way

Your Way is a comfort-oriented route assistant designed for people who want to better understand and reduce tunnel exposure during car journeys.

The project started from a simple user problem: traditional navigation tools optimize primarily for time or distance, but do not help users compare routes based on tunnel exposure or perceived comfort.

Your Way explores a different approach by combining routing, geospatial data, tunnel detection and user preferences to make journeys easier to anticipate.

---

## Why this project exists

For users who are uncomfortable with tunnels, a route that is technically "optimal" is not always the most appropriate route.

The product therefore focuses on a different set of questions:

- Which tunnels are present on the route?
- How long are they?
- How long is the estimated crossing time?
- Is there an alternative with lower tunnel exposure?
- How confident is the system in the information presented?
- Can the user make a better-informed choice before departure?

The objective is not to replace a GPS. It is to add a comfort and decision-support layer around route planning.

---

## Current capabilities

The application currently includes:

- route calculation and comparison
- tunnel detection
- tunnel length analysis
- estimated tunnel crossing time
- comfort scoring
- alternative route comparison
- tunnel-free route attempts
- interactive route visualization
- Google Maps / Waze export
- user comfort preferences
- confidence indicators
- a roadmap direction for a tunnel-memory feature (not included in this portfolio snapshot)

---

## Product principles

### 1. Trust before reassurance

Your Way should never claim that a route is tunnel-free when the available data does not justify that conclusion.

When data is incomplete or uncertain, the product should expose that uncertainty rather than hide it.

### 2. User control

The application is designed as a decision-support tool. The user remains in control of the final route choice.

### 3. Explainability

Comfort scores and route recommendations should be understandable from the underlying route and tunnel information.

---

## Solution architecture

At a high level, the application combines routing and geospatial data with in-memory route analysis and browser-based comfort preferences.

```text
User route request
        |
        v
Routing services
(GraphHopper / OpenRouteService)
        |
        v
Route geometry
        |
        +-------------------+
        |                   |
        v                   v
Tunnel data lookup      Route analysis
(OSM / Overpass /       distance, duration,
reference datasets)     alternatives
        |                   |
        +---------+---------+
                  |
                  v
        Tunnel matching & scoring
                  |
                  v
         Comfort-oriented result
                  |
        +---------+---------+
        |                   |
        v                   v
 Interactive map       External navigation
                       Google Maps / Waze
```

This portfolio snapshot does not include user accounts, saved route history or personal tunnel notes. Route inputs are used to request calculations from configured routing providers and are not saved by the application. Comfort preferences remain in the browser.

---

## Data approach

A core challenge of the project is not only calculating routes, but combining route geometry with reliable tunnel information.

The repository includes documentation around:

- OpenStreetMap tunnel data
- import of reference tunnel datasets
- integration of a France-wide tunnel snapshot
- data-quality and coverage considerations

This is important because the quality of the user recommendation directly depends on the quality and completeness of the underlying geographic data.

---

## Technology stack

Current stack:

- TypeScript
- React
- TanStack Start / TanStack Router
- Browser-local comfort preferences
- Leaflet / React Leaflet
- OpenStreetMap
- Overpass API
- GraphHopper
- OpenRouteService
- Vite
- Cloudflare tooling
- Lovable as part of the AI-assisted development workflow

---

## AI-assisted development

Your Way is also a practical experiment in AI-assisted product development.

I do not present this project as the work of a traditional software engineer. My background is business-oriented.

The project was designed, specified and iteratively developed by translating a real user problem into functional requirements, testing solutions, refining the product logic and using AI-assisted development tools to accelerate implementation.

This approach allowed me to work hands-on on:

- product framing
- feature definition
- architecture decisions
- API integration
- data flows
- debugging
- documentation
- iterative delivery

The objective is not to hide the use of AI in development, but to demonstrate how AI-assisted tooling can help a non-traditional technical profile turn a business or user problem into a working product.

---

## My role

I initiated and led the project from the problem definition through the working prototype.

My contribution includes:

- defining the original product problem
- translating user needs into product requirements
- prioritizing features and iterations
- defining the expected user experience
- selecting and testing technical approaches with AI-assisted development
- integrating routing and geographic data sources
- structuring the logic used to compare routes
- reviewing generated code and debugging issues iteratively
- documenting data sources and product behavior

---

## What this project demonstrates

From a product and business-solutions perspective, Your Way demonstrates the ability to:

- identify a specific user problem
- translate that problem into a digital use case
- investigate external data sources
- orchestrate several APIs and datasets
- structure a data flow from raw information to user-facing decision support
- prototype a solution without a traditional software engineering background
- iterate on reliability and explainability instead of focusing only on features
- document a product so that its logic can be understood and challenged

---

## Current limitations

This repository is a portfolio snapshot of an AI-assisted prototype; it is not presented as a production navigation service.

Current limitations include:

- tunnel-data completeness varies by source and geography
- comfort scoring remains a product heuristic, not a clinical or scientific measure
- some alternative-route scenarios depend on third-party routing service capabilities
- the project is not positioned as a safety-critical navigation system
- the planned AI reassurance assistant is not part of the current production feature set

These limitations are intentionally documented because trustworthy AI and data-driven products should make their uncertainty visible.

---

## Roadmap

Potential next steps include:

- tunnel memory journal (future direction; not included in this snapshot)
- personal tunnel notes (future direction; not included in this snapshot)
- community tunnel feedback
- more advanced stress-friendly routing
- AI reassurance assistant
- tunnel photos and previews
- personalized comfort recommendations
- improved tunnel-data confidence scoring
- broader geographic coverage
- monitoring of third-party routing/data-source quality

---

## Repository documentation

Additional technical documentation is available in `/docs`, including material related to:

- OpenStreetMap tunnel data
- CETU data import
- France tunnel snapshot integration

---

## Portfolio walkthrough

The portfolio presentation focuses on three product moments:

1. **Trip preparation**: the user defines a route around a comfort-oriented need rather than only time or distance.
2. **Tunnel exposure analysis**: the result exposes detected tunnels, estimated exposure, longest tunnel, total tunnel time and a confidence indicator.
3. **Route comparison**: alternatives can be compared using duration, distance and tunnel-exposure information so the user can make the final choice.

Exact personal addresses are removed or masked in portfolio screenshots.

## What to discuss in an interview

The key product challenge is not simply route calculation. It is combining third-party routing with imperfect geographic tunnel data while communicating uncertainty clearly. The application therefore treats confidence, explainability and user choice as product requirements rather than hiding data limitations.


## Status

Active personal product project.
