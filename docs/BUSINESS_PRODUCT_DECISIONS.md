# Business & Product Decisions

This document captures the key decisions behind Your Way. It is intentionally written from a business-solutions and product perspective rather than as low-level technical documentation.

## 1. Start from a real user problem, not from the technology

The project began with a concrete problem: mainstream navigation tools optimize for speed, distance or traffic, but they do not address tunnel-related discomfort.

The first decision was therefore to define the user outcome before selecting the technical stack.

**Decision:** build a comfort-oriented decision-support layer rather than another general-purpose navigation application.

**Why it matters:** the product has a clear user problem, a defined target use case and an explicit reason to exist.

## 2. Do not replace the GPS

A full navigation engine would dramatically increase complexity without solving the core user problem better.

**Decision:** rely on established routing providers for route calculation and focus the application on tunnel analysis, comfort and route comparison.

**Trade-off:** the product depends on third-party routing services, but development effort remains focused on the differentiated value proposition.

## 3. Use several tunnel-data sources

A single data source may be incomplete or inconsistent.

**Decision:** combine OpenStreetMap / Overpass information with locally stored and reference tunnel datasets where available.

**Why it matters:** route recommendations are only as trustworthy as the tunnel information behind them.

**Trade-off:** combining several sources creates additional complexity around matching, enrichment and confidence.

## 4. Make uncertainty visible

For this use case, a false reassurance can be worse than an incomplete answer.

**Decision:** expose confidence and uncertainty rather than claiming certainty when the data does not support it.

**Product principle:** trust before reassurance.

This decision directly influenced the route-audit logic, confidence messaging and the way tunnel-free alternatives are presented.

## 5. Keep the user in control

Your Way is not intended to make an irreversible decision on behalf of the user.

**Decision:** present route information and comfort-oriented comparisons, then let the user choose.

This is a deliberate human-in-the-loop design choice.

## 6. Separate deterministic logic from future AI features

Most of the current product value comes from routing, geospatial matching, scoring and data quality rather than from a generative model.

**Decision:** use deterministic logic for route analysis and avoid adding an LLM simply to label the product as AI.

A future AI reassurance assistant is part of the roadmap, but it should only be introduced where it creates clear user value.

## 7. Build iteratively with AI-assisted development

My background is business-oriented rather than software engineering.

**Decision:** use AI-assisted development tools to accelerate implementation while retaining ownership of product definition, prioritization, architecture choices, testing and validation.

This required learning to:

- express requirements precisely
- decompose a user problem into technical components
- review generated implementations
- test expected behaviour
- diagnose failures
- iterate on architecture and data quality

## 8. Treat data quality as a product feature

Tunnel detection is not only a technical data problem. It directly affects user trust.

**Decision:** invest in data audits, reference imports, spatial matching and confidence logic instead of treating geographic data as an invisible backend concern.

## 9. Keep the portfolio snapshot data-minimal

**Decision:** the portfolio copy does not include saved route history, user accounts or personal tunnel notes. Comfort preferences remain in the browser; route inputs are sent to the configured routing providers for the requested calculation and are not saved by this copy.

**Why it matters:** the project can demonstrate its route-analysis value without retaining personal travel information.


## 10. Current product gaps

The project is intentionally presented with its limitations.

Areas that would require further work before broader production use include:

- stronger observability
- data-quality monitoring
- third-party service fallback strategies
- broader automated testing
- formal load and performance testing
- hardened secrets management
- deployment and operational documentation

## How I would explain this project in an interview

A concise framing:

> I started from a user problem that traditional GPS products do not solve well: route anxiety linked to tunnels. I designed Your Way as a decision-support layer rather than a replacement GPS. The product combines routing providers, OpenStreetMap and reference tunnel datasets, then performs spatial matching, route auditing and comfort scoring. One of the most important product decisions was to expose uncertainty instead of falsely reassuring the user. I used AI-assisted development to turn the idea into a working product, while I remained responsible for the use case, prioritization, architecture decisions, testing and iteration.

The most important point is not that the project contains a specific technology. It is that the solution was built by moving from:

```text
User problem
   ↓
Business / product requirements
   ↓
Data and technology choices
   ↓
Prototype
   ↓
Testing and iteration
   ↓
Working decision-support product
```
