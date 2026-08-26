# Mik

Your friendly little shop helper for iPhone, Android and the web. Sebu3D is the first shop profile inside Mik.

## What Version 1 does

- Sell products using category icons, real product photos and search
- Accept Cash and GCash
- Deduct stock safely and retain a stock-movement history
- Add stock and record damaged items
- Select daily, weekly or monthly sales reports, including Cash, GCash, items sold, damaged items, cancellations, averages and best sellers
- Choose an exact date from a simple calendar for a daily report and matching Excel export
- See a live Today screen with products sold, quantities, receipt times, payment methods and totals
- View the matching sales list and export its full details as CSV (opens directly in Excel)
- Log in with a simple username and password; the technical email used by Supabase stays hidden
- Require a real photo for new products; let the shared shop team replace photos later

## Deliberately not in Version 1

QR scanning, raw-material tracking, true profit/cost accounting, operating expenses, customer accounts, printer integration and marketplace integrations. The database leaves room for these later, without putting them in front of staff now.

## Technology

- Expo / React Native: one native iOS and Android app plus a responsive web build
- Supabase: separate shop profiles, a platform administrator, Postgres database and secure database functions
- CSV export: generated in-app, with no Excel library required

## Before running

1. Create a Supabase project.
2. Run the files in `supabase/migrations` in number order in the Supabase SQL editor.
3. Deploy the `admin-create-shop` function from `supabase/functions` in the Supabase dashboard or CLI.
4. Copy `.env.example` to `.env` and fill in the project URL and publishable key.
5. Install dependencies with `npm install`.
6. Run the one-time account setup described below.
7. Run `npx expo start`.

Migration `003_shop_profiles_and_platform_admin.sql` creates **Sebu3D** as the first standalone shop profile and imports its workbook catalogue. Every future shop is a separate profile with separate products, stock, sales and reports.

## Initial usernames

Run the following once from a private administrator terminal after migrations 001–005. Get the service-role key from the Supabase project settings and never place it in `.env`, the mobile application or any `EXPO_PUBLIC` variable.

```powershell
$env:SUPABASE_URL='YOUR-SUPABASE-URL'
$env:SUPABASE_SERVICE_ROLE_KEY='YOUR-SERVICE-ROLE-KEY'
npm run setup:accounts
```

This creates or refreshes these requested prototype logins:

- Owner: username `Owner`, starting password `123456`
- Sebu3D: username `sebu3d`, starting password `123456`

Username entry is case-insensitive. The Mik Owner can see every active shop and create a shop together with its username and starting password. Each shop uses one shared team login: the same shop account handles cashier sales, product creation, photos, prices and stock. It sees only its connected shop. Change both starting passwords before any public launch because `123456` is easy to guess.

## Important data note

The workbook contains two price columns. They are stored as **Regular price** and editable **Sale price**. Checkout uses the sale price when present; otherwise it uses the regular price. Old receipts keep the actual price originally charged. Some product stock cells were blank; those are seeded as zero so they cannot be sold until counted.
