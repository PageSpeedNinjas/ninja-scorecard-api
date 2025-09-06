export async function GET() {
  return new Response(JSON.stringify({ message: 'Hello Ninja!' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
