# Business & Product Decisions

This document explains the main product decisions behind Your Way and the reasoning used to translate the original user problem into a working digital solution.

## 1. Start from the user problem, not from the technology

The project did not start with the objective of building an AI application.

It started with a concrete problem: standard navigation applications optimize primarily for speed, distance or traffic, while some users need to understand tunnel exposure before choosing a route.

The first product decision was therefore to define a different optimization target: comfort and predictability rather than only travel efficiency.

## 2. Build a decision-support layer instead of replacing navigation apps

A full navigation engine would have created unnecessary complexity.

The chosen approach was to:

1. use existing routing providers for route generation
2. enrich their output with tunnel-related information
3. calculate comfort-oriented indicators
4. help the user compare alternatives
5. export the selected route to an established navigation application

This reduced implementation scope while keeping the user value proposition clear.

## 3. Treat data quality as a product feature

The product relies on geospatial and tunnel data that can vary in completeness.

A deliberate decision was made not to present uncertain data as certain.

This led to:

- confidence-oriented messaging
- route and tunnel audits
- multiple data sources
- local/reference datasets
- explicit documentation of limitations

The business principle is simple: user trust is more valuable than a falsely reassuring answer.

## 4. Use multiple data sources rather than a single source of truth

Tunnel detection is strengthened through a combination of:

- routing-provider geometry
- OpenStreetMap / Overpass information
- local tunnel datasets
- reference data imports
- spatial matching and enrichment logic

This decision increases complexity, but improves the ability to cross-check and enrich route information.

## 5. Keep the user in control

Your Way does not make the final travel decision on behalf of the user.

The system presents:

- tunnel exposure
- estimated crossing information
- alternatives
- comfort indicators
- confidence information

The user decides which route to take.

This human-in-the-loop approach is especially important when the system depends on imperfect external data.

## 6. Make the product explainable

A comfort score is only useful if the user can understand what influenced it.

The product therefore aims to connect recommendations to visible route characteristics such as tunnel count, tunnel length, crossing time and alternative routes.

This avoids creating an opaque recommendation engine.

## 7. Prototype rapidly, then harden reliability

The project was developed iteratively using AI-assisted development.

The working method has been:

1. define the user problem
2. break it into product requirements
3. prototype the smallest useful workflow
4. test with realistic routes
5. identify failure modes
6. add audits, enrichment and confidence logic
7. document the system and its limitations

This illustrates a product-led approach to AI-assisted solution development rather than coding for its own sake.

## 8. Separate deterministic logic from future AI features

The core routing and tunnel-analysis logic is primarily deterministic and data-driven.

AI is used in the development workflow, while more explicitly generative features such as an AI reassurance assistant remain roadmap items.

This was intentional: an LLM is not required for every problem.

A useful AI business solution should distinguish between:

- rules and deterministic processing
- data processing
- external APIs
- machine-learning or generative AI components

The technology choice should follow the use case.

## 9. Design for progressive personalization

Comfort preferences are included in the portfolio snapshot. Tunnel memory remains a future product direction and is not included in this copy.

The longer-term product logic is to move from a generic comfort layer toward personalized recommendations based on user preferences and prior experiences.

This creates a path from a generic route-analysis tool to a more personalized decision-support product.

## 10. What I would change for enterprise-scale production

If this prototype had to become an enterprise-grade service, the next priorities would be:

- formal observability and monitoring
- service-level objectives
- API fallback strategies
- stronger secrets management
- automated data-quality controls
- broader regression and integration tests
- performance and load testing
- privacy review
- formal incident handling
- documented deployment and rollback procedures

## Interview talking points

The project is useful in an interview because it demonstrates a complete chain:

**user problem → use case → architecture → data sourcing → prototype → reliability issues → iteration → documentation**

The strongest points to explain are:

- why an existing GPS was not sufficient for the use case
- why the project enriches routing providers instead of replacing them
- why data uncertainty is surfaced to the user
- how multiple data sources are combined
- where deterministic logic is more appropriate than generative AI
- what would be required to move from prototype to production
- how AI-assisted development enabled faster experimentation without pretending to replace engineering expertise
