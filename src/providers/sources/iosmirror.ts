import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareTitle } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

// Define Base URLs
const baseUrl = 'https://netfree.cc/';

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

const universalScraper = async (ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> => {
  const hash = {
    t_hash: 'c5d48c6a6dce8e5ca9288f62f89d75a0::1741083218::ni',
    addhash: '1fc9373765abb7305bc558888d000a32::ec81fe71fe90a9fd3e1eb70faf2925c6::1741160824::ni',
    t_hash_t: '2f636d29a359d65c4d6e657dd018040d::e38f6f3618376ce0e61a0f0964bed333::1741160862::ni'
  };

  ctx.progress(10);

  // Fetch Netflix cookie dynamically
  const cookie = await fetchNetflixCookie();

  const searchRes = await fetch(`${baseUrl}search.php?s=${encodeURIComponent(ctx.media.title)}`, {
    method: 'GET',
    headers: { 
      cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  const searchData = await searchRes.json();

  if (searchData.status !== 'y' || !searchData.searchResult) throw new NotFoundError(searchData.error);

  async function getMeta(id: string) {
    const metaRes = await fetch(`${baseUrl}post.php?id=${id}`, {
      method: 'GET',
      headers: { 
        cookie: cookie,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    return await metaRes.json();
  }

  ctx.progress(30);

  let metaRes;
  let id: string | undefined;

  for (const x of searchData.searchResult as { id: string; t: string }[]) {
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

    const episodesRes = await fetch(`${baseUrl}episodes.php?s=${seasonId}&series=${id}`, {
      method: 'GET',
      headers: { 
        cookie: cookie,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const episodesData = await episodesRes.json();
    let episodes = [...episodesData.episodes];
    let currentPage = 2;

    while (episodesData.nextPageShow === 1) {
      const nextPageRes = await fetch(`${baseUrl}episodes.php?s=${seasonId}&series=${id}&page=${currentPage}`, {
        method: 'GET',
        headers: { 
          cookie: cookie,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      const nextPageData = await nextPageRes.json();
      episodes = [...episodes, ...nextPageData.episodes];
      episodesData.nextPageShow = nextPageData.nextPageShow;
      currentPage++;
    }

    const episodeId = episodes.find(
      (x: { ep: string; s: string; id: string }) => x.ep === `E${showMedia.episode.number}` && x.s === `S${showMedia.season.number}`,
    )?.id;

    if (!episodeId) throw new NotFoundError('Episode not available');
    id = episodeId;
  }

  const playlistRes = await fetch(`${baseUrl}playlist.php?id=${id}`, {
    method: 'GET',
    headers: { 
      cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  const playlistData = await playlistRes.json();

  ctx.progress(50);

  let autoFile = playlistData[0].sources.find((source: { file: string; label: string }) => source.label === 'Auto')?.file;
  if (!autoFile) autoFile = playlistData[0].sources.find((source: { file: string; label: string }) => source.label === 'Full HD')?.file;
  if (!autoFile) autoFile = playlistData[0].sources[0]?.file;
  if (!autoFile) throw new Error('Failed to fetch playlist');

  const playlist = `${baseUrl}${autoFile}`;
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
