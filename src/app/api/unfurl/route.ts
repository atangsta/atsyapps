import { NextRequest, NextResponse } from "next/server";

function meta(html: string, name: string) {
  const re = (p: string) =>
    new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']+)`, "i");
  return html.match(re(name))?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "No url" }, { status: 400 });

  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 Roam" } });
    const html = await res.text();
    const title =
      meta(html, "og:title") ||
      meta(html, "twitter:title") ||
      html.match(/<title>([^<]+)/i)?.[1] ||
      url;
    const image = meta(html, "og:image") || meta(html, "twitter:image");
    const site =
      meta(html, "og:site_name") ||
      new URL(url).hostname.replace(/^www\./, "");
    return NextResponse.json({ title, image, site });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
