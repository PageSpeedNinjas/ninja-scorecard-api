// app/api/score/route.js
import { google } from 'googleapis';

const SHEET_ID = process.env.GOOGLE_SHEET_ID; // set in Vercel

// Google Sheets auth (service account JSON must be in Vercel env: GOOGLE_SERVICE_ACCOUNT)
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// CORS headers
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function GET(request) {
  try {
    const reqUrl = new URL(request.url);
    let url = (reqUrl.searchParams.get('url') || '').trim();
    const email = (reqUrl.searchParams.get('email') || '').trim();
    let store = (reqUrl.searchParams.get('store') || '').trim();

    if (!url || !email) {
      return new Response(JSON.stringify({ error: 'Missing URL or email' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Normalize URL (allow users to type example.com)
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    // Derive store hostname if not provided
    if (!store) {
      try {
        store = new URL(url).hostname;
      } catch {
        store = url;
      }
    }

    if (!process.env.PSI_API_KEY) {
      return new Response(JSON.stringify({ error: 'PSI_API_KEY not set' }), {
        status: 500,
        headers: corsHeaders,
      });
    }
    if (!SHEET_ID) {
      return new Response(JSON.stringify({ error: 'GOOGLE_SHEET_ID not set' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Fetch Mobile
    const mobileRes = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
        url
      )}&strategy=mobile&key=${process.env.PSI_API_KEY}`
    );
    const mobileData = await mobileRes.json();
    const mobileScore =
      Math.round((mobileData?.lighthouseResult?.categories?.performance?.score ?? 0) * 100) || 0;

    // Fetch Desktop
    const desktopRes = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
        url
      )}&strategy=desktop&key=${process.env.PSI_API_KEY}`
    );
    const desktopData = await desktopRes.json();
    const desktopScore =
      Math.round((desktopData?.lighthouseResult?.categories?.performance?.score ?? 0) * 100) * 1 || 0;

    // Append to Google Sheet:
    // Sheet: "Ninja Scorecard Leads"
    // Columns: A Timestamp | B Store | C URL | D Email | E Mobile score | F Desktop score
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `'Ninja Scorecard Leads'!A:F`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[new Date().toISOString(), store, url, email, mobileScore, desktopScore]],
        },
      });
    } catch (e) {
      console.error('Sheets append error:', e);
      // continue returning scores even if append fails
    }

    return new Response(JSON.stringify({ mobile: mobileScore, desktop: desktopScore }), {
      headers: corsHeaders,
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

