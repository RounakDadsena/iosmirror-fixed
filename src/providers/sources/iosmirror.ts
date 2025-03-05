import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareTitle } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { makeCookieHeader } from '@/utils/cookie';
import { NotFoundError } from '@/utils/errors';

// Define Base URL
const baseUrl = 'https://iosmirror.cc';

// Function to fetch Netflix Cookie
const fetchNetflixCookie = async (): Promise<string> => {
  try {
    const response = await fetch('https://anshu78780.github.io/json/cookie.json');
    if (!response.ok) {
      throw new Error('Failed to fetch cookie');
    }
    const data = await response.json();
    return data.netflixCookie.cookie; // Extract cookie from response
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error fetching Netflix cookie:', error);
      throw new Error('Failed to retrieve Netflix cookie');
    } else {
      throw new Error('An unknown error occurred while fetching the Netflix cookie');
    }
  }
};

// Function to make request with required headers
const fetchData = async (endpoint: string, signal: AbortSignal): Promise<string> => {
  try {
    // Fetch Netflix cookie dynamically
    const cookie = await fetchNetflixCookie();

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'en-US,en;q=0.9,en-IN;q=0.8',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        cookie: cookie,
        priority: 'u=0, i',
        'sec-ch-ua': '"Chromium";v="130", "Microsoft Edge";v="130", "Not?A_Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
      },
      referrer: 'https://iosmirror.cc/movies',
      referrerPolicy: 'strict-origin-when-cross-origin',
      body: null,
      signal: signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.text(); // Adjust to `.json()` if expecting JSON
    console.log('Response:', data);
    return data;
  } catch (error: unknown) {
    console.error('Fetch error:', error);
    throw error;
  }
};

// Universal Scraper Function
const universalScraper = async (ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> => {
  const hash = {
    t_hash: 'c5d48c6a6dce8e5ca9288f62f89d75a0::1741083218::ni',
    addhash: '1fc9373765abb7305bc558888d000a32::ec81fe71fe90a9fd3e1eb70faf2925c6::1741160824::ni',
    t_hash_t: '2f636d29a359d65c4d6e657dd018040d::e38f6f3618376ce0e61a0f0964bed333::1741160862::ni'
  };

  ctx.progress(10);

  const searchRes = await ctx.proxiedFetcher('/search.php', {
    baseUrl: baseUrl, // Use baseUrl instead of baseUrl2
    query: { s: ctx.media.title },
    headers: { cookie: makeCookieHeader({ ...hash, hd: 'on' }) },
  });
  if (searchRes.status !== 'y' || !searchRes.searchResult) throw new NotFoundError(searchRes.error);

  async function getMeta(id: string) {
    return ctx.proxiedFetcher('/post.php', {
      baseUrl: baseUrl, // Use baseUrl instead of baseUrl2
      query: { id },
      headers: { cookie: makeCookieHeader({ ...hash, hd: 'on' }) },
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

  if (ctx.media.type === 'show') {
    metaRes = await getMeta(id);
    const showMedia = ctx.media;
    const seasonId = metaRes?.season.find((x: { s: string; id: string }) => Number(x.s) === showMedia.season.number)?.id;
    if (!seasonId) throw new NotFoundError('Season not available');

    const episodeRes = await ctx.proxiedFetcher('/episodes.php', {
      baseUrl: baseUrl, // Use baseUrl instead of baseUrl2
      query: { s: seasonId, series: id },
      headers: { cookie: makeCookieHeader({ ...hash, hd: 'on' }) },
    });

    let episodes = [...episodeRes.episodes];
    let currentPage = 2;

    while (episodeRes.nextPageShow === 1) {
      const nextPageRes = await ctx.proxiedFetcher('/episodes.php', {
        baseUrl: baseUrl, // Use baseUrl instead of baseUrl2
        query: { s: seasonId, series: id, page: currentPage.toString() },
        headers: { cookie: makeCookieHeader({ ...hash, hd: 'on' }) },
      });
      episodes = [...episodes, ...nextPageRes.episodes];
      episodeRes.nextPageShow = nextPageRes.nextPageShow;
      currentPage++;
    }

    const episodeId = episodes.find(
      (x: { ep: string; s: string; id: string }) => x.ep === `E${showMedia.episode.number}` && x.s === `S${showMedia.season.number}`,
    )?.id;

    if (!episodeId) throw new NotFoundError('Episode not available');
    id = episodeId;
  }

  const playlistRes = await ctx.proxiedFetcher('/playlist.php?', {
    baseUrl: baseUrl, // Use baseUrl instead of baseUrl2
    query: { id: id! }, // Use non-null assertion since 'id' is now guaranteed to be defined
    headers: { cookie: makeCookieHeader({ ...hash, hd: 'on' }) },
  });

  ctx.progress(50);

  let autoFile = playlistRes[0].sources.find((source: { file: string; label: string }) => source.label === 'Auto')?.file;
  if (!autoFile) autoFile = playlistRes[0].sources.find((source: { file: string; label: string }) => source.label === 'Full HD')?.file;
  if (!autoFile) autoFile = playlistRes[0].sources[0]?.file;
  if (!autoFile) throw new Error('Failed to fetch playlist');

  const playlist = `https://prox-beige.vercel.app/m3u8-proxy?url=${encodeURIComponent(`${baseUrl}${autoFile}`)}&headers=${encodeURIComponent(JSON.stringify({ referer: baseUrl, cookie: makeCookieHeader({ hd: 'on' }) }))}`;
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

