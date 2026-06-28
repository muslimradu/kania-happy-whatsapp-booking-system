import 'dotenv/config';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const SPREADSHEET_ID        = process.env.GOOGLE_SPREADSHEET_ID!;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
const PRIVATE_KEY           = (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

async function main() {
  const auth = new GoogleAuth({
    credentials: { client_email: SERVICE_ACCOUNT_EMAIL, private_key: PRIVATE_KEY },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties',
  });

  const sheetNames = (res.data.sheets ?? []).map((s) => s.properties?.title ?? '');

  console.log('\n📋 Sheet yang ada di Spreadsheet:\n');
  sheetNames.forEach((name, i) => {
    console.log(`  ${i + 1}. "${name}"`);
  });

  // Bandingkan dengan yang diharapkan
  const expected = [
    'Services', 'Schedule', 'Booking', 'Payment', 'Customer',
    'FAQ', 'Settings', 'Admin Log', 'Broadcast', 'Takeover State',
  ];

  const missing  = expected.filter((e) => !sheetNames.includes(e));
  const extra    = sheetNames.filter((n) => !expected.includes(n));

  if (missing.length > 0) {
    console.log('\n❌ Sheet yang BELUM ADA (harus dibuat):');
    missing.forEach((n) => console.log(`  - "${n}"`));
  }

  if (extra.length > 0) {
    console.log('\n⚠️  Sheet EKSTRA (tidak dikenal sistem):');
    extra.forEach((n) => console.log(`  - "${n}"`));
  }

  if (missing.length === 0) {
    console.log('\n✅ Semua sheet yang diperlukan sudah ada!');
  }

  console.log('');
}

main().catch((err) => {
  console.error('❌ Error:', err?.message ?? err);
  process.exit(1);
});
