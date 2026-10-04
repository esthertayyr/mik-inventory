# VIAE consolidation into MIK

## Boundaries
MIK is the management portal. The VIAE customer website remains public and reads published data from MIK's Supabase project. Pixelbug is not part of this migration. Do not retire ecommerce-api or ecommerce-admin until their data and remaining workflows are migrated and verified.

## Implemented in source, deployment pending
- Owner-only Website entry on VIAE Home.
- Homepage copy editor, compressed photo upload, ordered featured-image carousel.
- Separate Save draft and Publish website actions.
- Public storefront reads published content only, with existing content as fallback.
- Database draft access restricted to the shop owner and platform administrator.
- Existing MIK product publishing is retained.

## Still to migrate or explicitly retire
- Historical products, orders, customers and media from the legacy database. Reconcile counts and totals before switching writes.
- Contact submissions, customer enquiry management and notifications.
- Shipping rates, payment settings and payment-provider callbacks.
- Footer, contact, shipping and legal page editing beyond homepage copy.
- Legacy invoices, quotes, email settings and subscriptions.
- Legacy admin users: map access to MIK roles; do not copy plaintext passwords.
- Review legacy chatbot, AI designer, marketplace, seller applications, blog, services and portfolio tools with the owner before retiring anything.

## Release checks
- MIK typecheck and both production builds.
- Authenticated owner draft save, photo upload and publish on desktop and mobile.
- Anonymous visitor cannot read drafts or write published content.
- Other shops cannot edit VIAE content.
- Publish a temporary test only with explicit approval; restore original data afterward.
- Verify public carousel controls, swipe, reduced motion and empty-content fallback.
- Keep old deployments available for rollback until end-to-end migration passes.
