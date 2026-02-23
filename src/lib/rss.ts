import { getHostUrl } from "./utils";
import type { Episode, Series } from "./storage";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function assemblePendingFeed(seriesId: string, title?: string): string {
  const desc =
    "Henter episoder fra NRK. Prøv å oppdatere på nytt om 30–60 sekunder.";
  const channelTitle = title ? `${escapeXml(title)} (lasting)` : "NRSS";
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
<title>${channelTitle}</title>
<link>https://radio.nrk.no/podkast/${escapeXml(seriesId)}</link>
<description>${escapeXml(desc)}</description>
<ttl>60</ttl>
</channel>
</rss>`;
}

export function assembleFeed(series: Series): string {
  const items = series.episodes
    .map((ep) => {
      const desc = ep.subtitle || "";
      return `<item>
<title>${escapeXml(ep.title)}</title>
<link>${escapeXml(ep.shareLink)}</link>
<description>${escapeXml(desc)}</description>
<itunes:summary>${escapeXml(desc)}</itunes:summary>
<guid isPermaLink="false">${escapeXml(ep.id)}</guid>
<pubDate>${new Date(ep.date).toUTCString()}</pubDate>
<itunes:duration>${ep.durationInSeconds}</itunes:duration>
<podcast:chapters url="${escapeXml(`${getHostUrl()}/api/feeds/${series.id}/${ep.id}/chapters`)}" type="application/json+chapters"/>
<enclosure url="${escapeXml(ep.url)}" length="${ep.durationInSeconds}" type="audio/mpeg3"/>
</item>`;
    })
    .join("\n");

  const imageBlock = series.imageUrl
    ? `<itunes:image href="${escapeXml(series.imageUrl)}"/>
<image>
<url>${escapeXml(series.imageUrl)}</url>
<title>${escapeXml(series.title)}</title>
<link>${escapeXml(series.link)}</link>
</image>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:podcast="https://podcastindex.org/namespace/1.0">
<channel>
<title>${escapeXml(series.title)}</title>
<link>${escapeXml(series.link)}</link>
<itunes:author>NRK</itunes:author>
<itunes:category text="Government"/>
<itunes:owner>
<itunes:name>NRK</itunes:name>
<itunes:email>nrkpodcast@nrk.no</itunes:email>
</itunes:owner>
<description>${escapeXml(series.subtitle || "")}</description>
<ttl>60</ttl>
${imageBlock}
${items}
</channel>
</rss>`;
}
