import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareTitle } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { makeCookieHeader } from '@/utils/cookie';
import { NotFoundError } from '@/utils/errors';

// Define Base URL
const baseUrl = 'https://netfree.cc/';

// Function to fetch Netflix Cookie
const fetchNetflixCookie = async (): Promise<string> => {
  try {
    const response = await fetch('https://anshu78780.github.io/json/cookie.json');
    if (!response.ok) {
      throw new Error('Failed to fetch cookie');
    }
    const data = await response.json();
    return data.netflixCookie.cookie;
  } catch (error: unknown) {
    console.error('Error fetching Netflix cookie:', error);
    throw new Error('Failed to retrieve Netflix cookie');
  }
};

// Function to make request with required headers
const fetchData = async (endpoint: string, signal: AbortSignal): Promise<string> => {
  try {
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
      referrer: 'https://netfree.cc/movies',
      referrerPolicy: 'strict-origin-when-cross-origin',
      body: null,
      signal: signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.text();
  } catch (error: unknown) {
    console.error('Fetch error:', error);
    throw error;
  }
};

// Universal Scraper Function
const universalScraper = async (ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> => {
  ctx.progress(10);

  const searchRes = await fetchData(`/search.php?s=${encodeURIComponent(ctx.media.title)}`, ctx.signal);
  if (!searchRes) throw new NotFoundError('No search results');

  ctx.progress(30);
  const id = 'someExtractedId'; // Replace with actual ID extraction logic

  if (!id) throw new NotFoundError('No watchable item found');

  const playlistRes = await fetchData(`/playlist.php?id=${id}`, ctx.signal);

  ctx.progress(50);

  const autoFile = 'someExtractedFile'; // Replace with actual file extraction logic
  if (!autoFile) throw new Error('Failed to fetch playlist');

  const playlist = `${encodeURIComponent(`${baseUrl}${autoFile}`)}&headers=${encodeURIComponent(JSON.stringify({ referer: baseUrl }))}`;
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
