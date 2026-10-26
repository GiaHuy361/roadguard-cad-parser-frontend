---
name: roadguard-landing-brand
description: Creates a premium technical product portal for standalone RoadGuard CAD & GIS Studio with accurate supported capabilities, a Launch Studio path, and faithful Hoàng Hải construction logo integration. Use only for separately approved Phase 3 Landing Page work.
---

# RoadGuard Landing & Hoàng Hải Branding Skill — Phase 3 only

## Preconditions
- Do not begin unless Phase 2 has been reviewed and explicitly approved; do not change existing computation, API contracts or frontend studio behavior.
- Product is a standalone engineering tool, not the core RoadGuard management platform. No claim of live sync to a larger system, cloud accounts, paid plans, or unsupported government certification.

## Brand source
- Use `public/brand/hoang-hai-logo-original.png`, the user-supplied Hoàng Hải company logo. Maintain its text/graphics and orange/navy identity. The original image has white background; place on a light round/square surface with generous margin. Do not invert it or redraw as vector without user approval.
- Studio name is `RoadGuard CAD & GIS Studio`; company identity is `CÔNG TY TNHH XÂY DỰNG BÊ TÔNG HOÀNG HẢI`. Product name and company logo must be distinct but harmonized. Avoid implying verified legal ownership beyond the supplied branding.

## Layout
1. Header: logo/company attribution, product wordmark and one primary Launch Studio action.
2. Hero: concise technical value proposition with a visually polished but truthful GIS/CAD motif, and primary `Mở Không Gian Làm Việc` button.
3. Four verified capability cards: DXF parsing; VN-2000 to WGS-84 settings; road geometry & BTXM parameters; GeoJSON and Excel. Check source before publishing each claim.
4. Workflow: Import → Configure → Process/Validate → Export. Be explicit about DXF not DWG unless backend actually supports DWG.
5. Technical assurance/trust: no fabricated stats, no invented precision guarantees. Use transparent note on source CRS, axis order, and engineering review.
6. Compact footer with original logo and navigation.

## Technical behavior
- `/` or `/#overview` opens Landing; `/#studio` opens actual Studio; hard refresh on `/#studio` stays in Studio, browser back/forward work. Preserve in-session state if moving Overview/Studio where technically feasible.
- Semantically correct headings, keyboard navigation, alternate logo text, alt text for meaningful artwork, responsive down to mobile; reduced motion.
- Reuse Phase 2 brand tokens/components. Premium design is clean typography, spacing and content hierarchy; no fake feature screenshot or untrusted mock upload button.

## Acceptance
- No unverified features promoted.
- CTA enters operational Studio with no fake login.
- Logo is intact and readable, maintains original aspect ratio.
- Build and prior phase regression tests pass.
- Desktop/tablet/mobile visual review with screenshots and no new console errors.
- Stop for review before deploy.
