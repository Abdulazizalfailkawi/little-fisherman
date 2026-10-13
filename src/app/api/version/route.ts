// GET /api/version — the build id of the running deployment. The app compares
// it with the id baked into the loaded JS to offer "update now".

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ id: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
