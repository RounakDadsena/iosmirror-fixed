import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareTitle } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { makeCookieHeader } from '@/utils/cookie';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://netfree.cc/';

const fetchNetflixCookie = async (): Promise<string> => {
  try {
    const response = await fetch('https://anshu78780.github.io/json/cookie.json');
    if (!response.ok) throw new Error('Failed to fetch cookie');

    const data = await response.json();
    return data.netflixCookie.cookie;
  } catch (error) {
    console.error('Error fetching Netflix cookie:', error);
    throw new Error('Failed to retrieve Netflix cookie');
  }
};

const fetchData = async (endpoint: string, signal: AbortSignal): Promise<string> => {
  try {
    const cookie = await fetchNetflixCookie();

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9,en-IN;q=0.8',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        Cookie: cookie,
        Referer: `${baseUrl}mobile/movies`,
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document',
      },
      referrerPolicy: 'strict-origin-when-cross-origin',
      signal: signal,
    });

    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

    return await response.text();
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
};

const universalScraper = async (ctx) => {
  const hash = {
    t_hash: 'c5d48c6a6dce8e5ca9288f62f89d75a0::1741083218::ni',
    addhash: '1fc9373765abb7305bc558888d000a32::ec81fe71fe90a9fd3e1eb70faf2925c6::1741160824::ni',
    t_hash_t: '2f636d29a359d65c4d6e657dd018040d::e38f6f3618376ce0e61a0f0964bed333::1741160862::ni',
  };

  ctx.progress(10);

  const searchRes = await fetchData(`/search.php?s=${encodeURIComponent(ctx.media.title)}`, ctx.signal);
  if (!searchRes.includes('searchResult')) throw new NotFoundError('No results found');

  async function getMeta(id) {
    return fetchData(`/post.php?id=${id}`, ctx.signal);
  }

  ctx.progress(30);

  let metaRes;
  let id;

  for (const x of JSON.parse(searchRes).searchResult) {
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
    const seasonId = metaRes?.season.find((x) => Number(x.s) === showMedia.season.number)?.id;
    if (!seasonId) throw new NotFoundError('Season not available');

    const episodeRes = await fetchData(`/episodes.php?s=${seasonId}&series=${id}`, ctx.signal);
    const episodes = JSON.parse(episodeRes).episodes;
    
    const episodeId = episodes.find((x) => x.ep === `E${showMedia.episode.number}` && x.s === `S${showMedia.season.number}`)?.id;

    if (!episodeId) throw new NotFoundError('Episode not available');
    id = episodeId;
  }

  const playlistRes = await fetchData(`/playlist.php?id=${id}`, ctx.signal);
  const playlistData = JSON.parse(playlistRes);

  ctx.progress(50);

  let autoFile = playlistData[0].sources.find((source) => source.label === 'Auto')?.file;
  if (!autoFile) autoFile = playlistData[0].sources.find((source) => source.label === 'Full HD')?.file;
  if (!autoFile) autoFile = playlistData[0].sources[0]?.file;
  if (!autoFile) throw new Error('Failed to fetch playlist');

  const playlist = `${baseUrl}m3u8-proxy?url=${encodeURIComponent(`${baseUrl}${autoFile}`)}&headers=${encodeURIComponent(
    JSON.stringify({ Referer: baseUrl, Cookie: 'hd=on' })
  )}`;

  ctx.progress(90);

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        playlist,
        type: 'hls',
        flags: [flags.CORS_ALLOWED],
        captions: [],
      },
    ],
  };
};

export const iosmirrorScraper = makeSourcerer({
  id: 'iosmirror',
  name: 'NetMirror',
  rank: 182,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: universalScraper,
  scrapeShow: universalScraper,
});

