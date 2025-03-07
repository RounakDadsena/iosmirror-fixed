import { flags } from '@/entrypoint/utils/targets'; 
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareTitle } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { makeCookieHeader } from '@/utils/cookie';
import { NotFoundError } from '@/utils/errors';

// Define Base URLs
const baseUrl = 'https://netfree.cc/';
const baseUrl2 = 'https://prox-beige.vercel.app/iosmirror.cc:443';

// Define hash before using it
const hash = '1dfd8ce3a45da57b8c55e33a8f8790c4%3A%3A3416517a223480f1f9fe81cc008eb4b3%3A%3A1741327243%3A%3Asu';

const universalScraper = async (ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> => {
  ctx.progress(10);

  const searchRes = await ctx.proxiedFetcher('/search.php', {
    baseUrl: baseUrl2,
    query: { s: ctx.media.title },
    headers: { cookie: makeCookieHeader({ hash, hd: 'on' }) },
  });

  if (searchRes.status !== 'y' || !searchRes.searchResult) throw new NotFoundError(searchRes.error);

  async function getMeta(id: string) {
    return ctx.proxiedFetcher('/post.php', {
      baseUrl: baseUrl2,
      query: { id },
      headers: { cookie: makeCookieHeader({ hash, hd: 'on' }) },
    });
  }

  ctx.progress(30);
  let metaRes;
  let id: string | undefined;

  for (const x of searchRes.searchResult as { id: string; t: string }[]) {
    metaRes = await getMeta(x.id);
    if (
      compareTitle(x.t, ctx.media.title) &&
      (Number(metaRes.year) === ctx.media.releaseYear || metaRes.type === (ctx.media.type === 'movie' ? 'm' : 't'))
    ) {
      id = x.id;
      break;
    }
  }

  if (!id) throw new NotFoundError('No watchable item found');

  const playlistRes = await ctx.proxiedFetcher('/playlist.php?', {
    baseUrl: baseUrl2,
    query: { id: id! },
    headers: { cookie: makeCookieHeader({ hash, hd: 'on' }) },
  });

  ctx.progress(50);
  let autoFile = playlistRes[0].sources.find((source: { file: string; label: string }) => source.label === 'Auto')?.file;
  if (!autoFile) autoFile = playlistRes[0].sources.find((source: { file: string; label: string }) => source.label === 'Full HD')?.file;
  if (!autoFile) autoFile = playlistRes[0].sources[0]?.file;
  if (!autoFile) throw new Error('Failed to fetch playlist');

  const playlist = `https://cors.smashystream.workers.dev/?destination=${encodeURIComponent(`${baseUrl}${autoFile}`)}&headers=${encodeURIComponent(JSON.stringify({ referer: baseUrl, cookie: makeCookieHeader({ hd: 'on' }) }))}`;
  ctx.progress(90);

  return {
    embeds: [],
    stream: [{
      id: 'primary',
      playlist,
      type: 'hls',
      flags: [flags.CORS_ALLOWED],
      captions: [],
    }],
  };
};

// Scraper Initialization
export const iosmirrorScraper = makeSourcerer({
  id: 'iosmirror',
  name: 'NetMirror',
  rank: 182,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: universalScraper,
  scrapeShow: universalScraper,
});
