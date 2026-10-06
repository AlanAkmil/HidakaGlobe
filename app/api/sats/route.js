// Proxy data orbit satelit (TLE) dari CelesTrak. Di-cache lama karena
// CelesTrak membatasi unduhan yang terlalu sering.
export const dynamic = "force-dynamic";

const GROUPS = [
  { group: "stations", st: true },
  { group: "visual", st: false },
];

function parseTle(text, st) {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const out = [];
  for (let i = 1; i < lines.length - 1; i += 1) {
    if (lines[i].startsWith("1 ") && lines[i + 1].startsWith("2 ")) {
      out.push({
        name: (lines[i - 1] || "").trim(),
        l1: lines[i],
        l2: lines[i + 1],
        st,
      });
      i += 1;
    }
  }
  return out;
}

export async function GET() {
  const seen = new Set();
  const sats = [];
  let ok = false;
  for (const g of GROUPS) {
    try {
      const res = await fetch(
        `https://celestrak.org/NORAD/elements/gp.php?GROUP=${g.group}&FORMAT=tle`,
        { next: { revalidate: 7200 }, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;
      ok = true;
      for (const s of parseTle(await res.text(), g.st)) {
        const id = s.l1.slice(2, 7);
        if (seen.has(id)) continue;
        seen.add(id);
        sats.push(s);
      }
    } catch (e) {
      /* lanjut ke grup berikutnya */
    }
  }
  if (!ok || sats.length === 0) {
    return Response.json({ error: "data satelit tidak tersedia" }, { status: 502 });
  }
  return Response.json(
    { sats },
    { headers: { "Cache-Control": "public, s-maxage=7200, stale-while-revalidate=3600" } }
  );
}
